import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "@tanstack/react-router"
import {
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Play,
  Pause,
  FileText,
  Phone,
  Clock,
  Calendar,
  Loader2,
} from "lucide-react"

import {
  getCallById,
  getLeadByCallId,
  getAppointmentByCallId,
  markCallHandled,
} from "@/lib/api"
import type { TranscriptTurn } from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────

function formatDuration(secs: number | null): string {
  if (secs == null) return "--"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "--"
  return value.replace(/_/g, " ")
}

function outcomeStyle(outcome: string | null | undefined): { text: string; bg: string; border: string } {
  switch (outcome) {
    case "appointment_booked": return { text: "#10B981", bg: "#D1FAE5",                border: "rgba(16,185,129,0.25)" }
    case "lead_captured":      return { text: "#4338CA", bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.25)" }
    case "info_given":         return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
    case "transferred":        return { text: "#D97706", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)" }
    case "missed":             return { text: "#E5484D", bg: "rgba(229,72,77,0.12)",   border: "rgba(229,72,77,0.25)" }
    default:                   return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
  }
}

function statusStyle(status: string | null | undefined): { text: string; bg: string; border: string } {
  switch (status) {
    case "completed":   return { text: "#10B981", bg: "#D1FAE5",                border: "rgba(16,185,129,0.25)" }
    case "in_progress": return { text: "#007AFF", bg: "rgba(0,122,255,0.12)",   border: "rgba(0,122,255,0.25)" }
    case "missed":
    case "failed":      return { text: "#E5484D", bg: "rgba(229,72,77,0.12)",   border: "rgba(229,72,77,0.25)" }
    default:            return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
  }
}

function urgencyStyle(urgency: string): { text: string; bg: string; border: string } {
  switch (urgency) {
    case "emergency": return { text: "#E5484D", bg: "rgba(229,72,77,0.12)",  border: "rgba(229,72,77,0.25)" }
    case "urgent":    return { text: "#D97706", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" }
    case "routine":   return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
    case "inquiry":   return { text: "#007AFF", bg: "rgba(0,122,255,0.12)", border: "rgba(0,122,255,0.25)" }
    default:          return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
  }
}

function Pill({ text, style: s }: { text: string; style: { text: string; bg: string; border: string } }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
      color: s.text, background: s.bg, border: `1px solid ${s.border}`,
      textTransform: "capitalize", letterSpacing: "0.01em", whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  )
}

// ─── Skeletons ────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ height: 22, width: 140, borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 22, width: 80, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 12, width: 200, borderRadius: 4 }} />
    </div>
  )
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
        <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
      </div>
      <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <div className="skeleton" style={{ height: 10, width: 48, borderRadius: 3, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 13, width: 120, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Audio Player ─────────────────────────────────────────

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play() }
    setPlaying(!playing)
  }

  function handleTimeUpdate() {
    const el = audioRef.current
    if (!el || !el.duration) return
    setProgress(el.currentTime / el.duration)
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    if (!el || !el.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * el.duration
    setProgress(ratio)
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, "0")}`
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--foreground)", color: "var(--background)",
          border: "none", cursor: "pointer", flexShrink: 0, transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = "0.8"}
        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = "1"}
      >
        {playing
          ? <Pause style={{ width: 13, height: 13 }} />
          : <Play style={{ width: 13, height: 13, marginLeft: 1 }} />
        }
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{
          flex: 1, height: 4, background: "var(--muted)", borderRadius: 2,
          cursor: "pointer", position: "relative", border: "1px solid var(--border)",
        }}
        onClick={handleSeek}
        onKeyDown={(e) => {
          const el = audioRef.current
          if (!el || !el.duration) return
          if (e.key === "ArrowRight") { el.currentTime = Math.min(el.duration, el.currentTime + 5); setProgress(el.currentTime / el.duration) }
          if (e.key === "ArrowLeft") { el.currentTime = Math.max(0, el.currentTime - 5); setProgress(el.currentTime / el.duration) }
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${progress * 100}%`,
          background: "var(--foreground)", borderRadius: 2,
          transition: "width 0.1s linear",
        }} />
      </div>
      {duration > 0 && (
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {fmt(progress * duration)} / {fmt(duration)}
        </span>
      )}
    </div>
  )
}

