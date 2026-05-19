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
} from "lucide-react"

import {
  getCallById,
  getLeadByCallId,
  getAppointmentByCallId,
  markCallHandled,
} from "@/lib/api"
import type { TranscriptTurn } from "@/lib/types"

// --- Helpers ------------------------------------------------

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

function outcomeColor(outcome: string | null | undefined): { text: string; bg: string } {
  switch (outcome) {
    case "appointment_booked": return { text: "#34C759", bg: "rgba(52,199,89,0.1)" }
    case "lead_captured": return { text: "#007AFF", bg: "rgba(0,122,255,0.1)" }
    case "info_given": return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
    case "transferred": return { text: "#FF9500", bg: "rgba(255,149,0,0.1)" }
    case "missed": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)" }
    default: return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
  }
}

function statusColor(status: string | null | undefined): { text: string; bg: string } {
  switch (status) {
    case "completed": return { text: "#34C759", bg: "rgba(52,199,89,0.1)" }
    case "in_progress": return { text: "#007AFF", bg: "rgba(0,122,255,0.1)" }
    case "missed": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)" }
    case "failed": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)" }
    default: return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
  }
}

function urgencyColor(urgency: string): { text: string; bg: string } {
  switch (urgency) {
    case "emergency": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)" }
    case "urgent": return { text: "#FF9500", bg: "rgba(255,149,0,0.1)" }
    case "routine": return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
    case "inquiry": return { text: "#007AFF", bg: "rgba(0,122,255,0.1)" }
    default: return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
  }
}

// --- Skeletons ----------------------------------------------

function HeroSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ height: 22, width: 140, background: "rgba(60,60,67,0.08)", borderRadius: 5 }} />
        <div style={{ height: 20, width: 80, background: "rgba(60,60,67,0.06)", borderRadius: 6 }} />
      </div>
      <div style={{ height: 12, width: 200, background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
    </div>
  )
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
        <div style={{ height: 11, width: 80, background: "rgba(60,60,67,0.08)", borderRadius: 4 }} />
      </div>
      <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <div style={{ height: 10, width: 48, background: "rgba(60,60,67,0.05)", borderRadius: 3, marginBottom: 5 }} />
            <div style={{ height: 13, width: 120, background: "rgba(60,60,67,0.08)", borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Audio Player -------------------------------------------

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
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#1C1C1E",
          color: "#FFFFFF",
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
          transition: "opacity 0.15s",
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
        style={{
          flex: 1,
          height: 4,
          background: "rgba(60,60,67,0.12)",
          borderRadius: 2,
          cursor: "pointer",
          position: "relative",
        }}
        onClick={handleSeek}
      >
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: `${progress * 100}%`,
          background: "#1C1C1E",
          borderRadius: 2,
          transition: "width 0.1s linear",
        }} />
      </div>
      {duration > 0 && (
        <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
          {fmt(progress * duration)} / {fmt(duration)}
        </span>
      )}
    </div>
  )
}

// --- Chat Bubble --------------------------------------------

function ChatBubble({ turn }: { turn: TranscriptTurn }) {
  const isAI = turn.role === "assistant"
  return (
    <div style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end" }}>
      <div style={{ maxWidth: "80%" }}>
        <p style={{
          fontSize: 10,
          fontWeight: 500,
          color: "#AEAEB2",
          marginBottom: 4,
          textAlign: isAI ? "left" : "right",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {isAI ? "Orvia" : "Caller"}
        </p>
        <div style={{
          padding: "10px 14px",
          fontSize: 13,
          lineHeight: 1.55,
          borderRadius: isAI ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
          background: isAI ? "#F2F2F7" : "#1C1C1E",
          color: isAI ? "#1C1C1E" : "#FFFFFF",
        }}>
          {turn.content}
        </div>
        {turn.timestamp != null && (
          <p style={{
            fontSize: 10,
            color: "#AEAEB2",
            marginTop: 3,
            textAlign: isAI ? "left" : "right",
            fontFamily: "var(--font-mono)",
          }}>
            {Math.floor(turn.timestamp / 60)}:{String(Math.floor(turn.timestamp % 60)).padStart(2, "0")}
          </p>
        )}
      </div>
    </div>
  )
}

// --- Detail Card -------------------------------------------

function DetailCard({ title, icon: Icon, children }: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "12px 18px",
        borderBottom: "0.5px solid rgba(60,60,67,0.08)",
      }}>
        {Icon && <Icon style={{ width: 13, height: 13, color: "#8E8E93" }} />}
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#8E8E93",
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
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
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      padding: "9px 0",
      borderBottom: "0.5px solid rgba(60,60,67,0.08)",
    }}
    className="last:border-0"
    >
      <span style={{ fontSize: 11, color: "#8E8E93", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{label}</span>
      <div style={{ fontSize: 13, color: "#1C1C1E", textAlign: "right" }}>{children}</div>
    </div>
  )
}

