import { useCallback, useEffect, useRef, useState } from "react"
import { EndSensitivity, GoogleGenAI, Modality, ThinkingLevel, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai"
import { supabase } from "@/lib/supabase"
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config"
import type { CallPhase, TranscriptEntry } from "@/lib/vapi/use-assistant-call"
import { GEMINI_MODELS, type GeminiOptions } from "@/lib/gemini/options"
import type { Business } from "@/lib/types"

// Spike: the same browser test call as useAssistantCall, but the voice runs on
// Gemini Live instead of Vapi. Same return shape so the demo page can swap
// between them. Tool calls go through the gemini-tool edge function, which
// forwards to the existing Vapi tool endpoints.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const IN_RATE = 16000
const OUT_RATE = 24000

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("Not signed in")
  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  })
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// Linear downsample mic float samples to 16 kHz 16-bit PCM.
function toPcm16(input: Float32Array, fromRate: number): Uint8Array {
  const ratio = fromRate / IN_RATE
  const len = Math.floor(input.length / ratio)
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const s = input[i0] + ((input[i0 + 1] ?? input[i0]) - input[i0]) * (pos - i0)
    out[i] = Math.max(-1, Math.min(1, s)) * 0x7fff
  }
  return new Uint8Array(out.buffer)
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
  // that role until the turn completes.
  const appendTranscript = useCallback((role: "assistant" | "user", text: string) => {
    setTranscript(prev => {
      const existing = partialIds.current[role]
      if (existing) return prev.map(e => (e.id === existing ? { ...e, text: e.text + text } : e))
      const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      partialIds.current[role] = id
      return [...prev, { id, role, text, partial: true }]
    })
  }, [])

  const finalizeTranscript = useCallback(() => {
    partialIds.current = { assistant: null, user: null }
    setTranscript(prev => prev.map(e => (e.partial ? { ...e, partial: false } : e)))
  }, [])

  const start = useCallback(async (business: Business, opts?: GeminiOptions) => {
    cancelledRef.current = false
    setError(null)
    setTranscript([])
    setElapsed(0)
    setVapiCallId(null)
    partialIds.current = { assistant: null, user: null }

    let stream: MediaStream | null = null
    let inCtx: AudioContext | null = null
    let outCtx: AudioContext | null = null
    const playing = new Set<AudioBufferSourceNode>()
    let nextStart = 0
    let micLive = false

    const teardown = () => {
      try { sessionRef.current?.close() } catch { /* already closed */ }
      sessionRef.current = null
      playing.forEach(s => { try { s.stop() } catch { /* ended */ } })
      playing.clear()
      stream?.getTracks().forEach(t => t.stop())
      void inCtx?.close().catch(() => {})
      void outCtx?.close().catch(() => {})
      stream = null; inCtx = null; outCtx = null
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
      const tokenResp = await authedFetch("gemini-live-token")
      if (!tokenResp.ok) { fail("Gemini isn't available right now."); return }
      const { token, model: defaultModel } = await tokenResp.json() as { token: string; model: string }
      const model = opts?.model ?? defaultModel
      if (cancelledRef.current) return

      setPhase("mic")
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        fail("Microphone access was blocked. Allow it in your browser's address bar and try again.")
        return
      }
      if (cancelledRef.current) { teardown(); return }

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

      outCtx = new AudioContext({ sampleRate: OUT_RATE })
      inCtx = new AudioContext()

      const playChunk = (b64: string) => {
        if (!outCtx) return
        const pcm = new Int16Array(b64ToBytes(b64).buffer.slice(0))
        const buf = outCtx.createBuffer(1, pcm.length, OUT_RATE)
        const ch = buf.getChannelData(0)
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000
        const src = outCtx.createBufferSource()
        src.buffer = buf
        src.connect(outCtx.destination)
        nextStart = Math.max(nextStart, outCtx.currentTime)
        src.start(nextStart)
        nextStart += buf.duration
        playing.add(src)
        setSpeaking(true)
        src.onended = () => { playing.delete(src); if (playing.size === 0) setSpeaking(false) }
      }

      const interrupt = () => {
        playing.forEach(s => { try { s.stop() } catch { /* ended */ } })
        playing.clear()
        nextStart = 0
        setSpeaking(false)
      }

      const runTool = async (fc: { id?: string; name?: string; args?: Record<string, unknown> }) => {
        try {
          const r = await authedFetch("gemini-tool", {
            method: "POST",
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
      if (opts?.endSensitivity === "high") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_HIGH
      if (opts?.endSensitivity === "low") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_LOW
      if (opts && opts.silenceMs > 0) activity.silenceDurationMs = opts.silenceMs

      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `${cfg.model.systemPrompt}\n\n# Opening\nWhen the call connects, say exactly: "${cfg.firstMessage}" and then wait for the caller.`,
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      }
      if (opts?.voice) liveConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
      // 3.8 rejects thinkingLevel, so it's only sent to models that accept it.
      if (opts && modelInfo?.supportsThinkingLevel) {
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
            if (sc?.interrupted) interrupt()
            for (const part of sc?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) playChunk(part.inlineData.data)
            }
            if (sc?.inputTranscription?.text) appendTranscript("user", sc.inputTranscription.text)
            if (sc?.outputTranscription?.text) appendTranscript("assistant", sc.outputTranscription.text)
            if (sc?.turnComplete) { finalizeTranscript(); micLive = true }
            const calls = msg.toolCall?.functionCalls
            if (calls?.length) {
              void Promise.all(calls.map(runTool)).then(functionResponses => {
                sessionRef.current?.sendToolResponse({ functionResponses })
              })
            }
          },
          onerror: (e: ErrorEvent) => { console.error("Gemini Live error", e); fail("The call dropped. Check your connection and try again.") },
          onclose: (e: CloseEvent) => {
            if (cancelledRef.current) return
            if (e.code !== 1000) console.warn("Gemini Live closed", e.code, e.reason)
            setSpeaking(false)
            setPhase(p => (p === "error" ? p : "ended"))
            teardown()
          },
        },
      })
      sessionRef.current = session
      if (cancelledRef.current) { teardown(); return }

      // Mic → 16 kHz PCM → Gemini. ScriptProcessor is deprecated but fine for a spike.
      const source = inCtx.createMediaStreamSource(stream)
      const proc = inCtx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = e => {
        if (!sessionRef.current || !micLive) return
        const pcm = toPcm16(e.inputBuffer.getChannelData(0), inCtx!.sampleRate)
        sessionRef.current.sendRealtimeInput({ audio: { data: bytesToB64(pcm), mimeType: `audio/pcm;rate=${IN_RATE}` } })
      }
      source.connect(proc)
      proc.connect(inCtx.destination)

      // Nudge the model to speak first.
      session.sendRealtimeInput({ text: "The caller has just connected. Greet them now." })
      // Mic stays muted until the greeting finishes; speech during it cancels the greeting.
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
