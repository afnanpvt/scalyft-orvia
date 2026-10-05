import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  PhoneCall, PhoneOff, Loader2, Mic, CalendarCheck2, CalendarSearch, MessageSquareText, BellRing,
  Clock, RotateCcw, FastForward, PhoneIncoming, Volume2, X,
} from "lucide-react"

import { getBusinessSettings, getActiveVapiPublicKey, getAppointmentByVapiCallId } from "@/lib/api"
import { useGeminiCall } from "@/lib/gemini/use-gemini-call"
import { DEFAULT_GEMINI_OPTIONS, loadGeminiOptions, saveGeminiOptions, type GeminiOptions } from "@/lib/gemini/options"
import { useGuestNiche } from "@/lib/guest/session"
import { recordGuestCall } from "@/lib/guest/data"
import { GeminiSettings } from "@/components/dashboard/gemini-settings"
import { SpikeCalendar } from "@/components/dashboard/spike-calendar"
import { useAssistantCall, type CallPhase, type TranscriptEntry } from "@/lib/vapi/use-assistant-call"
import { OrviaLogo } from "@/components/brand/orvia-logo"
import { useTheme } from "@/lib/theme"
import type { Appointment } from "@/lib/types"

const ENV_VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined

// ─── Types ───────────────────────────────────────────────

type CallState = "idle" | "connecting" | "active" | "ended" | "error"

type ReminderState = "idle" | "ringing" | "connected" | "done"

// ─── Helpers ─────────────────────────────────────────────

function formatClock(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  })
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Orb ─────────────────────────────────────────────────