// --- Page ---------------------------------------------------

export default function CallDetailPage() {
  const { id } = useParams({ from: "/_dashboard/calls_/$id" })
  const queryClient = useQueryClient()

  const callQuery = useQuery({
    queryKey: ["call", id],
    queryFn: () => getCallById(id),
    enabled: !!id,
  })

  const leadQuery = useQuery({
    queryKey: ["lead-by-call", id],
    queryFn: () => getLeadByCallId(id),
    enabled: !!id,
  })

  const appointmentQuery = useQuery({
    queryKey: ["appointment-by-call", id],
    queryFn: () => getAppointmentByCallId(id),
    enabled: !!id,
  })

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

  const extracted = call?.extracted_data ?? {}
  const extractedEntries = Object.entries(extracted).filter(([, v]) => v != null && v !== "")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Back */}
      <Link
        to="/calls"
        className="animate-fade-up animate-fade-up-1"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "#007AFF",
          textDecoration: "none",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = "1"}
      >
        <ChevronLeft style={{ width: 14, height: 14 }} />
        Calls
      </Link>

      {/* Not found */}
      {!isLoading && !call && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 0", gap: 10 }}>
          <AlertCircle style={{ width: 32, height: 32, color: "#AEAEB2" }} strokeWidth={1.5} />
          <p style={{ fontSize: 14, color: "#AEAEB2" }}>Call not found</p>
        </div>
      )}

      {(isLoading || call) && (
        <>
          {/* Hero card */}
          {isLoading ? (
            <HeroSkeleton />
          ) : call ? (
            <div
              className="ios-card animate-fade-up animate-fade-up-2"
              style={{ padding: "20px 24px" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.3px", color: "#1C1C1E" }}>
                      {call.caller_phone ?? "Unknown caller"}
                    </h1>
                    {call.outcome && (() => {
                      const c = outcomeColor(call.outcome)
                      return (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 9px",
                          borderRadius: 6,
                          color: c.text,
                          background: c.bg,
                          fontFamily: "var(--font-mono)",
                          textTransform: "capitalize",
                        }}>
                          {formatLabel(call.outcome)}
                        </span>
                      )
                    })()}
                    {(() => {
                      const c = statusColor(call.status)
                      return (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 9px",
                          borderRadius: 6,
                          color: c.text,
                          background: c.bg,
                          fontFamily: "var(--font-mono)",
                          textTransform: "capitalize",
                        }}>
                          {formatLabel(call.status)}
                        </span>
                      )
                    })()}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8E8E93", fontFamily: "var(--font-mono)" }}>
                      <Clock style={{ width: 11, height: 11 }} />
                      {formatDuration(call.duration_secs)}
                    </span>
                    <span style={{ color: "#AEAEB2", fontSize: 11 }}>·</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8E8E93", fontFamily: "var(--font-mono)" }}>
                      <Calendar style={{ width: 11, height: 11 }} />
                      {formatDateTime(call.started_at ?? call.created_at)}
                    </span>
                  </div>
                </div>

                {call.status !== "completed" && (
                  <button
                    onClick={() => handleMutation.mutate()}
                    disabled={handleMutation.isPending}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#1C1C1E",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 10,
                      height: 36,
                      padding: "0 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: handleMutation.isPending ? "not-allowed" : "pointer",
                      opacity: handleMutation.isPending ? 0.6 : 1,
                      transition: "opacity 0.15s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { if (!handleMutation.isPending) (e.currentTarget as HTMLElement).style.opacity = "0.8" }}
                    onMouseLeave={(e) => { if (!handleMutation.isPending) (e.currentTarget as HTMLElement).style.opacity = "1" }}
                  >
                    <CheckCircle2 style={{ width: 13, height: 13 }} />
                    {handleMutation.isPending ? "Marking..." : "Mark handled"}
                  </button>
                )}
                {handleMutation.isSuccess && (
                  <span style={{ fontSize: 12, color: "#34C759", fontWeight: 500 }}>Marked as handled</span>
                )}
              </div>

              {call.summary && (
                <p style={{
                  fontSize: 14,
                  color: "#636366",
                  lineHeight: 1.6,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "0.5px solid rgba(60,60,67,0.08)",
                  maxWidth: 640,
                }}>
                  {call.summary}
                </p>
              )}
            </div>
          ) : null}

          {/* Two-column */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}
            className="grid-cols-1 lg:grid-cols-[1fr_300px]"
          >
            {/* Transcript */}
            <div className="animate-fade-up animate-fade-up-3">
              {isLoading ? (
                <CardSkeleton rows={4} />
              ) : call?.transcript && call.transcript.length > 0 ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {call.transcript.map((turn: TranscriptTurn, i: number) => (
                      <ChatBubble key={i} turn={turn} />
                    ))}
                  </div>
                </DetailCard>
              ) : !isLoading && call ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 10 }}>
                    <FileText style={{ width: 28, height: 28, color: "#AEAEB2" }} strokeWidth={1.5} />
                    <p style={{ fontSize: 13, color: "#AEAEB2" }}>No transcript available</p>
                  </div>
                </DetailCard>
              ) : null}
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}
              className="animate-fade-up animate-fade-up-4"
            >
              {isLoading ? (
                <><CardSkeleton rows={3} /><CardSkeleton rows={3} /></>
              ) : (
                <>
                  {extractedEntries.length > 0 && (
                    <DetailCard title="Call details">
                      {extractedEntries.map(([key, value]) => (
                        <InfoRow key={key} label={formatLabel(key)}>
                          {String(value)}
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
                        <a
                          href={`tel:${lead.phone}`}
                          style={{ color: "#007AFF", textDecoration: "none", fontFamily: "var(--font-mono)" }}
                        >
                          {lead.phone}
                        </a>
                      </InfoRow>
                      {lead.service_needed && (
                        <InfoRow label="Service">{lead.service_needed}</InfoRow>
                      )}
                      <InfoRow label="Urgency">
                        {(() => {
                          const c = urgencyColor(lead.urgency)
                          return (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: "2px 8px",
                              borderRadius: 6,
                              color: c.text,
                              background: c.bg,
                              fontFamily: "var(--font-mono)",
                              textTransform: "capitalize",
                            }}>
                              {lead.urgency}
                            </span>
                          )
                        })()}
                      </InfoRow>
                      {lead.notes && (
                        <InfoRow label="Notes">
                          <span style={{ color: "#636366" }}>{lead.notes}</span>
                        </InfoRow>
                      )}
                    </DetailCard>
                  ) : null}

                  {appointmentQuery.isLoading ? (
                    <CardSkeleton rows={3} />
                  ) : appointment ? (
                    <DetailCard title="Appointment" icon={Calendar}>
                      {appointment.service_type && (
                        <InfoRow label="Service">{appointment.service_type}</InfoRow>
                      )}
                      <InfoRow label="Time">
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {formatDateTime(appointment.scheduled_start)}
                        </span>
                      </InfoRow>
                      <InfoRow label="Status">
                        {(() => {
                          const color = appointment.status === "confirmed" ? "#34C759"
                            : appointment.status === "cancelled" || appointment.status === "no_show" ? "#FF3B30"
                            : "#8E8E93"
                          return (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: "2px 8px",
                              borderRadius: 6,
                              color,
                              background: `${color}1A`,
                              fontFamily: "var(--font-mono)",
                              textTransform: "capitalize",
                            }}>
                              {formatLabel(appointment.status)}
                            </span>
                          )
                        })()}
                      </InfoRow>
                      {appointment.notes && (
                        <InfoRow label="Notes">
                          <span style={{ color: "#636366" }}>{appointment.notes}</span>
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
