import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Phone, ChevronLeft, ChevronRight } from "lucide-react"

import { getCalls } from "@/lib/api"
import type { Call } from "@/lib/types"

// --- Helpers ------------------------------------------------

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "--"
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return `Yesterday ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function formatDuration(secs: number | null): string {
  if (secs == null) return "--"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatLabel(value: string | null): string {
  if (!value) return "Unknown"
  return value.replace(/_/g, " ")
}

// --- Outcome styles -----------------------------------------

function outcomeColor(outcome: string | null): string {
  switch (outcome) {
    case "appointment_booked": return "#34C759"
    case "lead_captured": return "#007AFF"
    case "transferred": return "#FF9500"
    case "missed": return "#FF3B30"
    default: return "#AEAEB2"
  }
}

function outcomeBg(outcome: string | null): string {
  switch (outcome) {
    case "appointment_booked": return "rgba(52,199,89,0.1)"
    case "lead_captured": return "rgba(0,122,255,0.1)"
    case "transferred": return "rgba(255,149,0,0.1)"
    case "missed": return "rgba(255,59,48,0.1)"
    default: return "rgba(142,142,147,0.1)"
  }
}

// --- Skeleton -----------------------------------------------

function RowSkeleton() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 18px",
      borderBottom: "0.5px solid rgba(60,60,67,0.08)",
    }}>
      <div style={{ width: 3, height: 32, borderRadius: 3, background: "rgba(60,60,67,0.08)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ height: 13, width: 120, background: "rgba(60,60,67,0.08)", borderRadius: 4 }} />
          <div style={{ height: 11, width: 50, background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
        </div>
        <div style={{ height: 11, width: "65%", background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
      </div>
      <div style={{ height: 20, width: 80, background: "rgba(60,60,67,0.06)", borderRadius: 6 }} />
    </div>
  )
}

// --- Page ---------------------------------------------------

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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div className="animate-fade-up animate-fade-up-1">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.5px", color: "#1C1C1E" }}>Calls</h1>
          {!isLoading && total > 0 && (
            <span style={{ fontSize: 14, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>{total}</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#8E8E93", marginTop: 4 }}>Every call handled by Orvia</p>
      </div>

      {/* Error */}
      {isError && (
        <div style={{ padding: "64px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#FF3B30" }}>Something went wrong loading calls.</p>
          <button
            onClick={() => refetch()}
            style={{ fontSize: 13, color: "#8E8E93", marginTop: 8, border: "none", background: "transparent", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Card */}
      <div
        className="ios-card animate-fade-up animate-fade-up-2"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {isLoading ? (
          <>
            <RowSkeleton /><RowSkeleton /><RowSkeleton />
            <RowSkeleton /><RowSkeleton /><RowSkeleton />
          </>
        ) : calls.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 0", gap: 10 }}>
            <Phone style={{ width: 32, height: 32, color: "#AEAEB2" }} strokeWidth={1.5} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#AEAEB2" }}>No calls yet</p>
              <p style={{ fontSize: 12, color: "#C7C7CC", marginTop: 4 }}>Calls appear here when callers reach your Orvia number</p>
            </div>
          </div>
        ) : (
          calls.map((call: Call) => {
            const color = outcomeColor(call.outcome ?? null)
            return (
              <Link
                key={call.id}
                to="/calls/$id"
                params={{ id: call.id }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  borderBottom: "0.5px solid rgba(60,60,67,0.08)",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background 0.15s",
                  minHeight: 56,
                }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#F2F2F7"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                {/* Left color strip */}
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: color, flexShrink: 0 }} />

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {call.caller_phone ?? "Unknown caller"}
                    </span>
                    <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {formatRelativeTime(call.started_at ?? call.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {call.summary ?? "No summary"}
                  </p>
                </div>

                {/* Chips */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 6,
                    color: color,
                    background: outcomeBg(call.outcome ?? null),
                    fontFamily: "var(--font-mono)",
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}>
                    {formatLabel(call.outcome)}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: "#AEAEB2",
                    fontFamily: "var(--font-mono)",
                    width: 44,
                    textAlign: "right",
                    display: "none",
                  }}
                  className="sm:block"
                  >
                    {formatDuration(call.duration_secs)}
                  </span>
                </div>
              </Link>
            )
          })
        )}

        {/* Pagination */}
        {!isLoading && total > pageSize && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderTop: "0.5px solid rgba(60,60,67,0.08)",
            background: "rgba(242,242,247,0.5)",
          }}>
            <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page <= 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: "0.5px solid rgba(60,60,67,0.2)",
                  background: "#FFFFFF",
                  color: "#636366",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.35 : 1,
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: 11, color: "#8E8E93", fontFamily: "var(--font-mono)", padding: "0 8px" }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page >= totalPages}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: "0.5px solid rgba(60,60,67,0.2)",
                  background: "#FFFFFF",
                  color: "#636366",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  opacity: page >= totalPages ? 0.35 : 1,
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
