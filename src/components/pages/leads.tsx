import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { UserPlus, Phone, ChevronLeft, ChevronRight } from "lucide-react"

import { getLeads } from "@/lib/api"
import type { Lead } from "@/lib/types"

// --- Helpers ------------------------------------------------

function formatRelativeTime(dateString: string): string {
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

function urgencyColor(urgency: string): { text: string; bg: string; border: string } {
  switch (urgency) {
    case "emergency": return { text: "#FF3B30", bg: "rgba(255,59,48,0.08)", border: "rgba(255,59,48,0.2)" }
    case "urgent": return { text: "#FF9500", bg: "rgba(255,149,0,0.08)", border: "rgba(255,149,0,0.2)" }
    case "routine": return { text: "#8E8E93", bg: "rgba(142,142,147,0.08)", border: "rgba(142,142,147,0.15)" }
    case "inquiry": return { text: "#007AFF", bg: "rgba(0,122,255,0.08)", border: "rgba(0,122,255,0.2)" }
    default: return { text: "#8E8E93", bg: "rgba(142,142,147,0.08)", border: "transparent" }
  }
}

function statusColor(status: string): { text: string; bg: string } {
  switch (status) {
    case "new": return { text: "#007AFF", bg: "rgba(0,122,255,0.1)" }
    case "contacted": return { text: "#5856D6", bg: "rgba(88,86,214,0.1)" }
    case "booked": return { text: "#34C759", bg: "rgba(52,199,89,0.1)" }
    case "closed": return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
    case "lost": return { text: "#FF3B30", bg: "rgba(255,59,48,0.1)" }
    default: return { text: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
  }
}

const FILTERS = ["all", "new", "contacted", "booked", "closed"] as const

const EMPTY_TEXT: Record<string, string> = {
  all: "No leads yet. They'll appear here when Orvia captures caller inquiries.",
  new: "No new leads right now.",
  contacted: "No leads have been contacted yet.",
  booked: "No leads have been booked yet.",
  closed: "No closed leads.",
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ height: 13, width: 130, background: "rgba(60,60,67,0.08)", borderRadius: 4, marginBottom: 5 }} />
        <div style={{ height: 11, width: 90, background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ height: 20, width: 56, background: "rgba(60,60,67,0.06)", borderRadius: 6 }} />
        <div style={{ height: 11, width: 80, background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
        <div style={{ height: 20, width: 48, background: "rgba(60,60,67,0.06)", borderRadius: 6 }} />
      </div>
    </div>
  )
}

// --- Page ---------------------------------------------------

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

  function handleFilterChange(newStatus: string) {
    setStatus(newStatus)
    setPage(1)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div
        className="animate-fade-up animate-fade-up-1"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.5px", color: "#1C1C1E" }}>Leads</h1>
              {!isLoading && total > 0 && (
                <span style={{ fontSize: 14, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>{total}</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: "#8E8E93", marginTop: 4 }}>Caller inquiries captured by Orvia</p>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(60,60,67,0.08)",
            borderRadius: 10,
            padding: 3,
          }}>
            {FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => handleFilterChange(filter)}
                style={{
                  fontSize: 12,
                  fontWeight: status === filter ? 500 : 400,
                  padding: "5px 12px",
                  borderRadius: 8,
                  textTransform: "capitalize",
                  border: "none",
                  cursor: "pointer",
                  background: status === filter ? "#FFFFFF" : "transparent",
                  color: status === filter ? "#1C1C1E" : "#636366",
                  boxShadow: status === filter ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div style={{ padding: "64px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#FF3B30" }}>Something went wrong loading leads.</p>
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
        ) : leads.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 0", gap: 10 }}>
            <UserPlus style={{ width: 32, height: 32, color: "#AEAEB2" }} strokeWidth={1.5} />
            <p style={{ fontSize: 13, color: "#AEAEB2", textAlign: "center", maxWidth: 260 }}>
              {EMPTY_TEXT[status] ?? `No ${status} leads`}
            </p>
          </div>
        ) : (
          leads.map((lead: Lead) => {
            const urg = urgencyColor(lead.urgency)
            const sta = statusColor(lead.status)
            return (
              <div
                key={lead.id}
                onClick={() => {
                  if (lead.call_id) navigate({ to: "/calls/$id", params: { id: lead.call_id } })
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  padding: "12px 18px",
                  borderBottom: "0.5px solid rgba(60,60,67,0.08)",
                  cursor: lead.call_id ? "pointer" : "default",
                  transition: "background 0.15s",
                  minHeight: 56,
                }}
                onMouseEnter={(e) => {
                  if (lead.call_id) (e.currentTarget as HTMLElement).style.background = "#F2F2F7";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Name + service */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.name ?? "Unknown caller"}
                    </p>
                    <p style={{ fontSize: 12, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {lead.service_needed ?? "No service specified"}
                    </p>
                  </div>

                  {/* Metadata */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 6,
                      color: urg.text,
                      background: urg.bg,
                      border: `0.5px solid ${urg.border}`,
                      fontFamily: "var(--font-mono)",
                      textTransform: "capitalize",
                    }}>
                      {lead.urgency}
                    </span>
                    <a
                      href={`tel:${lead.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        color: "#8E8E93",
                        textDecoration: "none",
                        fontFamily: "var(--font-mono)",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#007AFF"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#8E8E93"}
                    >
                      <Phone style={{ width: 11, height: 11 }} />
                      {lead.phone}
                    </a>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 6,
                      color: sta.text,
                      background: sta.bg,
                      fontFamily: "var(--font-mono)",
                      textTransform: "capitalize",
                    }}>
                      {lead.status}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: "#AEAEB2",
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "nowrap",
                      display: "none",
                    }}
                    className="sm:block"
                    >
                      {formatRelativeTime(lead.created_at)}
                    </span>
                  </div>
                </div>
              </div>
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