// ─── Chat Bubble ──────────────────────────────────────────

function ChatBubble({ turn, callerName }: { turn: TranscriptTurn; callerName?: string | null }) {
  const isAI = turn.role === "assistant"
  // Orvia = right (agent/employee). Caller = left (customer coming in).
  const isRight = isAI

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isRight ? "flex-end" : "flex-start", gap: 4 }}>
      {/* Name label */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexDirection: isRight ? "row-reverse" : "row",
      }}>
        {/* Avatar circle */}
        <div style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: isAI ? "var(--foreground)" : "var(--muted)",
          border: `1px solid var(--border)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: isAI ? "var(--background)" : "var(--muted-foreground)",
            letterSpacing: "0.02em",
          }}>
            {isAI ? "AI" : (callerName ? callerName.charAt(0).toUpperCase() : "C")}
          </span>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--muted-foreground)",
          letterSpacing: "-0.01em",
        }}>
          {isAI ? "Orvia" : (callerName ?? "Caller")}
        </span>
      </div>

      {/* Bubble + timestamp */}
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: isRight ? "flex-end" : "flex-start", gap: 3 }}>
        <div style={{
          padding: "9px 14px",
          fontSize: 13,
          lineHeight: 1.6,
          borderRadius: isRight ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
          background: isAI ? "var(--foreground)" : "var(--muted)",
          color: isAI ? "var(--background)" : "var(--foreground)",
          border: `1px solid ${isAI ? "transparent" : "var(--border)"}`,
        }}>
          {turn.content}
        </div>
        {turn.timestamp != null && (
          <span style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            opacity: 0.5,
            fontVariantNumeric: "tabular-nums",
          }}>
            {Math.floor(turn.timestamp / 60)}:{String(Math.floor(turn.timestamp % 60)).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Detail Card ──────────────────────────────────────────

function DetailCard({ title, icon: Icon, children }: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "11px 18px", borderBottom: "1px solid var(--border)",
        background: "var(--muted)",
      }}>
        {Icon && <Icon style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} strokeWidth={1.5} />}
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "12px 18px" }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: 16, padding: "9px 0",
    }}
    className="border-b border-border last:border-b-0"
    >
      <span style={{ fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0 }}>{label}</span>
      <div style={{ fontSize: 13, color: "var(--foreground)", textAlign: "right" }}>{children}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function CallDetailPage() {
  const { id } = useParams({ from: "/_dashboard/calls_/$id" })
  const queryClient = useQueryClient()

  const callQuery = useQuery({
    queryKey: ["call", id],
    queryFn: () => getCallById(id),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.transcript_status === "pending" ? 15_000 : false,
  })
  const leadQuery = useQuery({ queryKey: ["lead-by-call", id], queryFn: () => getLeadByCallId(id), enabled: !!id })
  const appointmentQuery = useQuery({ queryKey: ["appointment-by-call", id], queryFn: () => getAppointmentByCallId(id), enabled: !!id })

  const handleMutation = useMutation({
    mutationFn: () => markCallHandled(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call", id] })
      queryClient.invalidateQueries({ queryKey: ["calls"] })
    },
  })

  const call = callQuery.data
  const lead = leadQuery.data
  const appointment = appointmentQuery.data
  const isLoading = callQuery.isLoading

  const extracted = (call?.extracted_data ?? {}) as Record<string, unknown>

  // Curated, ordered view of the call's structured analysis.
  // - Hide noisy false booleans (e.g. out_of_area: false is not interesting)
  // - Don't show lead_captured when booked is true — VAPI's analysis sets both
  // - Render booleans as "Yes"/"No" instead of "true"/"false"
  // - Use a stable, sensible order rather than whatever order keys arrived in
  const orderedKeys = [
    "caller_name",
    "caller_zip",
    "service_requested",
    "urgency",
    "booked",
    "lead_captured",
    "out_of_area",
  ] as const

  const labelMap: Record<string, string> = {
    caller_name: "Caller name",
    caller_zip: "ZIP code",
    service_requested: "Service",
    urgency: "Urgency",
    booked: "Booked",
    lead_captured: "Lead captured",
    out_of_area: "Out of area",
  }

  const isMeaningful = (key: string, value: unknown): boolean => {
    if (value == null || value === "") return false
    if (key === "out_of_area" && value === false) return false
    if (key === "lead_captured" && (value === false || extracted.booked === true)) return false
    if (key === "booked" && value === false) return false
    return true
  }

  const formatValue = (value: unknown): string => {
    if (typeof value === "boolean") return value ? "Yes" : "No"
    return String(value)
  }

  const extractedEntries: [string, unknown][] = orderedKeys
    .map((k): [string, unknown] => [k, extracted[k]])
    .filter(([k, v]) => isMeaningful(k, v))
    .concat(
      // Append any other fields VAPI sent that we don't have a hardcoded label for
      Object.entries(extracted).filter(
        ([k, v]) => !orderedKeys.includes(k as typeof orderedKeys[number]) && isMeaningful(k, v),
      ),
    )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {!isLoading && !call && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 0", gap: 10 }}>
          <AlertCircle style={{ width: 32, height: 32, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
          <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>Call not found</p>
        </div>
      )}

      {(isLoading || call) && (
        <>
          {/* Hero card */}
          {isLoading ? (
            <HeroSkeleton />
          ) : call ? (
            <div className="ios-card animate-fade-up animate-fade-up-2" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {/* Contextual back button — returns to /calls list */}
                    <Link
                      to="/calls"
                      aria-label="Back to calls"
                      title="Back to calls"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--muted-foreground)",
                        textDecoration: "none",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--accent)";
                        (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--card)";
                        (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
                      }}
                    >
                      <ChevronLeft style={{ width: 16, height: 16 }} strokeWidth={1.75} />
                    </Link>
                    <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", color: "var(--foreground)" }}>
                      {call.caller_phone ?? "Unknown caller"}
                    </h1>
                    {call.outcome && <Pill text={formatLabel(call.outcome)} style={outcomeStyle(call.outcome)} />}
                    <Pill text={formatLabel(call.status)} style={statusStyle(call.status)} />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
                      <Clock style={{ width: 11, height: 11 }} strokeWidth={1.5} />
                      {formatDuration(call.duration_secs)}
                    </span>
                    <span style={{ color: "var(--border)", fontSize: 11 }}>·</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                      <Calendar style={{ width: 11, height: 11 }} strokeWidth={1.5} />
                      {formatDateTime(call.started_at ?? call.created_at)}
                    </span>
                  </div>
                </div>

                {call.status !== "completed" && (
                  <button
                    onClick={() => handleMutation.mutate()}
                    disabled={handleMutation.isPending}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      background: "var(--foreground)", color: "var(--background)",
                      border: "none", borderRadius: 10, height: 36, padding: "0 16px",
                      fontSize: 13, fontWeight: 600, cursor: handleMutation.isPending ? "not-allowed" : "pointer",
                      opacity: handleMutation.isPending ? 0.6 : 1, transition: "opacity 0.15s", flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { if (!handleMutation.isPending) (e.currentTarget as HTMLElement).style.opacity = "0.8" }}
                    onMouseLeave={(e) => { if (!handleMutation.isPending) (e.currentTarget as HTMLElement).style.opacity = "1" }}
                  >
                    <CheckCircle2 style={{ width: 13, height: 13 }} strokeWidth={2} />
                    {handleMutation.isPending ? "Marking..." : "Mark handled"}
                  </button>
                )}
                {handleMutation.isSuccess && (
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 500 }}>Marked as handled</span>
                )}
              </div>

              {call.summary && (
                <p style={{
                  fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6,
                  marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", maxWidth: 640,
                }}>
                  {call.summary}
                </p>
              )}
            </div>
          ) : null}

          {/* Two-column */}
          <style>{`
            .call-detail-grid {
              display: grid;
              grid-template-columns: 1fr 300px;
              gap: 14px;
            }
            @media (max-width: 700px) {
              .call-detail-grid {
                grid-template-columns: 1fr;
              }
            }
          `}</style>
          <div className="call-detail-grid">
            {/* Transcript */}
            <div className="animate-fade-up animate-fade-up-3">
              {isLoading ? (
                <CardSkeleton rows={4} />
              ) : call?.transcript && call.transcript.length > 0 ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {call.transcript.map((turn: TranscriptTurn, i: number) => (
                      <ChatBubble key={i} turn={turn} callerName={(call.extracted_data as Record<string, unknown>)?.caller_name as string | null} />
                    ))}
                  </div>
                </DetailCard>
              ) : !isLoading && call?.transcript_status === "pending" ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 12 }}>
                    <Loader2 style={{ width: 24, height: 24, color: "var(--muted-foreground)", animation: "spin 1s linear infinite" }} strokeWidth={1.5} />
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>Transcript processing</p>
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Usually ready within 1-2 minutes after the call ends</p>
                    </div>
                  </div>
                </DetailCard>
              ) : !isLoading && call ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 10 }}>
                    <FileText style={{ width: 28, height: 28, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
                    <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No transcript available</p>
                  </div>
                </DetailCard>
              ) : null}
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="animate-fade-up animate-fade-up-4">
              {isLoading ? (
                <><CardSkeleton rows={3} /><CardSkeleton rows={3} /></>
              ) : (
                <>
                  {extractedEntries.length > 0 && (
                    <DetailCard title="Call details">
                      {extractedEntries.map(([key, value]) => (
                        <InfoRow key={key} label={labelMap[key] ?? formatLabel(key)}>
                          {formatValue(value)}
                        </InfoRow>
                      ))}
                    </DetailCard>
                  )}

                  {leadQuery.isLoading ? (
                    <CardSkeleton rows={3} />
                  ) : lead ? (
                    <DetailCard title="Caller" icon={Phone}>
                      <InfoRow label="Name">{lead.name ?? "Unknown"}</InfoRow>
                      <InfoRow label="Phone">
                        <a href={`tel:${lead.phone}`} style={{ color: "#007AFF", textDecoration: "none", fontVariantNumeric: "tabular-nums" }}>
                          {lead.phone}
                        </a>
                      </InfoRow>
                      {lead.service_needed && <InfoRow label="Service">{lead.service_needed}</InfoRow>}
                      <InfoRow label="Urgency">
                        <Pill text={lead.urgency} style={urgencyStyle(lead.urgency)} />
                      </InfoRow>
                      {lead.notes && (
                        <InfoRow label="Notes">
                          <span style={{ color: "var(--muted-foreground)" }}>{lead.notes}</span>
                        </InfoRow>
                      )}
                    </DetailCard>
                  ) : null}

                  {appointmentQuery.isLoading ? (
                    <CardSkeleton rows={3} />
                  ) : appointment ? (
                    <DetailCard title="Appointment" icon={Calendar}>
                      {appointment.service_type && <InfoRow label="Service">{appointment.service_type}</InfoRow>}
                      <InfoRow label="Time">
                        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                          {formatDateTime(appointment.scheduled_start)}
                        </span>
                      </InfoRow>
                      <InfoRow label="Status">
                        <Pill
                          text={formatLabel(appointment.status)}
                          style={
                            appointment.status === "confirmed"
                              ? { text: "#10B981", bg: "#D1FAE5", border: "rgba(16,185,129,0.25)" }
                              : appointment.status === "cancelled" || appointment.status === "no_show"
                              ? { text: "#E5484D", bg: "rgba(229,72,77,0.12)", border: "rgba(229,72,77,0.25)" }
                              : { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
                          }
                        />
                      </InfoRow>
                      {appointment.notes && (
                        <InfoRow label="Notes">
                          <span style={{ color: "var(--muted-foreground)" }}>{appointment.notes}</span>
                        </InfoRow>
                      )}
                    </DetailCard>
                  ) : null}

                  {call?.recording_url && (
                    <DetailCard title="Recording">
                      <AudioPlayer src={call.recording_url} />
                    </DetailCard>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
