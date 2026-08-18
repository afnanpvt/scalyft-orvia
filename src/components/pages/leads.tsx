import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { UserPlus, Phone, ChevronLeft, ChevronRight } from "lucide-react"

import { getLeads } from "@/lib/api"
import type { Lead } from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function urgencyStyle(urgency: string): { text: string; bg: string; border: string } {
  switch (urgency) {
    case "emergency": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)",  border: "rgba(255,59,48,0.2)" }
    case "urgent":    return { text: "#FF9500", bg: "rgba(255,149,0,0.1)",  border: "rgba(255,149,0,0.2)" }
    case "routine":   return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
    case "inquiry":   return { text: "#007AFF", bg: "rgba(0,122,255,0.1)", border: "rgba(0,122,255,0.2)" }
    default:          return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
  }
}

function statusStyle(status: string): { text: string; bg: string; border: string } {
  switch (status) {
    case "new":       return { text: "#007AFF", bg: "rgba(0,122,255,0.1)",   border: "rgba(0,122,255,0.2)" }
    case "contacted": return { text: "#5856D6", bg: "rgba(88,86,214,0.1)",   border: "rgba(88,86,214,0.2)" }
    case "booked":    return { text: "#10B981", bg: "#D1FAE5",                border: "rgba(16,185,129,0.25)" }
    case "closed":    return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
    case "lost":      return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)",   border: "rgba(255,59,48,0.2)" }
    default:          return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)" }
  }
}

const FILTERS = ["all", "new", "contacted", "booked", "closed"] as const

const EMPTY_TEXT: Record<string, string> = {
  all:       "No leads yet. They'll appear here when Orvia captures caller inquiries.",
  new:       "No new leads right now.",
  contacted: "No leads have been contacted yet.",
  booked:    "No leads have been booked yet.",
  closed:    "No closed leads.",
}

// ─── Skeleton ─────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="skeleton" style={{ height: 13, width: 160, borderRadius: 4, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 11, width: 100, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="skeleton" style={{ height: 22, width: 60, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 11, width: 90, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 22, width: 50, borderRadius: 6 }} />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function LeadsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>("all")
  const pageSize = 20
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leads", page, status],
    queryFn: () => getLeads(page, pageSize, status),
  })

  const leads = data?.leads ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  function handleFilterChange(f: string) {
    setStatus(f)
    setPage(1)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div
        className="animate-fade-up animate-fade-up-1"
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)", fontFamily: "Geist, sans-serif" }}>
              Leads
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
            Caller inquiries captured by Orvia
          </p>
        </div>

        {/* Filter pills */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: "var(--muted)",
          borderRadius: 10,
          padding: 3,
          border: "1px solid var(--border)",
        }}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              style={{
                fontSize: 12,
                fontWeight: status === filter ? 600 : 400,
                padding: "5px 13px",
                borderRadius: 7,
                textTransform: "capitalize",
                border: status === filter ? "1px solid var(--border)" : "1px solid transparent",
                cursor: "pointer",
                background: status === filter ? "var(--card)" : "transparent",
                color: status === filter ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: status === filter ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
                letterSpacing: "-0.01em",
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#E5484D", fontWeight: 500 }}>Something went wrong loading leads.</p>
          <button
            onClick={() => refetch()}
            style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Card */}
      <div className="ios-card animate-fade-up animate-fade-up-2" style={{ padding: 0, overflow: "hidden" }}>

        {/* Column headers */}
        {!isLoading && leads.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
          }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Lead</span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Details</span>
          </div>
        )}

        {isLoading ? (
          <>{Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}</>
        ) : leads.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, background: "var(--muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--border)",
            }}>
              <UserPlus style={{ width: 22, height: 22, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
              {EMPTY_TEXT[status] ?? `No ${status} leads`}
            </p>
          </div>
        ) : (
          leads.map((lead: Lead) => {
            const urg = urgencyStyle(lead.urgency)
            const sta = statusStyle(lead.status)
            return (
              <div
                key={lead.id}
                className="row-hover"
                onClick={() => {
                  if (lead.call_id) navigate({ to: "/calls/$id", params: { id: lead.call_id } })
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: "1px solid var(--border)",
                  cursor: lead.call_id ? "pointer" : "default",
                  minHeight: 56,
                }}
              >
                {/* Name + service */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                    {lead.name ?? "Unknown caller"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {lead.service_needed ?? "No service specified"}
                  </p>
                </div>

                {/* Metadata */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {/* Urgency badge */}
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                    color: urg.text, background: urg.bg, border: `1px solid ${urg.border}`,
                    textTransform: "capitalize", letterSpacing: "0.01em", whiteSpace: "nowrap",
                  }}>
                    {lead.urgency}
                  </span>

                  {/* Phone */}
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontSize: 12, color: "var(--muted-foreground)",
                      textDecoration: "none", fontFamily: "Geist Mono, monospace",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#007AFF"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"}
                  >
                    <Phone style={{ width: 11, height: 11 }} strokeWidth={1.5} />
                    {lead.phone}
                  </a>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                    color: sta.text, background: sta.bg, border: `1px solid ${sta.border}`,
                    textTransform: "capitalize", letterSpacing: "0.01em", whiteSpace: "nowrap",
                  }}>
                    {lead.status}
                  </span>

                  {/* Time */}
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.6, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {formatRelativeTime(lead.created_at)}
                  </span>
                </div>
              </div>
            )
          })
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
                type="button"
                onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page <= 1}
                aria-label="Previous page"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.3 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "0 8px", fontVariantNumeric: "tabular-nums" }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page >= totalPages}
                aria-label="Next page"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  opacity: page >= totalPages ? 0.3 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
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
