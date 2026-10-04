import { useCallback, useEffect, useRef, useState } from "react"
import { EndSensitivity, GoogleGenAI, Modality, ThinkingLevel, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai"
import { supabase } from "@/lib/supabase"
import { getDemoCallToken } from "@/lib/api"
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config"
import type { CallPhase, TranscriptEntry } from "@/lib/vapi/use-assistant-call"
import { DEFAULT_GEMINI_OPTIONS, GEMINI_MODELS, type GeminiOptions } from "@/lib/gemini/options"
import { loadCaptureWorklet, loadPlaybackWorklet } from "@/lib/gemini/audio-worklets"
import type { Business } from "@/lib/types"

// Spike: the same browser test call as useAssistantCall, but the voice runs on
// Gemini Live instead of Vapi. Same return shape so the demo page can swap
// between them. Tool calls go through the gemini-tool edge function, which
// forwards to the existing Vapi tool endpoints.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const OUT_RATE = 24000
// 40 ms of 16 kHz 16-bit silence, sent instead of mic audio while muted.
const SILENCE_B64 = btoa(String.fromCharCode(...new Uint8Array(1280)))

// Gemini waits silently on a tool call, so have it cover the gap out loud.
const LOOKUP_INSTRUCTION = `# While Looking Things Up
When you are about to call check_availability, book_appointment or capture_lead, say a short filler like "One sec, let me check." immediately before the call, so the caller isn't left in silence. Only say it when you are calling the tool right away. If you still need to ask the caller something first, just ask.`

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("Not signed in")
  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  })
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// Base64 little-endian 16-bit PCM → Float32 samples.
function b64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64)
  const out = new Float32Array(bin.length >> 1)
  for (let i = 0; i < out.length; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    if (v >= 0x8000) v -= 0x10000
    out[i] = v / 0x8000
  }
  return out
}

function closeMessage(code: number, reason: string): string {
  if (/quota|exceeded/i.test(reason)) return "Gemini's free-tier limit was hit. Wait a minute or pick another model."
  if (reason) return `Gemini ended the call: ${reason.slice(0, 140)}`
  return `Gemini ended the call (code ${code}).`
}

type FunctionDecl = { name: string; description: string; parametersJsonSchema: unknown }

