import { useCallback, useEffect, useRef, useState } from "react"
import Vapi from "@vapi-ai/web"
import type { CreateAssistantDTO } from "@vapi-ai/web/dist/api"
import { getDemoCallToken } from "@/lib/api"
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config"
import type { Business } from "@/lib/types"

// One browser test call, with every stage surfaced so the UI never looks
// frozen: preparing → microphone → connecting → active → ended. Cancel works
// at any stage — including mid-connect, before Vapi has answered.

export type CallPhase = "idle" | "preparing" | "mic" | "connecting" | "active" | "ended" | "error"

export interface TranscriptEntry {
  id: string
  role: "assistant" | "user"
  text: string
  partial: boolean
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export function useAssistantCall() {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [vapiCallId, setVapiCallId] = useState<string | null>(null)

  const vapiRef = useRef<Vapi | null>(null)
  const cancelledRef = useRef(false)
  const partialIds = useRef<{ assistant: string | null; user: string | null }>({ assistant: null, user: null })

  useEffect(() => {
    if (phase !== "active") return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => () => { vapiRef.current?.stop() }, [])

  const upsertTranscript = useCallback((role: "assistant" | "user", text: string, final: boolean) => {
    setTranscript(prev => {
      const existing = partialIds.current[role]
      if (final) partialIds.current[role] = null
      if (existing) return prev.map(e => (e.id === existing ? { ...e, text, partial: !final } : e))
      const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      if (!final) partialIds.current[role] = id
      return [...prev, { id, role, text, partial: !final }]
    })
  }, [])

  const start = useCallback(async (business: Business, publicKey: string) => {
    cancelledRef.current = false
    setError(null)
    setTranscript([])
    setElapsed(0)
    setVapiCallId(null)
    partialIds.current = { assistant: null, user: null }

    try {
      setPhase("preparing")
      const demoToken = await getDemoCallToken()
      if (cancelledRef.current) return

      // Ask for the mic ourselves first so the "allow microphone" moment is
      // an explicit step with a clear error, not a silent hang.
      setPhase("mic")
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch {
        if (cancelledRef.current) return
        setError("Microphone access was blocked. Allow it in your browser's address bar and try again.")
        setPhase("error")
        return
      }
      if (cancelledRef.current) return

      setPhase("connecting")
      const vapi = new Vapi(publicKey)
      vapiRef.current = vapi
      vapi.on("call-start", () => { if (!cancelledRef.current) setPhase("active") })
      vapi.on("call-end", () => { setSpeaking(false); setPhase(p => (p === "error" ? p : "ended")) })
      vapi.on("speech-start", () => setSpeaking(true))
      vapi.on("speech-end", () => setSpeaking(false))
      vapi.on("error", (e: unknown) => {
        console.error("Assistant call error", e)
        if (cancelledRef.current) return
        setError("The call dropped. Check your connection and try again.")
        setPhase("error")
      })
      vapi.on("message", (message: unknown) => {
        const m = message as { type?: string; role?: "assistant" | "user"; transcriptType?: string; transcript?: string }
        if (m?.type !== "transcript" || !m.role || typeof m.transcript !== "string") return
        upsertTranscript(m.role, m.transcript, m.transcriptType === "final")
      })

      const call = await vapi.start(
        buildAssistantConfig(business, SUPABASE_URL, { demoToken }) as unknown as CreateAssistantDTO,
      )
      if (cancelledRef.current) { vapi.stop(); return }
      if (call?.id) setVapiCallId(call.id)
    } catch (e) {
      console.error(e)
      if (cancelledRef.current) return
      setError("Couldn't start the call. Try again in a moment.")
      setPhase("error")
    }
  }, [upsertTranscript])

  // Ends a live call, or abandons one that's still connecting.
  const stop = useCallback(() => {
    cancelledRef.current = true
    vapiRef.current?.stop()
    vapiRef.current = null
    setSpeaking(false)
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
