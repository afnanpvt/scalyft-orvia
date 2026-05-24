import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Phone, ChevronLeft, ChevronRight, PhoneIncoming, PhoneOff, PhoneMissed, PhoneForwarded, Clock, Calendar } from "lucide-react"

import { getCalls } from "@/lib/api"
import type { Call } from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────

function formatDate(dateString: string | null): string {
  if (!dateString) return ""
  const d = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatTime(dateString: string | null): string {
  if (!dateString) return ""
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatDuration(secs: number | null): string {
  if (secs == null || secs === 0) return ""
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ─── Outcome config ───────────────────────────────────────

const OUTCOME: Record<string, { label: string; bg: string; color: string; border: string; icon: React.ElementType }> = {
  appointment_booked: { label: "Booked",   bg: "#D1FAE5", color: "#065F46", border: "rgba(16,185,129,0.25)",   icon: Calendar },
  lead_captured:      { label: "Lead",     bg: "#EEF2FF", color: "#4338CA", border: "rgba(99,102,241,0.25)",   icon: PhoneIncoming },
  info_given:         { label: "Info",     bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)", icon: PhoneIncoming },
  transferred:        { label: "Transfer", bg: "#FEF3C7", color: "#92400E", border: "rgba(245,158,11,0.25)",   icon: PhoneForwarded },
  missed:             { label: "Missed",   bg: "#FEE2E2", color: "#991B1B", border: "rgba(229,72,77,0.25)",    icon: PhoneMissed },
  failed:             { label: "Failed",   bg: "#FEE2E2", color: "#991B1B", border: "rgba(229,72,77,0.25)",    icon: PhoneOff },
}

function getOutcome(outcome: string | null) {
  return OUTCOME[outcome ?? ""] ?? {
    label: outcome?.replace(/_/g, " ") ?? "Unknown",
    bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)",
    icon: PhoneIncoming,
  }
}

// ─── Skeleton ─────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
      <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <div className="skeleton" style={{ height: 13, width: 130, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 11, width: 48, borderRadius: 4 }} />
        </div>
        <div className="skeleton" style={{ height: 11, width: "55%", borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ width: 64, height: 24, borderRadius: 8, flexShrink: 0 }} />
    </div>
  )
}

// ─── Call Row ─────────────────────────────────────────────

function CallRow({ call }: { call: Call }) {
  const o = getOutcome(call.outcome ?? null)
  const Icon = o.icon
  const duration = formatDuration(call.duration_secs)
  const time = formatTime(call.started_at ?? call.created_at)
  const date = formatDate(call.started_at ?? call.created_at)

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="row-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: o.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        border: `1px solid ${o.border}`,
      }}>
        <Icon style={{ width: 16, height: 16, color: o.color }} strokeWidth={1.75} />
      </div>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
            {call.caller_phone ?? "Unknown caller"}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0, fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>
            {time && date ? `${time} · ${date}` : date || time}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
          {call.summary ?? "No summary available"}
        </p>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {duration && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock style={{ width: 11, height: 11, color: "var(--muted-foreground)", opacity: 0.6 }} strokeWidth={1.5} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{duration}</span>
          </div>
        )}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
          background: o.bg, color: o.color, whiteSpace: "nowrap", letterSpacing: "0.01em",
          border: `1px solid ${o.border}`,
        }}>
          {o.label}
        </span>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function CallsPage() {
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calls", page],
    queryFn: () => getCalls(page, pageSize),
  })

  const calls = data?.calls ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div className="animate-fade-up animate-fade-up-1">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)", fontFamily: "Geist, sans-serif" }}>
            Calls
          </h1>
          {!isLoading && total > 0 && (
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: "var(--primary-foreground)",
              background: "var(--foreground)", padding: "2px 9px", borderRadius: 999,
              fontFamily: "Geist Mono, monospace", fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
            }}>
              {total}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4, letterSpacing: "-0.01em" }}>
          Every call handled by Orvia
        </p>
      </div>

      {isError && (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#E5484D", fontWeight: 500 }}>Could not load calls</p>
          <button onClick={() => refetch()} style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
            Try again
          </button>
        </div>
      )}

      {/* Table card */}
      <div className="ios-card animate-fade-up animate-fade-up-2" style={{ padding: 0, overflow: "hidden" }}>

        {/* Column headers */}
        {!isLoading && calls.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
          }}>
            <div style={{ width: 38, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Caller</span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Outcome</span>
          </div>
        )}

        {isLoading ? (
          <>{Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}</>
        ) : calls.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" }}>
              <Phone style={{ width: 22, height: 22, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>No calls yet</p>
              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6, maxWidth: 220 }}>
                Calls will appear here as soon as someone dials your Orvia number.
              </p>
            </div>
          </div>
        ) : (
          calls.map((call: Call) => <CallRow key={call.id} call={call} />)
        )}

        {/* Pagination */}
        {!isLoading && total > pageSize && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", borderTop: "1px solid var(--border)",
            background: "var(--muted)",
          }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page <= 1}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)", cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "0 8px", fontVariantNumeric: "tabular-nums" }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page >= totalPages}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)", cursor: page >= totalPages ? "not-allowed" : "pointer",
                  opacity: page >= totalPages ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