export function useGeminiCall() {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [vapiCallId, setVapiCallId] = useState<string | null>(null)

  const sessionRef = useRef<Session | null>(null)
  const cancelledRef = useRef(false)
  const teardownRef = useRef<() => void>(() => {})
  const partialIds = useRef<{ assistant: string | null; user: string | null }>({ assistant: null, user: null })

  useEffect(() => {
    if (phase !== "active") return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => () => teardownRef.current(), [])

  // Gemini streams transcription in fragments; append to the open entry for
  // that role, and close the other role's entry when the speaker changes.
  // Ids are decided outside the state updater so StrictMode's double run
  // can't drop text.
  const appendTranscript = useCallback((role: "assistant" | "user", text: string) => {
    const other = role === "user" ? "assistant" : "user"
    const closing = partialIds.current[other]
    partialIds.current[other] = null
    let id = partialIds.current[role]
    if (!id) {
      id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      partialIds.current[role] = id
    }
    const entryId = id
    setTranscript(prev => {
      const next = closing ? prev.map(e => (e.id === closing ? { ...e, partial: false } : e)) : prev
      return next.some(e => e.id === entryId)
        ? next.map(e => (e.id === entryId ? { ...e, text: e.text + text } : e))
        : [...next, { id: entryId, role, text: text.trimStart(), partial: true }]
    })
  }, [])

  const finalizeTranscript = useCallback(() => {
    partialIds.current = { assistant: null, user: null }
    setTranscript(prev => (prev.some(e => e.partial) ? prev.map(e => (e.partial ? { ...e, partial: false } : e)) : prev))
  }, [])

  const start = useCallback(async (business: Business, opts: GeminiOptions = DEFAULT_GEMINI_OPTIONS) => {
    cancelledRef.current = false
    setError(null)
    setTranscript([])
    setElapsed(0)
    setVapiCallId(null)
    partialIds.current = { assistant: null, user: null }

    // Created synchronously inside the click so the browser lets them play.
    // Created later (after the token fetch and mic prompt) they can start
    // suspended: no sound, and "speaking" never clears.
    const outCtx = new AudioContext({ sampleRate: OUT_RATE })
    const inCtx = new AudioContext()
    void outCtx.resume().catch(() => {})
    void inCtx.resume().catch(() => {})

    let stream: MediaStream | null = null
    let player: AudioWorkletNode | null = null
    let capture: AudioWorkletNode | null = null
    let micSource: MediaStreamAudioSourceNode | null = null
    let micLive = false
    let assistantPlaying = false
    let closed = false

    const teardown = () => {
      if (closed) return
      closed = true
      try { sessionRef.current?.close() } catch { /* already closed */ }
      sessionRef.current = null
      micSource?.disconnect()
      capture?.disconnect()
      player?.disconnect()
      stream?.getTracks().forEach(t => t.stop())
      void inCtx.close().catch(() => {})
      void outCtx.close().catch(() => {})
      setSpeaking(false)
    }
    teardownRef.current = teardown

    const fail = (msg: string) => {
      if (cancelledRef.current) return
      setError(msg)
      setPhase("error")
      teardown()
    }

    try {
      setPhase("preparing")
      const [tokenResp, demoToken] = await Promise.all([authedFetch("gemini-live-token"), getDemoCallToken()])
      if (cancelledRef.current) return
      if (!tokenResp.ok) { fail("Gemini isn't available right now."); return }
      const { token, model: defaultModel } = await tokenResp.json() as { token: string; model: string }
      const model = opts.model || defaultModel

      // With the demo token the bridge skips its own auth and DB lookups.
      const toolHeaders: Record<string, string> = demoToken ? { "x-orvia-demo-token": demoToken } : {}
      // Wake the tool functions now so the first lookup doesn't pay for a cold start.
      void authedFetch("gemini-tool", { method: "POST", headers: toolHeaders, body: JSON.stringify({ tool: "warmup" }) }).catch(() => {})

      const workletsReady = Promise.all([loadCaptureWorklet(inCtx), loadPlaybackWorklet(outCtx)])

      setPhase("mic")
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        fail("Microphone access was blocked. Allow it in your browser's address bar and try again.")
        return
      }
      if (cancelledRef.current) return
      await workletsReady
      if (cancelledRef.current) return

      setPhase("connecting")
      const callId = `gemini-${crypto.randomUUID()}`
      setVapiCallId(callId)

      // Reuse the Vapi config builder so the prompt and tool schemas stay in one place.
      const cfg = buildAssistantConfig(business, SUPABASE_URL) as unknown as {
        model: { systemPrompt: string; tools: Array<{ type: string; function?: { name: string; description: string; parameters: unknown } }> }
        firstMessage: string
      }
      const functionDeclarations: FunctionDecl[] = cfg.model.tools
        .filter(t => t.type === "function" && t.function)
        .map(t => ({ name: t.function!.name, description: t.function!.description, parametersJsonSchema: t.function!.parameters }))

      player = new AudioWorkletNode(outCtx, "orvia-playback")
      player.connect(outCtx.destination)
      player.port.onmessage = (e: MessageEvent<boolean>) => {
        assistantPlaying = e.data
        setSpeaking(e.data)
      }

      const runTool = async (fc: { id?: string; name?: string; args?: Record<string, unknown> }) => {
        try {
          const r = await authedFetch("gemini-tool", {
            method: "POST",
            headers: toolHeaders,
            body: JSON.stringify({ tool: fc.name, args: fc.args ?? {}, call_id: callId, tool_call_id: fc.id }),
          })
          const body = await r.json() as { result?: unknown; error?: string }
          return { id: fc.id, name: fc.name, response: r.ok ? { result: body.result } : { error: body.error ?? "Tool failed" } }
        } catch {
          return { id: fc.id, name: fc.name, response: { error: "Tool failed" } }
        }
      }

      const modelInfo = GEMINI_MODELS.find(m => m.id === model)
      const activity: NonNullable<LiveConnectConfig["realtimeInputConfig"]>["automaticActivityDetection"] = {}
      if (opts.endSensitivity === "high") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_HIGH
      if (opts.endSensitivity === "low") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_LOW
      if (opts.silenceMs > 0) activity.silenceDurationMs = opts.silenceMs

      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `${cfg.model.systemPrompt}\n\n${LOOKUP_INSTRUCTION}\n\n# Opening\nWhen the call connects, say exactly: "${cfg.firstMessage}" and then wait for the caller.`,
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      }
      if (opts.voice) liveConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
      // 3.8 rejects thinkingLevel, so it's only sent to models that accept it.
      if (modelInfo?.supportsThinkingLevel) {
        liveConfig.thinkingConfig = { thinkingLevel: ThinkingLevel[opts.thinkingLevel.toUpperCase() as keyof typeof ThinkingLevel] }
      }
      if (Object.keys(activity).length) liveConfig.realtimeInputConfig = { automaticActivityDetection: activity }

      const ai = new GoogleGenAI({ apiKey: token })
      const session = await ai.live.connect({
        model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            if (cancelledRef.current) return
            setPhase("active")
          },
          onmessage: (msg: LiveServerMessage) => {
            const sc = msg.serverContent
            if (sc?.interrupted) player?.port.postMessage("clear")
            for (const part of sc?.modelTurn?.parts ?? []) {
              if (!part.inlineData?.data) continue
              const samples = b64ToFloat32(part.inlineData.data)
              player?.port.postMessage(samples, [samples.buffer])
            }
            if (sc?.inputTranscription?.text) appendTranscript("user", sc.inputTranscription.text)
            if (sc?.outputTranscription?.text) appendTranscript("assistant", sc.outputTranscription.text)
            if (sc?.turnComplete) { finalizeTranscript(); micLive = true }
            const calls = msg.toolCall?.functionCalls
            if (calls?.length) {
              void Promise.all(calls.map(runTool)).then(functionResponses => {
                if (!closed) sessionRef.current?.sendToolResponse({ functionResponses })
              })
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error("Gemini Live error", e)
            fail("The call dropped. Check your connection and try again.")
          },
          onclose: (e: CloseEvent) => {
            if (closed || cancelledRef.current) return
            if (e.code === 1000) {
              setPhase(p => (p === "error" ? p : "ended"))
              teardown()
              return
            }
            console.warn("Gemini Live closed", e.code, e.reason)
            fail(closeMessage(e.code, e.reason))
          },
        },
      })
      sessionRef.current = session
      if (cancelledRef.current || closed) { session.close(); return }

      // Mic → 16 kHz PCM (resampled in the worklet) → Gemini. Until the
      // greeting finishes nothing is sent: speech during it cancels it. With
      // barge-in off, silence is sent while the assistant talks so it can't
      // hear itself through the speakers.
      micSource = inCtx.createMediaStreamSource(stream)
      capture = new AudioWorkletNode(inCtx, "orvia-capture")
      capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        const s = sessionRef.current
        if (!s || !micLive) return
        const data = !opts.bargeIn && assistantPlaying ? SILENCE_B64 : bytesToB64(new Uint8Array(e.data))
        s.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } })
      }
      // Zero-gain path to the destination keeps the capture node rendering.
      const sink = inCtx.createGain()
      sink.gain.value = 0
      micSource.connect(capture)
      capture.connect(sink).connect(inCtx.destination)

      // Nudge the model to speak first.
      session.sendRealtimeInput({ text: "The caller has just connected. Greet them now." })
      setTimeout(() => { micLive = true }, 8000)
    } catch (e) {
      console.error(e)
      fail("Couldn't start the call. Try again in a moment.")
    }
  }, [appendTranscript, finalizeTranscript])

  const stop = useCallback(() => {
    cancelledRef.current = true
    teardownRef.current()
    setPhase(p => (p === "active" ? "ended" : "idle"))
  }, [])

  const reset = useCallback(() => {
    setPhase("idle")
    setError(null)
    setTranscript([])
    setElapsed(0)
  }, [])

  return { phase, error, transcript, speaking, elapsed, vapiCallId, start, stop, reset }
}
