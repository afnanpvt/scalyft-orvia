import { useCallback, useEffect, useRef, useState } from "react"
import { EndSensitivity, GoogleGenAI, Modality, ThinkingLevel, type AudioTranscriptionConfig, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai"
import { supabase } from "@/lib/supabase"
import { getDemoCallToken } from "@/lib/api"
import { takeTurnstileToken } from "@/lib/turnstile"
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config"
import type { CallPhase, TranscriptEntry } from "@/lib/vapi/use-assistant-call"
import { DEFAULT_GEMINI_OPTIONS, GEMINI_MODELS, type GeminiOptions } from "@/lib/gemini/options"
import { loadCaptureWorklet, loadPlaybackWorklet } from "@/lib/gemini/audio-worklets"
import { normalizeSlot } from "@/lib/gemini/time"
import { simulateTool, type SpikeBooking } from "@/lib/gemini/spike-calendar"
import type { Business } from "@/lib/types"

// Spike: the same browser test call as useAssistantCall, but the voice runs on
// Gemini Live instead of Vapi. Same return shape so the demo page can swap
// between them. Tool calls are either simulated against the spike calendar
// in the browser, or sent through the gemini-tool edge function to the
// existing Vapi tool endpoints.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const IN_RATE = 16000
const OUT_RATE = 24000
// 40 ms of 16 kHz 16-bit silence, sent instead of mic audio while muted.
const SILENCE_B64 = btoa(String.fromCharCode(...new Uint8Array(1280)))

// Gemini waits silently on a tool call, so have it cover the gap out loud.
const LOOKUP_INSTRUCTION = `# While Looking Things Up
Before you call check_availability, book_appointment or capture_lead, first say a short natural filler out loud, like "One sec, let me check that." Never go silent while a lookup runs.
When you call book_appointment, pass slot exactly as one of the slots_iso values check_availability returned. Never write the time yourself.
check_availability lists only a sample of a day's openings. If the caller wants a part of the day or a time, call it again with part_of_day or after_time. Never tell the caller a day or a time of day is full unless the tool returned no slots for that exact window.

# Ending the Call
When the caller is finished (they say thanks, that's all, or bye), say a short goodbye and then call end_call. Never call end_call while the caller still needs something.`

const END_CALL_TOOL = {
  name: "end_call",
  description: "Hang up. Only after the caller has nothing else and you have said goodbye.",
  parametersJsonSchema: { type: "object", properties: {} },
}

// Hints for the caller-side transcript. Plain English gets both US and
// Indian English since the demo is used from both; other languages get
// their own code plus English, and multilingual is left to auto-detect.
const TRANSCRIPTION_LANGUAGES: Partial<Record<NonNullable<Business["settings"]["language_preference"]>, string[]>> = {
  english: ["en-US", "en-IN"],
  spanish: ["es-US", "en-US"],
  hindi: ["hi-IN", "en-IN"],
  kannada: ["kn-IN", "en-IN"],
  telugu: ["te-IN", "en-IN"],
  tamil: ["ta-IN", "en-IN"],
}
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function transcriptionConfigFor(business: Business): AudioTranscriptionConfig {
  const s = business.settings
  const services = s.service_details?.map(d => d.name) ?? s.services ?? []
  // No business name: callers rarely say it, and the bias made the live
  // transcript hear "Hi" as "Smile Dental Clinic".
  const vocabulary = [s.receptionist_name, ...services, ...WEEKDAYS]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .slice(0, 40)
  const languageCodes = TRANSCRIPTION_LANGUAGES[s.language_preference ?? "english"]
  return { customVocabulary: vocabulary, ...(languageCodes ? { languageCodes } : {}) }
}

function phraseMatcher(phrases: string[]): RegExp | null {
  if (!phrases.length) return null
  const escaped = phrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i")
}

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Guests have no session. They may only mint Gemini tokens, which the edge
// function allows for the public anon key; every other function needs a user.
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session && path !== "gemini-live-token") throw new Error("Not signed in")
  const bearer = session?.access_token ?? ANON_KEY
  // Visitors of the public demo prove they are human with a Turnstile token.
  const captcha = session ? null : await takeTurnstileToken()
  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      apikey: ANON_KEY,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(captcha ? { "x-turnstile-token": captcha } : {}),
    },
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