function CallOrb({ state, speaking }: { state: CallState; speaking: boolean }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const color = state === "active" ? "#10B981" : state === "connecting" ? "#F59E0B" : state === "error" ? "#E5484D" : "var(--muted-foreground)"
  const pulsing = state === "connecting" || state === "active"

  return (
    <div style={{ position: "relative", width: 132, height: 132, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {pulsing && (
        <>
          <span className="demo-orb-ring" style={{ animationDelay: "0s", borderColor: color }} />
          <span className="demo-orb-ring" style={{ animationDelay: "0.7s", borderColor: color }} />
          <span className="demo-orb-ring" style={{ animationDelay: "1.4s", borderColor: color }} />
        </>
      )}
      <div style={{
        position: "relative", zIndex: 1,
        width: 96, height: 96, borderRadius: "50%",
        background: isDark
          ? `radial-gradient(circle at 35% 30%, ${color}33, var(--card) 70%)`
          : `radial-gradient(circle at 35% 30%, ${color}22, #fff 70%)`,
        border: `1.5px solid ${color}55`,
        boxShadow: state === "active"
          ? `0 0 0 6px ${color}14, 0 8px 32px ${color}22`
          : "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "box-shadow 0.3s ease",
      }}>
        {state === "connecting" ? (
          <Loader2 style={{ width: 30, height: 30, color }} className="animate-spin" strokeWidth={1.75} />
        ) : (
          <OrviaLogo
            size={44}
            style={{
              color,
              transform: speaking ? "scale(1.08)" : "scale(1)",
              transition: "transform 0.15s ease",
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Transcript ──────────────────────────────────────────

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isAssistant = entry.role === "assistant"
  return (
    <div style={{
      display: "flex",
      justifyContent: isAssistant ? "flex-start" : "flex-end",
      padding: "3px 0",
    }}>
      <div style={{
        maxWidth: "78%",
        padding: "9px 13px",
        borderRadius: isAssistant ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
        background: isAssistant
          ? "var(--muted)"
          : "var(--foreground)",
        color: isAssistant ? "var(--foreground)" : "var(--background)",
        fontSize: 13.5,
        lineHeight: 1.45,
        letterSpacing: "-0.01em",
        opacity: entry.partial ? 0.55 : 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}>
        {entry.text || <span style={{ opacity: 0.5 }}>…</span>}
      </div>
    </div>
  )
}

function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [entries])

  return (
    <div className="ios-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: 380 }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <MessageSquareText style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} strokeWidth={1.75} />
        <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Live Transcript</p>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {entries.length === 0 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Transcript will appear here once the call starts</p>
          </div>
        ) : (
          entries.map(e => <TranscriptBubble key={e.id} entry={e} />)
        )}
      </div>
    </div>
  )
}

// ─── Booking confirmation ────────────────────────────────

interface BookedNotice { id: string; name: string; service: string; start: string }

// Pops over the page the moment a booking lands, then clears itself.
// `timeZone` is the clinic's, so the time matches what the caller was told.
function BookedPopup({ booking, timeZone, onClose }: { booking: BookedNotice; timeZone?: string; onClose: () => void }) {
  const time = new Date(booking.start).toLocaleString("en-US", {
    timeZone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  return (
    <div style={{ position: "fixed", top: 20, left: 0, right: 0, zIndex: 60, display: "flex", justifyContent: "center", padding: "0 16px", pointerEvents: "none" }}>
      <div role="status" aria-live="polite" className="ios-card animate-fade-up" style={{
        pointerEvents: "auto", width: "100%", maxWidth: 420, padding: "14px 14px 14px 16px",
        display: "flex", alignItems: "center", gap: 12,
        borderColor: "rgba(16,185,129,0.35)", boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CalendarCheck2 style={{ width: 18, height: 18, color: "#059669" }} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Appointment booked</p>
          <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2, letterSpacing: "-0.01em" }}>
            {booking.name} · {booking.service}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--foreground)", marginTop: 1, letterSpacing: "-0.01em" }}>{time}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" style={{
          width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent",
          color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

function BookingConfirmationCard({ appointment }: { appointment: Appointment }) {
  const time = new Date(appointment.scheduled_start).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  return (
    <div className="ios-card animate-fade-up" style={{ padding: 18, borderColor: "rgba(16,185,129,0.25)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CalendarCheck2 style={{ width: 17, height: 17, color: "#059669" }} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
            Appointment booked
          </p>
          <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2, letterSpacing: "-0.01em" }}>
            {appointment.customer_name} · {appointment.service_type ?? "Service"} · {time}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
              background: "#D1FAE5", color: "#065F46", border: "1px solid rgba(16,185,129,0.2)",
            }}>
              ✓ Saved to dashboard
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
              background: appointment.google_cal_event_id ? "#D1FAE5" : "var(--muted)",
              color: appointment.google_cal_event_id ? "#065F46" : "var(--muted-foreground)",
              border: `1px solid ${appointment.google_cal_event_id ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
            }}>
              {appointment.google_cal_event_id ? "✓ Synced to Google Calendar" : "○ Google Calendar not connected"}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
              background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)",
            }}>
              ✓ Confirmation SMS sent (if configured)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Time machine ────────────────────────────────────────

function TimeMachineCard({
  appointment, simulatedNow, onSetOffset, onReset, reminderState,
}: {
  appointment: Appointment
  simulatedNow: Date
  onSetOffset: (target: Date) => void
  onReset: () => void
  reminderState: ReminderState
}) {
  const [customInput, setCustomInput] = useState(() => toDatetimeLocalValue(simulatedNow))
  const apptTime = new Date(appointment.scheduled_start)
  const reminderAt = new Date(apptTime.getTime() - 30 * 60 * 1000)
  const msToReminder = reminderAt.getTime() - simulatedNow.getTime()
  const isLive = Math.abs(simulatedNow.getTime() - Date.now()) < 1500

  function jumpToReminder() {
    // Land 5 seconds after the threshold so the effect reliably fires.
    onSetOffset(new Date(reminderAt.getTime() + 5000))
  }

  return (
    <div className="ios-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Clock style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} strokeWidth={1.75} />
        <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          Time Machine
        </p>
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
          background: isLive ? "var(--muted)" : "#FEF3C7",
          color: isLive ? "var(--muted-foreground)" : "#92400E",
          letterSpacing: "0.02em",
        }}>
          {isLive ? "REAL TIME" : "SIMULATED"}
        </span>
      </div>

      <p style={{
        fontFamily: "Geist Mono, monospace", fontSize: 20, fontWeight: 600,
        color: "var(--foreground)", letterSpacing: "-0.02em", marginBottom: 4,
      }}>
        {formatClock(simulatedNow)}
      </p>
      <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginBottom: 16, letterSpacing: "-0.01em" }}>
        {reminderState === "done"
          ? "Reminder call already simulated for this appointment"
          : msToReminder > 0
            ? `Reminder call fires in ${Math.ceil(msToReminder / 60000)} min (30 min before the appointment)`
            : "Reminder window reached"}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={jumpToReminder}
          disabled={reminderState !== "idle"}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 10,
            background: "var(--foreground)", color: "var(--background)", border: "none",
            cursor: reminderState !== "idle" ? "not-allowed" : "pointer",
            opacity: reminderState !== "idle" ? 0.4 : 1,
          }}>
          <FastForward style={{ width: 12, height: 12 }} strokeWidth={2} />
          Jump to 30 min before
        </button>
        <button type="button" onClick={onReset}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 10,
            background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)",
            cursor: "pointer",
          }}>
          <RotateCcw style={{ width: 12, height: 12 }} strokeWidth={2} />
          Reset to real time
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="datetime-local"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          style={{
            flex: 1, fontSize: 12.5, padding: "7px 10px", borderRadius: 9,
            border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)",
            fontFamily: "inherit",
          }}
        />
        <button type="button"
          onClick={() => { const d = new Date(customInput); if (!isNaN(d.getTime())) onSetOffset(d) }}
          style={{
            fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 9,
            background: "var(--muted)", color: "var(--foreground)", border: "1px solid var(--border)",
            cursor: "pointer",
          }}>
          Set
        </button>
      </div>
    </div>
  )
}

// ─── Reminder call overlay ───────────────────────────────

function ReminderCallOverlay({
  appointment, state, onAnswer, onDecline, onClose, speakingCaption,
}: {
  appointment: Appointment
  state: ReminderState
  onAnswer: () => void
  onDecline: () => void
  onClose: () => void
  speakingCaption: string
}) {
  if (state === "idle" || state === "done") return null

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(10,10,11,0.72)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="animate-scale-in" style={{
        width: 340, borderRadius: 28, overflow: "hidden",
        background: "linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)",
        boxShadow: "0 20px 80px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "36px 24px 28px",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)",
          marginBottom: 18, padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)",
        }}>
          SIMULATED REMINDER CALL
        </span>

        <div style={{ position: "relative", width: 88, height: 88, marginBottom: 18 }}>
          {state === "ringing" && (
            <>
              <span className="demo-orb-ring" style={{ borderColor: "#10B981", animationDelay: "0s" }} />
              <span className="demo-orb-ring" style={{ borderColor: "#10B981", animationDelay: "0.7s" }} />
            </>
          )}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1, borderRadius: "50%",
            background: "linear-gradient(135deg, #10B981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(16,185,129,0.35)",
          }}>
            {state === "ringing"
              ? <PhoneIncoming style={{ width: 30, height: 30, color: "#fff" }} strokeWidth={1.75} />
              : <Volume2 style={{ width: 30, height: 30, color: "#fff" }} strokeWidth={1.75} />}
          </div>
        </div>

        <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", marginBottom: 3 }}>
          {state === "ringing" ? "Incoming Call" : "Orvia AI Receptionist"}
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: state === "connected" ? 18 : 30, textAlign: "center" }}>
          {state === "ringing"
            ? `Reminder call for ${appointment.customer_name}`
            : "Call connected"}
        </p>

        {state === "connected" && (
          <div style={{
            width: "100%", minHeight: 64, borderRadius: 14,
            background: "rgba(255,255,255,0.06)", padding: "12px 14px", marginBottom: 22,
          }}>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {speakingCaption || "…"}
            </p>
          </div>
        )}

        {state === "ringing" ? (
          <div style={{ display: "flex", gap: 14 }}>
            <button type="button" onClick={onDecline} aria-label="Decline call" style={{
              width: 54, height: 54, borderRadius: "50%", background: "#E5484D", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(229,72,77,0.4)",
            }}>
              <PhoneOff style={{ width: 20, height: 20, color: "#fff" }} strokeWidth={2} />
            </button>
            <button type="button" onClick={onAnswer} aria-label="Answer call" className="animate-live-pulse" style={{
              width: 54, height: 54, borderRadius: "50%", background: "#10B981", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(16,185,129,0.4)",
            }}>
              <PhoneCall style={{ width: 20, height: 20, color: "#fff" }} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} style={{
            width: 54, height: 54, borderRadius: "50%", background: "#E5484D", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            boxShadow: "0 4px 16px rgba(229,72,77,0.4)",
          }}>
            <PhoneOff style={{ width: 20, height: 20, color: "#fff" }} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Niche-aware suggestions ─────────────────────────────

const TRY_SAYING: Record<string, string[]> = {
  dental: ["I'd like a cleaning this Friday", "How much is teeth whitening?", "I have a really bad toothache", "Do you take insurance?"],
  plumbing: ["My kitchen sink is clogged, can someone come tomorrow?", "How much is a water heater repair?", "I have a burst pipe!", "Do you service 78704?"],
  hvac: ["My AC stopped cooling", "Can I book a tune-up next week?", "Do you offer financing?", "How much is a new system?"],
  real_estate: ["I'd like to view a 3-bedroom this weekend", "What's my home worth?", "Do you help with mortgages?", "I'm looking to rent downtown"],
  customer_support: ["My internet is down", "I was charged twice this month", "Can a technician come out tomorrow?", "How do I change my Wi-Fi password?"],
}

const NICHE_LABEL: Record<string, string> = {
  dental: "Dental clinic", plumbing: "Plumbing", hvac: "HVAC", real_estate: "Real estate", customer_support: "Customer support",
}

const BEHIND_THE_SCENES: { icon: React.ElementType; title: string; body: string }[] = [
  { icon: CalendarSearch, title: "Checks real availability", body: "Hours, existing bookings and your calendar." },
  { icon: CalendarCheck2, title: "Books it instantly", body: "Lands on your dashboard and Google Calendar." },
  { icon: MessageSquareText, title: "Confirms by text", body: "Caller and owner both get the details." },
  { icon: BellRing, title: "Reminds before the visit", body: "An automatic call 30 minutes ahead." },
]

function DemoStage({ phase, speaking, elapsed, agentName }: {
  phase: CallPhase
  speaking: boolean
  elapsed: number
  agentName: string
}) {
  const orbState: CallState =
    phase === "active" ? "active"
    : phase === "preparing" || phase === "mic" || phase === "connecting" ? "connecting"
    : phase === "error" ? "error"
    : phase === "ended" ? "ended" : "idle"

  const label =
    phase === "active" ? (speaking ? `${agentName} is speaking` : "Listening")
    : phase === "preparing" ? "Preparing your assistant"
    : phase === "mic" ? "Waiting for microphone"
    : phase === "connecting" ? `Calling ${agentName}`
    : phase === "ended" ? "Call ended"
    : phase === "error" ? "Something went wrong"
    : `${agentName} is ready`

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <CallOrb state={orbState} speaking={speaking} />
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em", marginTop: 18 }}>
        {label}{orbState === "connecting" ? "…" : ""}
      </p>
      <p style={{
        fontFamily: "Geist Mono, monospace", fontSize: 12.5, color: "var(--muted-foreground)",
        marginTop: 3, fontVariantNumeric: "tabular-nums", minHeight: 18,
      }}>
        {phase === "active" || phase === "ended" ? formatElapsed(elapsed) : phase === "mic" ? "Click Allow if your browser asks" : ""}
      </p>
    </div>
  )
}

export default function DemoPage({ engine }: { engine?: "vapi" | "gemini" } = {}) {
  const { data: business } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettings })
  const { data: activeVaultKey } = useQuery({ queryKey: ["active-vapi-key"], queryFn: getActiveVapiPublicKey, staleTime: 10_000 })

  // Guests (no account) always talk to Gemini with simulated tools: free,
  // instant, and nothing touches a database. Spike: /demo?engine=gemini runs
  // the voice on Gemini Live instead of Vapi.
  const isGuest = useGuestNiche() !== null
  const useGemini = isGuest || (engine ? engine === "gemini" : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("engine") === "gemini")
  const vapiCall = useAssistantCall()
  const geminiCall = useGeminiCall()
  const call = useGemini ? geminiCall : vapiCall
  const queryClient = useQueryClient()
  const [savedGeminiOpts, setGeminiOpts] = useState<GeminiOptions>(loadGeminiOptions)
  const geminiOpts = isGuest ? DEFAULT_GEMINI_OPTIONS : savedGeminiOpts
  const updateGeminiOpts = (v: GeminiOptions) => { setGeminiOpts(v); saveGeminiOptions(v) }
  const [appointment, setAppointment] = useState<Appointment | null>(null)

  const [timeOffsetMs, setTimeOffsetMs] = useState(0)
  const [simulatedNow, setSimulatedNow] = useState(() => new Date())
  const [reminderState, setReminderState] = useState<ReminderState>("idle")
  const [speakingCaption, setSpeakingCaption] = useState("")
  const reminderTriggeredForRef = useRef<string | null>(null)

  const publicKey = useGemini ? "gemini" : (activeVaultKey || ENV_VAPI_PUBLIC_KEY)
  const agentName = business?.settings.receptionist_name || "Orvia"
  const niche = business?.settings.niche ?? "dental"
  const busy = call.phase === "preparing" || call.phase === "mic" || call.phase === "connecting"
  const showTranscript = call.phase === "active" || call.phase === "ended" || call.transcript.length > 0

  // ── Clock tick for the time machine ──
  useEffect(() => {
    const t = setInterval(() => setSimulatedNow(new Date(Date.now() + timeOffsetMs)), 1000)
    return () => clearInterval(t)
  }, [timeOffsetMs])

  // Guest: when a call ends, add it to their Calls history so the dashboard
  // reflects what they just did.
  const recordedCallRef = useRef<string | null>(null)
  const { phase: gPhase, vapiCallId: gCallId, transcript: gTranscript, elapsed: gElapsed, lastBooking: gBooking } = geminiCall
  useEffect(() => {
    if (!isGuest || gPhase !== "ended" || !gCallId || recordedCallRef.current === gCallId) return
    recordedCallRef.current = gCallId
    recordGuestCall({
      transcript: gTranscript.filter(t => t.text.trim()).map(t => ({ role: t.role, content: t.text })),
      durationSecs: gElapsed,
      booking: gBooking,
    })
    void queryClient.invalidateQueries()
  }, [isGuest, gPhase, gCallId, gTranscript, gElapsed, gBooking, queryClient])

  // Gemini spike with simulated tools: bookings live in the spike calendar,
  // not Supabase, so there's nothing to poll for.
  const simulated = useGemini && geminiOpts.toolMode === "simulated"

  // ── Poll for the booked appointment once the call ends ──
  useEffect(() => {
    if (simulated || call.phase !== "ended" || !call.vapiCallId || appointment) return
    let cancelled = false
    let attempts = 0
    const vapiCallId = call.vapiCallId
    const poll = async () => {
      if (cancelled || attempts >= 15) return
      attempts++
      const found = await getAppointmentByVapiCallId(vapiCallId)
      if (found && !cancelled) { setAppointment(found); return }
      if (!cancelled) setTimeout(poll, 2000)
    }
    poll()
    return () => { cancelled = true }
  }, [simulated, call.phase, call.vapiCallId, appointment])

  // ── Gemini: show the booking the moment the tool confirms it, mid-call ──
  const geminiBookedAt = geminiCall.bookedAt
  const geminiCallId = geminiCall.vapiCallId
  useEffect(() => {
    if (!useGemini || !geminiBookedAt || !geminiCallId) return
    let cancelled = false
    void (async () => {
      for (let i = 0; i < 5 && !cancelled; i++) {
        const found = await getAppointmentByVapiCallId(geminiCallId)
        if (found) { if (!cancelled) setAppointment(found); return }
        await new Promise(r => setTimeout(r, 1000))
      }
    })()
    return () => { cancelled = true }
  }, [useGemini, geminiBookedAt, geminiCallId])

  // ── Booking pop-up: once per booking (real or simulated), clears after 7 s ──
  const notice: BookedNotice | null = appointment
    ? { id: appointment.id, name: appointment.customer_name, service: appointment.service_type ?? "Service", start: appointment.scheduled_start }
    : useGemini && geminiCall.lastBooking
      ? { id: geminiCall.lastBooking.id, name: geminiCall.lastBooking.name, service: geminiCall.lastBooking.service, start: geminiCall.lastBooking.start }
      : null
  const noticeId = notice?.id ?? null
  const [popup, setPopup] = useState<BookedNotice | null>(null)
  // Keyed on the id so a re-fetched copy of the same booking doesn't re-pop.
  useEffect(() => {
    if (!notice) return
    setPopup(notice)
    const t = setTimeout(() => setPopup(null), 7000)
    return () => clearTimeout(t)
  }, [noticeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reminder trigger: simulated clock crosses the 30-min-before window ──
  useEffect(() => {
    if (!appointment) return
    if (reminderTriggeredForRef.current === appointment.id) return
    const apptTime = new Date(appointment.scheduled_start).getTime()
    const reminderAt = apptTime - 30 * 60 * 1000
    if (simulatedNow.getTime() >= reminderAt && simulatedNow.getTime() < apptTime) {
      reminderTriggeredForRef.current = appointment.id
      setReminderState("ringing")
    }
  }, [simulatedNow, appointment])

  function startCall() {
    if (!business || !publicKey) return
    setAppointment(null)
    setTimeOffsetMs(0)
    setReminderState("idle")
    reminderTriggeredForRef.current = null
    if (useGemini) geminiCall.start(business, geminiOpts)
    else vapiCall.start(business, publicKey)
  }

  const speakReminder = useCallback(() => {
    if (!appointment || !business) return
    const text = `Hi ${appointment.customer_name.split(" ")[0]}, it's ${agentName} from ${business.name}. Just a reminder that your ${appointment.service_type ?? "appointment"} is in about thirty minutes. See you soon!`
    setSpeakingCaption(text)
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => setTimeout(() => setReminderState("done"), 900)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    } else {
      setTimeout(() => setReminderState("done"), 4000)
    }
  }, [appointment, business, agentName])

  function endReminder() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel()
    setReminderState("done")
  }

  const buttonBase: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    height: 46, padding: "0 24px", borderRadius: 14, fontFamily: "inherit",
    fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer",
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <style>{`
        .demo-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
        @media (max-width: 860px) { .demo-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className="animate-live-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Live demo · {NICHE_LABEL[niche] ?? "AI receptionist"}{useGemini && !isGuest ? " · Gemini spike" : ""}
          </p>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.03em", marginBottom: 6 }}>
          Meet {agentName}, the front desk for {business?.name ?? "your business"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", letterSpacing: "-0.01em", maxWidth: 560 }}>
          Talk to it right here in the browser. Book something real and watch it land on the dashboard.
        </p>
      </div>

      {useGemini && !isGuest && (
        <GeminiSettings value={geminiOpts} onChange={updateGeminiOpts} locked={busy || call.phase === "active"} activeModel={geminiCall.activeModel} />
      )}

      <div className="demo-grid" style={{ marginBottom: 16 }}>
        {/* Stage */}
        <div className="ios-card" style={{ padding: "36px 28px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", minHeight: 440 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <DemoStage phase={call.phase} speaking={call.speaking} elapsed={call.elapsed} agentName={agentName} />
          </div>

          <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 24 }}>
            {call.phase === "active" ? (
              <button type="button" onClick={call.stop} style={{ ...buttonBase, width: "100%", border: "none", background: "#DC2626", color: "#fff" }}>
                <PhoneOff size={16} strokeWidth={2} /> End call
              </button>
            ) : busy ? (
              <button type="button" onClick={call.stop} style={{ ...buttonBase, width: "100%", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)" }}>
                <Loader2 size={16} className="animate-spin" /> Cancel
              </button>
            ) : (
              <button type="button" onClick={startCall} disabled={!business || !publicKey}
                style={{
                  ...buttonBase, width: "100%", border: "none",
                  background: "var(--foreground)", color: "var(--background)",
                  opacity: !business || !publicKey ? 0.5 : 1,
                  cursor: !business || !publicKey ? "not-allowed" : "pointer",
                }}>
                {call.phase === "idle" ? <><Mic size={16} strokeWidth={2} /> Start the call</> : <><RotateCcw size={16} strokeWidth={2} /> Call again</>}
              </button>
            )}
            <p style={{ fontSize: 11.5, color: call.phase === "error" ? "#DC2626" : "var(--muted-foreground)", textAlign: "center", minHeight: 16 }}>
              {call.phase === "error" ? call.error : !publicKey ? "Add a Vapi key in Admin · Vapi Accounts" : "Uses your microphone. Nothing is recorded to your device."}
            </p>
          </div>
        </div>

        {/* Right panel: suggestions before the call, transcript during and after */}
        {showTranscript ? (
          <TranscriptPanel entries={call.transcript} />
        ) : (
          <div className="ios-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
                Try saying
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(TRY_SAYING[niche] ?? TRY_SAYING.dental).map(line => (
                  <div key={line} style={{
                    fontSize: 13.5, color: "var(--foreground)", padding: "10px 13px", borderRadius: 12,
                    background: "var(--muted)", letterSpacing: "-0.01em",
                  }}>
                    “{line}”
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
                Behind the scenes
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {BEHIND_THE_SCENES.map(({ icon: Icon, title, body }) => (
                  <div key={title} style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <Icon size={16} strokeWidth={1.75} style={{ color: "var(--foreground)", flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{title}</p>
                      <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.4, marginTop: 1 }}>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {simulated && business && <SpikeCalendar business={business} highlightId={geminiCall.lastBooking?.id} />}

      {appointment && (
        <div style={{ marginBottom: 16 }}>
          <BookingConfirmationCard appointment={appointment} />
        </div>
      )}

      {appointment && (
        <div style={{ marginBottom: 16 }}>
          <TimeMachineCard
            appointment={appointment}
            simulatedNow={simulatedNow}
            reminderState={reminderState}
            onSetOffset={(target) => setTimeOffsetMs(target.getTime() - Date.now())}
            onReset={() => setTimeOffsetMs(0)}
          />
        </div>
      )}

      {appointment && (
        <ReminderCallOverlay
          appointment={appointment}
          state={reminderState}
          onAnswer={() => { setReminderState("connected"); speakReminder() }}
          onDecline={endReminder}
          onClose={endReminder}
          speakingCaption={speakingCaption}
        />
      )}

      {popup && <BookedPopup booking={popup} timeZone={business?.timezone} onClose={() => setPopup(null)} />}
    </div>
  )
}
