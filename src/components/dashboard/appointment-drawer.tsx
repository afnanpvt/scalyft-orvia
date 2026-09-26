import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { X, Phone, Clock, FileText, ArrowRight } from "lucide-react"
import { getCallById } from "@/lib/api"
import type { Appointment, TranscriptTurn } from "@/lib/types"

// Slide-over with everything needed before an appointment: who, when, why,
// and what they actually said on the call that booked it.

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function formatDuration(secs: number | null) {
  if (!secs) return null
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

export function AppointmentDrawer({ appointment, onClose }: { appointment: Appointment | null; onClose: () => void }) {
  const callId = appointment?.call_id ?? null
  const { data: call, isLoading } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => getCallById(callId!),
    enabled: !!callId,
  })

  useEffect(() => {
    if (!appointment) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [appointment, onClose])

  if (!appointment) return null
  const transcript = (call?.transcript ?? []) as TranscriptTurn[]

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 150 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,11,0.28)" }} />
      <aside role="dialog" aria-label={`Appointment with ${appointment.customer_name}`} className="animate-toast-in"
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "100vw",
          background: "var(--background)", borderLeft: "1px solid var(--border)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
        }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.02em" }}>{appointment.customer_name}</p>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
              {appointment.service_type ?? "Appointment"} · {formatWhen(appointment.scheduled_start)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <Section title="Contact">
            <a href={`tel:${appointment.customer_phone}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--foreground)", textDecoration: "none", fontVariantNumeric: "tabular-nums" }}>
              <Phone size={14} /> {appointment.customer_phone}
            </a>
            {appointment.notes && (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>{appointment.notes}</p>
            )}
          </Section>

          {!callId ? (
            <Section title="From the call">
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Added manually, so there's no call attached.</p>
            </Section>
          ) : isLoading ? (
            <Section title="From the call">
              <div className="skeleton" style={{ height: 14, width: "80%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "60%" }} />
            </Section>
          ) : call ? (
            <>
              <Section title="From the call">
                <p style={{ fontSize: 14, color: "var(--foreground)", lineHeight: 1.55 }}>
                  {call.summary ?? "No summary for this call."}
                </p>
                <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
                  <Clock size={12} />
                  Booked {new Date(call.started_at ?? call.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {formatDuration(call.duration_secs) && <> · {formatDuration(call.duration_secs)} call</>}
                </p>
              </Section>

              <Section title="Conversation">
                {transcript.length === 0 ? (
                  <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted-foreground)" }}>
                    <FileText size={13} /> Transcript isn't available yet.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {transcript.map((t, i) => {
                      const ai = t.role === "assistant"
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: ai ? "flex-start" : "flex-end" }}>
                          <div style={{
                            maxWidth: "85%", padding: "7px 11px", fontSize: 13, lineHeight: 1.45,
                            borderRadius: ai ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                            background: ai ? "var(--muted)" : "var(--foreground)",
                            color: ai ? "var(--foreground)" : "var(--background)",
                          }}>
                            {t.content}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
            </>
          ) : null}
        </div>

        {callId && (
          <Link to="/calls/$id" params={{ id: callId }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "14px 20px", borderTop: "1px solid var(--border)",
              fontSize: 13, fontWeight: 600, color: "var(--foreground)", textDecoration: "none",
            }}>
            Open full call <ArrowRight size={14} />
          </Link>
        )}
      </aside>
    </div>
  )
}