// Order to fall back through when a model keeps dropping. Extended thinking
// is left out: too slow for a phone call.
const FALLBACK_MODELS = ["gemini-3.8-live", "gemini-3.1-flash-live-preview", "gemini-2.5-flash-native-audio-latest"]

// Streaming speech-to-text. The voice models only send the caller's words
// once they stop talking; this one sends the utterance so far about every
// half second, which drives the word-by-word caller transcript.
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe-live"

async function fetchLiveToken(): Promise<string | null> {
  const r = await authedFetch("gemini-live-token")
  if (!r.ok) return null
  return ((await r.json()) as { token?: string }).token ?? null
}

type FunctionDecl = { name: string; description: string; parametersJsonSchema: unknown }

export function useGeminiCall() {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [vapiCallId, setVapiCallId] = useState<string | null>(null)
  // The model actually serving the call; differs from the chosen one after a fallback.
  const [activeModel, setActiveModel] = useState<string | null>(null)
  // Set when book_appointment succeeds mid-call, so the page can show it right away.
  const [bookedAt, setBookedAt] = useState<number | null>(null)
  // With simulated tools: the booking just written to the spike calendar.
  const [lastBooking, setLastBooking] = useState<SpikeBooking | null>(null)

  const transcriptRef = useRef<TranscriptEntry[]>([])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

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

  // Word-by-word caller text from the transcription session. Each update
  // carries the whole utterance so far, so the bubble's text is replaced, and
  // the bubble keeps updating in place even after the assistant starts replying.
  const callerEntryId = useRef<string | null>(null)
  const setCallerUtterance = useCallback((text: string, final: boolean) => {
    const clean = text.trim()
    let id = callerEntryId.current
    if (!id && !clean) return
    const isNew = !id
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      callerEntryId.current = id
    }
    // A new caller utterance closes the assistant's open bubble.
    const closing = isNew ? partialIds.current.assistant : null
    if (isNew) partialIds.current.assistant = null
    if (final) callerEntryId.current = null
    const entryId = id
    setTranscript(prev => {
      const next = closing ? prev.map(e => (e.id === closing ? { ...e, partial: false } : e)) : prev
      return next.some(e => e.id === entryId)
        ? next.map(e => (e.id === entryId ? { ...e, text: clean, partial: !final } : e))
        : [...next, { id: entryId, role: "user" as const, text: clean, partial: !final }]
    })
  }, [])

  const start = useCallback(async (business: Business, opts: GeminiOptions = DEFAULT_GEMINI_OPTIONS) => {
    cancelledRef.current = false
    setError(null)
    setTranscript([])
    setElapsed(0)
    setVapiCallId(null)
    setActiveModel(null)
    setBookedAt(null)
    setLastBooking(null)
    partialIds.current = { assistant: null, user: null }
    callerEntryId.current = null

    // Created synchronously inside the click so the browser lets them play.
    // Created later (after the token fetch and mic prompt) they can start
    // suspended: no sound, and "speaking" never clears. The mic context runs
    // at 16 kHz so the browser does the resampling, with proper filtering.
    const outCtx = new AudioContext({ sampleRate: OUT_RATE })
    let inCtx = new AudioContext({ sampleRate: IN_RATE })
    void outCtx.resume().catch(() => {})
    void inCtx.resume().catch(() => {})

    let stream: MediaStream | null = null
    let player: AudioWorkletNode | null = null
    let capture: AudioWorkletNode | null = null
    let micSource: MediaStreamAudioSourceNode | null = null
    let transcriber: Session | null = null
    let micLive = false
    let assistantPlaying = false
    let closed = false
    // Real tools only: the call row the booking tool creates must be closed
    // when the call ends, or the dashboard shows "On call" indefinitely.
    let finishInfo: { callId: string; startedAt: number; headers: Record<string, string> } | null = null

    const teardown = () => {
      if (closed) return
      closed = true
      if (finishInfo) {
        const { callId, startedAt, headers } = finishInfo
        finishInfo = null
        void authedFetch("gemini-tool", {
          method: "POST", headers, keepalive: true,
          body: JSON.stringify({ tool: "finish", call_id: callId, args: { duration_secs: (Date.now() - startedAt) / 1000 } }),
        }).catch(() => {})
      }
      try { sessionRef.current?.close() } catch { /* already closed */ }
      sessionRef.current = null
      try { transcriber?.close() } catch { /* already closed */ }
      transcriber = null
      micSource?.disconnect()
      capture?.disconnect()
      player?.disconnect()
      stream?.getTracks().forEach(t => t.stop())
      void inCtx.close().catch(() => {})
      void outCtx.close().catch(() => {})
      setSpeaking(false)
    }
    teardownRef.current = teardown

    // First failure wins, so a specific close reason isn't overwritten by
    // the generic message from the outer catch.
    const fail = (msg: string) => {
      if (cancelledRef.current || closed) return
      setError(msg)
      setPhase("error")
      teardown()
    }

    try {
      setPhase("preparing")
      // Real tools need the demo token for the bridge; the live transcript
      // needs its own single-use Gemini token.
      const liveTools = opts.toolMode === "live"
      const [tokenResp, demoToken, transcriberToken] = await Promise.all([
        authedFetch("gemini-live-token"),
        liveTools ? getDemoCallToken() : Promise.resolve(null),
        opts.liveTranscript ? fetchLiveToken().catch(() => null) : Promise.resolve(null),
      ])
      if (cancelledRef.current) return
      if (!tokenResp.ok) {
        // The server words its refusals for the visitor (captcha, rate limit, daily cap).
        const refusal = await tokenResp.json().then((b: { error?: string }) => b.error).catch(() => undefined)
        fail(refusal || "Gemini isn't available right now.")
        return
      }
      const { token, model: defaultModel } = await tokenResp.json() as { token: string; model: string }
      const model = opts.model || defaultModel

      // With the demo token the bridge skips its own auth and DB lookups.
      const toolHeaders: Record<string, string> = demoToken ? { "x-orvia-demo-token": demoToken } : {}
      // Wake the tool functions now so the first lookup doesn't pay for a cold start.
      if (liveTools) {
        void authedFetch("gemini-tool", { method: "POST", headers: toolHeaders, body: JSON.stringify({ tool: "warmup" }) }).catch(() => {})
      }

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
      if (liveTools) finishInfo = { callId, startedAt: Date.now(), headers: toolHeaders }

      // Reuse the Vapi config builder so the prompt and tool schemas stay in one place.
      const cfg = buildAssistantConfig(business, SUPABASE_URL) as unknown as {
        model: { systemPrompt: string; tools: Array<{ type: string; function?: { name: string; description: string; parameters: unknown } }> }
        firstMessage: string
        endCallPhrases?: string[]
      }
      // check_availability only lists a few slots; these let the agent ask for
      // the part of the day the caller wants instead of guessing.
      const withTimeFilters = (d: FunctionDecl): FunctionDecl => {
        if (d.name !== "check_availability") return d
        const schema = d.parametersJsonSchema as { properties?: Record<string, unknown> }
        return {
          ...d,
          parametersJsonSchema: {
            ...schema,
            properties: {
              ...schema.properties,
              part_of_day: { type: "string", enum: ["morning", "afternoon", "evening"], description: "Only list slots in this part of the day. Use it when the caller prefers one." },
              after_time: { type: "string", description: "Only list slots at or after this time, 24 hour HH:MM, e.g. 15:00." },
            },
          },
        }
      }
      const functionDeclarations: FunctionDecl[] = [
        ...cfg.model.tools
          .filter(t => t.type === "function" && t.function)
          .map(t => withTimeFilters({ name: t.function!.name, description: t.function!.description, parametersJsonSchema: t.function!.parameters })),
        END_CALL_TOOL,
      ]
      // Backup for end_call: the same goodbye phrases the Vapi assistant hangs up on.
      const goodbye = phraseMatcher(cfg.endCallPhrases ?? [])
      let assistantTurnText = ""
      let callerSpoke = false

      // Let the goodbye finish playing, then hang up.
      let hangingUp = false
      const hangUpAfterSpeech = () => {
        if (hangingUp) return
        hangingUp = true
        const started = Date.now()
        let quietSince = 0
        const tick = setInterval(() => {
          if (closed) { clearInterval(tick); return }
          const now = Date.now()
          if (assistantPlaying) quietSince = 0
          else if (!quietSince) quietSince = now
          if ((quietSince && now - quietSince > 700 && now - started > 1500) || now - started > 12000) {
            clearInterval(tick)
            setPhase("ended")
            teardown()
          }
        }, 100)
      }

      player = new AudioWorkletNode(outCtx, "orvia-playback")
      player.connect(outCtx.destination)
      player.port.onmessage = (e: MessageEvent<boolean>) => {
        assistantPlaying = e.data
        setSpeaking(e.data)
      }

      // Every slot offered to the caller this call, for normalizeSlot.
      const offeredSlots: string[] = []
      const rememberOffered = (result: unknown) => {
        const iso = (result as { slots_iso?: unknown } | undefined)?.slots_iso
        if (Array.isArray(iso)) offeredSlots.push(...iso.filter((s): s is string => typeof s === "string"))
      }
      const timezone = business.timezone || "America/Chicago"

      const runTool = async (fc: { id?: string; name?: string; args?: Record<string, unknown> }) => {
        let args = fc.args ?? {}
        if (fc.name === "book_appointment" && typeof args.slot === "string") {
          const slot = normalizeSlot(args.slot, timezone, offeredSlots)
          if (slot !== args.slot) console.info("Gemini slot normalized", args.slot, "→", slot)
          args = { ...args, slot }
        }
        // Simulated: answered instantly from the spike calendar, no network.
        if (!liveTools) {
          const { result, booking } = simulateTool(fc.name, args, business)
          rememberOffered(result)
          if (booking) setLastBooking(booking)
          return { id: fc.id, name: fc.name, response: { result } }
        }
        try {
          const r = await authedFetch("gemini-tool", {
            method: "POST",
            headers: toolHeaders,
            body: JSON.stringify({ tool: fc.name, args, call_id: callId, tool_call_id: fc.id }),
          })
          const body = await r.json() as { result?: unknown; error?: string }
          rememberOffered(body.result)
          if (fc.name === "book_appointment" && r.ok && (body.result as { success?: boolean } | undefined)?.success) {
            setBookedAt(Date.now())
          }
          return { id: fc.id, name: fc.name, response: r.ok ? { result: body.result } : { error: body.error ?? "Tool failed" } }
        } catch {
          return { id: fc.id, name: fc.name, response: { error: "Tool failed" } }
        }
      }

      const activity: NonNullable<LiveConnectConfig["realtimeInputConfig"]>["automaticActivityDetection"] = {}
      if (opts.endSensitivity === "high") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_HIGH
      if (opts.endSensitivity === "low") activity.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_LOW
      if (opts.silenceMs > 0) activity.silenceDurationMs = opts.silenceMs

      const configFor = (modelId: string): LiveConnectConfig => {
        const c: LiveConnectConfig = {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `${cfg.model.systemPrompt}\n\n${LOOKUP_INSTRUCTION}\n\n# Opening\nWhen the call connects, say exactly: "${cfg.firstMessage}" and then wait for the caller.`,
          tools: [{ functionDeclarations }],
          inputAudioTranscription: transcriptionConfigFor(business),
          outputAudioTranscription: {},
        }
        if (opts.voice) c.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
        // 3.8 rejects thinkingLevel, so it's only sent to models that accept it.
        if (GEMINI_MODELS.find(m => m.id === modelId)?.supportsThinkingLevel) {
          c.thinkingConfig = { thinkingLevel: ThinkingLevel[opts.thinkingLevel.toUpperCase() as keyof typeof ThinkingLevel] }
        }
        if (Object.keys(activity).length) c.realtimeInputConfig = { automaticActivityDetection: activity }
        return c
      }

      // Each socket gets a generation number so callbacks from a dropped
      // socket are ignored once a replacement is open.
      let generation = 0
      let resumeHandle: string | null = null
      let reconnects = 0
      let dropsOnModel = 0
      let activeModel = model
      const untried = FALLBACK_MODELS.filter(m => m !== model)
      setActiveModel(model)

      const openSession = async (apiKey: string, handle: string | null) => {
        const gen = ++generation
        const ai = new GoogleGenAI({ apiKey })
        const session = await ai.live.connect({
          model: activeModel,
          config: { ...configFor(activeModel), sessionResumption: handle ? { handle } : {} },
          callbacks: {
            onopen: () => {
              if (cancelledRef.current) return
              setPhase("active")
            },
            onmessage: (msg: LiveServerMessage) => {
              // Once hanging up, only the goodbye already queued gets played.
              if (gen !== generation || hangingUp) return
              // No tool response for end_call: answering it makes the model
              // announce "the call has been ended" out loud.
              if (msg.toolCall?.functionCalls?.some(c => c.name === "end_call")) {
                hangUpAfterSpeech()
                return
              }
              const update = msg.sessionResumptionUpdate
              if (update?.resumable && update.newHandle) resumeHandle = update.newHandle
              const sc = msg.serverContent
              if (sc?.interrupted) player?.port.postMessage("clear")
              for (const part of sc?.modelTurn?.parts ?? []) {
                if (!part.inlineData?.data) continue
                const samples = b64ToFloat32(part.inlineData.data)
                player?.port.postMessage(samples, [samples.buffer])
              }
              if (sc?.inputTranscription?.text) {
                callerSpoke = true
                // The live transcript session owns caller text while it runs.
                if (!transcriber) appendTranscript("user", sc.inputTranscription.text)
              }
              if (sc?.outputTranscription?.text) {
                assistantTurnText += sc.outputTranscription.text
                appendTranscript("assistant", sc.outputTranscription.text)
              }
              if (sc?.turnComplete) {
                finalizeTranscript()
                micLive = true
                dropsOnModel = 0
                // Hang up on a goodbye even if the model forgot to call end_call.
                if (callerSpoke && goodbye?.test(assistantTurnText)) hangUpAfterSpeech()
                assistantTurnText = ""
              }
              const calls = msg.toolCall?.functionCalls
              if (calls?.length) {
                void Promise.all(calls.map(runTool)).then(functionResponses => {
                  if (!closed && gen === generation) sessionRef.current?.sendToolResponse({ functionResponses })
                })
              }
            },
            // A close event always follows; recovery is handled there.
            onerror: (e: ErrorEvent) => console.error("Gemini Live error", e),
            onclose: (e: CloseEvent) => {
              if (closed || cancelledRef.current || gen !== generation) return
              if (e.code === 1000) {
                setPhase(p => (p === "error" ? p : "ended"))
                teardown()
                return
              }
              void recover(e.code, e.reason)
            },
          },
        })
        if (closed || cancelledRef.current || gen !== generation) { session.close(); return null }
        sessionRef.current = session
        return session
      }

      // Gemini's preview models drop sessions now and then (1011 "Internal
      // error encountered"), and sometimes a model fails on every turn for a
      // while. First drop: resume the same conversation on the same model.
      // Second drop in a row: move to the next model and hand it the
      // transcript so far. Quota and rejected-settings closes aren't retried.
      const recover = async (code: number, reason: string) => {
        console.warn("Gemini Live closed", code, reason, "on", activeModel)
        sessionRef.current = null
        const retryable = !/quota|exceeded/i.test(reason) && code !== 1007 && code !== 1008
        if (!retryable || reconnects >= 4) { fail(closeMessage(code, reason)); return }
        reconnects++
        dropsOnModel++
        const resumeSameModel = dropsOnModel === 1 && !!resumeHandle
        if (!resumeSameModel) {
          const next = untried.shift()
          if (!next) { fail(closeMessage(code, reason)); return }
          console.warn(`Switching Gemini model: ${activeModel} → ${next}`)
          activeModel = next
          resumeHandle = null // handles only work on the model that issued them
          dropsOnModel = 0
          setActiveModel(next)
        }
        try {
          const r = await authedFetch("gemini-live-token")
          if (!r.ok) throw new Error(`gemini-live-token ${r.status}`)
          const { token: fresh } = await r.json() as { token: string }
          if (closed || cancelledRef.current) return
          const s = await openSession(fresh, resumeSameModel ? resumeHandle : null)
          if (s && !resumeSameModel) {
            // A fresh session has no memory of the call, so replay it.
            const recap = transcriptRef.current
              .map(e => `${e.role === "user" ? "Caller" : "You"}: ${e.text}`)
              .join("\n")
            s.sendRealtimeInput({
              text: recap
                ? `The line dropped and you've been reconnected. The conversation so far:\n${recap}\n\nDon't greet again. Briefly apologize for the interruption and carry on. If the caller's last request isn't above, ask them to repeat it.`
                : "The caller has just connected. Greet them now.",
            })
            micLive = true
          }
        } catch (err) {
          console.error(err)
          fail(closeMessage(code, reason))
        }
      }

      const session = await openSession(token, null)
      if (!session) return

      // Live caller transcript: a second, text-only session fed the same mic
      // audio. Not awaited, so a slow or failed connect never delays the call;
      // without it, caller text falls back to the voice model's per-sentence
      // transcription.
      if (transcriberToken) {
        void new GoogleGenAI({ apiKey: transcriberToken }).live.connect({
          model: TRANSCRIBE_MODEL,
          config: { responseModalities: [Modality.TEXT], inputAudioTranscription: transcriptionConfigFor(business) },
          callbacks: {
            onmessage: (msg: LiveServerMessage) => {
              const sc = msg.serverContent
              if (sc?.interimInputTranscription?.text) setCallerUtterance(sc.interimInputTranscription.text, false)
              if (sc?.inputTranscription?.text) setCallerUtterance(sc.inputTranscription.text, true)
            },
            onerror: (e: ErrorEvent) => console.warn("Live transcript error", e),
            onclose: (e: CloseEvent) => {
              if (!closed) console.warn("Live transcript closed; using per-sentence transcript", e.code, e.reason)
              transcriber = null
            },
          },
        }).then(t => {
          if (closed) t.close()
          else transcriber = t
        }).catch(e => console.warn("Live transcript unavailable", e))
      }

      // Mic → 16 kHz PCM → Gemini. The 16 kHz context lets the browser
      // resample with filtering; decimating 48 kHz audio by hand folds hiss
      // and "s" sounds into the speech band and garbles the transcript.
      // Firefox can't connect a mic to a context at a different rate, so it
      // falls back to the device rate with a low-pass ahead of the worklet.
      let micInput: AudioNode
      try {
        micSource = inCtx.createMediaStreamSource(stream)
        micInput = micSource
      } catch {
        void inCtx.close().catch(() => {})
        inCtx = new AudioContext()
        await loadCaptureWorklet(inCtx)
        micSource = inCtx.createMediaStreamSource(stream)
        const lowpass = inCtx.createBiquadFilter()
        lowpass.type = "lowpass"
        lowpass.frequency.value = 7000
        micSource.connect(lowpass)
        micInput = lowpass
      }
      // Until the greeting finishes nothing is sent: speech during it cancels
      // it. With barge-in off, silence is sent while the assistant talks so it
      // can't hear itself through the speakers.
      capture = new AudioWorkletNode(inCtx, "orvia-capture")
      capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!micLive) return
        const data = !opts.bargeIn && assistantPlaying ? SILENCE_B64 : bytesToB64(new Uint8Array(e.data))
        const audio = { data, mimeType: "audio/pcm;rate=16000" }
        sessionRef.current?.sendRealtimeInput({ audio })
        transcriber?.sendRealtimeInput({ audio })
      }
      // Zero-gain path to the destination keeps the capture node rendering.
      const sink = inCtx.createGain()
      sink.gain.value = 0
      micInput.connect(capture)
      capture.connect(sink).connect(inCtx.destination)

      // Nudge the model to speak first.
      session.sendRealtimeInput({ text: "The caller has just connected. Greet them now." })
      setTimeout(() => { micLive = true }, 8000)
    } catch (e) {
      console.error(e)
      fail("Couldn't start the call. Try again in a moment.")
    }
  }, [appendTranscript, finalizeTranscript, setCallerUtterance])

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

  return { phase, error, transcript, speaking, elapsed, vapiCallId, activeModel, bookedAt, lastBooking, start, stop, reset }
}
