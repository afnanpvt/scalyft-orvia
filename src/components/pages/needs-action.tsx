import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { AlertTriangle, Phone, CheckCircle2, X, Filter as FilterIcon } from "lucide-react"

import {
  getUnresolvedOperationalEvents,
  getPendingCallQueue,
  resolveOperationalEvent,
  markQueueItemHandled,
} from "@/lib/api"
import type { OperationalEvent, CallQueueItem } from "@/lib/types"

type Filter = "all" | "events" | "queue"

const EVENT_LABELS: Record<OperationalEvent["event_type"], string> = {
  ai_failure: "AI Failed",
  partial_booking: "Partial Booking",
  concurrent_call: "Concurrent Call",
  transfer_unknown: "Unknown Transfer",
}

const SEVERITY_STYLES: Record<OperationalEvent["severity"], { text: string; bg: string; border: string }> = {
  critical: { text: "#991B1B", bg: "rgba(229,72,77,0.1)",   border: "rgba(229,72,77,0.2)" },
  warning:  { text: "#92400E", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" },
  info:     { text: "#1E40AF", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.2)" },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function EventCard({ event, onResolve, onOpen }: { event: OperationalEvent; onResolve: (id: string) => void; onOpen: (callId: string | null) => void }) {
  const sev = SEVERITY_STYLES[event.severity]
  const p = event.payload ?? {}
  const phone = (p.caller_phone as string) ?? null
  const reason = (p.ended_reason as string) ?? null

  return (
    <div className={event.call_id ? "ios-card ios-card-interactive" : "ios-card"}
      role={event.call_id ? "button" : undefined} tabIndex={event.call_id ? 0 : undefined}
      onClick={() => onOpen(event.call_id)}
      onKeyDown={e => { if (e.key === "Enter") onOpen(event.call_id) }}
      style={{ padding: 14, cursor: event.call_id ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: sev.bg, border: `1px solid ${sev.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={14} color={sev.text} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              color: sev.text, background: sev.bg, border: `1px solid ${sev.border}`,
              letterSpacing: "0.01em",
            }}>
              {EVENT_LABELS[event.event_type]}
            </span>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{timeAgo(event.created_at)}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", marginBottom: 2, letterSpacing: "-0.01em" }}>
            {phone ?? "Unknown caller"}
          </p>
          {reason && (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
              {reason.replace(/-/g, " ")}
            </p>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => onResolve(event.id)} style={pillBtn}>
              <CheckCircle2 size={11} strokeWidth={1.75} /> Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function QueueCard({ item, onHandled, onOpen }: { item: CallQueueItem; onHandled: (id: string) => void; onOpen: (callId: string | null) => void }) {
  const isPartial = item.queue_type === "partial_booking"
  return (
    <div className={item.call_id ? "ios-card ios-card-interactive" : "ios-card"}
      role={item.call_id ? "button" : undefined} tabIndex={item.call_id ? 0 : undefined}
      onClick={() => onOpen(item.call_id)}
      onKeyDown={e => { if (e.key === "Enter") onOpen(item.call_id) }}
      style={{ padding: 14, cursor: item.call_id ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: isPartial ? "rgba(245,158,11,0.12)" : "var(--muted)",
          border: `1px solid ${isPartial ? "rgba(245,158,11,0.25)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Phone size={14} color={isPartial ? "#92400E" : "var(--muted-foreground)"} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              color: isPartial ? "#92400E" : "var(--muted-foreground)",
              background: isPartial ? "rgba(245,158,11,0.12)" : "var(--muted)",
              border: `1px solid ${isPartial ? "rgba(245,158,11,0.25)" : "var(--border)"}`,
              letterSpacing: "0.01em",
            }}>
              {isPartial ? "Partial booking" : "Missed call"}
            </span>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{timeAgo(item.created_at)}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", marginBottom: 2, letterSpacing: "-0.01em" }}>
            {item.caller_name ?? item.caller_phone ?? "Unknown caller"}
          </p>
          {item.service_needed && (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
              {item.service_needed}
            </p>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
            {item.caller_phone && (
              <a href={`tel:${item.caller_phone}`} style={pillBtn}>
                <Phone size={11} strokeWidth={1.75} /> Call back
              </a>
            )}
            <button type="button" onClick={() => onHandled(item.id)} style={pillBtn}>
              <CheckCircle2 size={11} strokeWidth={1.75} /> Mark handled
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const pillBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11.5, fontWeight: 500, padding: "5px 10px",
  borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--foreground)",
  textDecoration: "none", cursor: "pointer",
  letterSpacing: "-0.01em",
}

export default function NeedsActionPage() {
  const [filter, setFilter] = useState<Filter>("all")
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function openCall(callId: string | null) {
    if (callId) navigate({ to: "/calls/$id", params: { id: callId } })
  }

  const { data: rawEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["operational-events"],
    queryFn: getUnresolvedOperationalEvents,
    refetchInterval: 30_000,
  })
  const { data: queue = [], isLoading: queueLoading } = useQuery({
    queryKey: ["call-queue"],
    queryFn: getPendingCallQueue,
    refetchInterval: 30_000,
  })

  // Same dedupe as the bell: a partial booking's event and queue item show once.
  const queuedCallIds = new Set(queue.map(q => q.call_id).filter(Boolean))
  const events = rawEvents.filter(e => !(e.call_id && queuedCallIds.has(e.call_id)))

  async function handleResolveEvent(id: string) {
    await resolveOperationalEvent(id)
    queryClient.setQueryData<OperationalEvent[]>(["operational-events"], prev => (prev ?? []).filter(e => e.id !== id))
  }
  async function handleQueueHandled(id: string) {
    await markQueueItemHandled(id)
    queryClient.setQueryData<CallQueueItem[]>(["call-queue"], prev => (prev ?? []).filter(q => q.id !== id))
  }

  const showEvents = filter !== "queue"
  const showQueue = filter !== "events"
  const total = events.length + queue.length

  const sortedEvents = useMemo(() => {
    const severityRank = { critical: 0, warning: 1, info: 2 } as const
    return [...events].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
  }, [events])

  const isLoading = eventsLoading || queueLoading
  const allClear = !isLoading && events.length === 0 && queue.length === 0

  return (
    <div className="pb-12">
      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)" }}>
          Needs Action
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          {allClear ? "All clear" : `${total} item${total !== 1 ? "s" : ""} need attention`}
        </p>
      </div>

      {!allClear && (
        <div style={{
          display: "flex", gap: 4, padding: 3,
          background: "var(--muted)", borderRadius: 10, width: "fit-content", marginBottom: 18,
        }}>
          {([
            ["all", "All", total],
            ["events", "Issues", events.length],
            ["queue", "Queue", queue.length],
          ] as const).map(([key, label, n]) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none",
                fontSize: 12.5, fontWeight: filter === key ? 600 : 500,
                color: filter === key ? "var(--foreground)" : "var(--muted-foreground)",
                background: filter === key ? "var(--background)" : "transparent",
                cursor: "pointer",
                boxShadow: filter === key ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              {label}
              {n > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                  background: filter === key ? "var(--foreground)" : "var(--border)",
                  color: filter === key ? "var(--background)" : "var(--muted-foreground)",
                  minWidth: 16, textAlign: "center",
                }}>{n}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {allClear ? (
        <div className="ios-card" style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, margin: "0 auto 14px",
            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CheckCircle2 size={20} color="#10B981" strokeWidth={1.75} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 4, letterSpacing: "-0.01em" }}>
            Everything's handled
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Issues and queued callbacks show up here when they need you.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {showEvents && sortedEvents.map(e => (
            <EventCard key={e.id} event={e} onResolve={handleResolveEvent} onOpen={openCall} />
          ))}
          {showQueue && queue.map(item => (
            <QueueCard key={item.id} item={item} onHandled={handleQueueHandled} onOpen={openCall} />
          ))}
        </div>
      )}
    </div>
  )
}
