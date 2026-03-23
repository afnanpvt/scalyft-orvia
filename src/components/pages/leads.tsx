import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { UserPlus, Phone } from "lucide-react"

import { getLeads } from "@/lib/api"
import type { Lead } from "@/lib/types"

// ─── Helpers ────────────────────────────────────────────

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
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays === 1) {
    return `Yesterday ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
  }
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const urgencyStyles: Record<string, string> = {
  emergency: "bg-red-500/10 text-red-700",
  urgent: "bg-amber-500/10 text-amber-700",
  routine: "bg-muted text-muted-foreground",
  inquiry: "bg-blue-500/10 text-blue-700",
}

const statusStyles: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700",
  contacted: "bg-violet-500/10 text-violet-700",
  booked: "bg-emerald-500/10 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  lost: "bg-red-500/10 text-red-600",
}

const FILTERS = ["all", "new", "contacted", "booked", "closed"] as const

const EMPTY_STATE_TEXT: Record<string, string> = {
  all: "No leads yet. They'll appear here when Orvia captures patient inquiries.",
  new: "No new leads right now.",
  contacted: "No leads have been contacted yet.",
  booked: "No leads have been booked yet.",
  closed: "No closed leads.",
}

// ─── Skeletons ──────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="py-4 border-b border-border/10 flex items-center justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="h-3.5 w-32 bg-muted/40 animate-pulse rounded-lg" />
        <div className="h-3 w-24 bg-muted/40 animate-pulse rounded-lg" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-5 w-16 bg-muted/40 animate-pulse rounded-full" />
        <div className="h-3 w-20 bg-muted/40 animate-pulse rounded-lg" />
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────

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
    <div className="space-y-0">
      {/* Header + Filter tabs — stack on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between border-b border-border/40 pb-0">
        <div className="flex flex-col gap-1 pb-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-[-0.03em]">Leads</h1>
            {!isLoading && total > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground/50">
                {total}
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground/30">
            Patient inquiries captured by Orvia
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3 sm:gap-4 pb-2 sm:pb-0">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              className={`text-[12px] font-medium pb-2 capitalize transition-colors cursor-pointer ${
                status === filter
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground/30 hover:text-muted-foreground"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="py-24 text-center">
          <p className="text-[14px] text-destructive">Something went wrong loading leads.</p>
          <button onClick={() => refetch()} className="text-[13px] text-muted-foreground/50 hover:text-foreground mt-2 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* Lead cards */}
      <div>
        {isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : leads.length === 0 ? (
          <div className="py-24 text-center">
            <div className="flex flex-col items-center gap-3">
              <UserPlus className="size-8 text-muted-foreground/15" />
              <p className="text-[13px] text-muted-foreground/40">
                {EMPTY_STATE_TEXT[status] ?? `No ${status} leads`}
              </p>
            </div>
          </div>
        ) : (
          leads.map((lead: Lead) => (
            <div
              key={lead.id}
              onClick={() => {
                if (lead.call_id) {
                  navigate({ to: "/calls/$id", params: { id: lead.call_id } })
                }
              }}
              className={`py-4 border-b border-border/10 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 transition-colors duration-150 ${
                lead.call_id
                  ? "hover:bg-accent/10 cursor-pointer"
                  : "cursor-default"
              }`}
            >
              {/* Name + Service */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate">
                  {lead.name ?? "Unknown"}
                </p>
                <p className="text-[13px] text-muted-foreground/40 truncate">
                  {lead.service_needed ?? "--"}
                </p>
              </div>

              {/* Urgency badge + time */}
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    urgencyStyles[lead.urgency] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {lead.urgency}
                </span>
                <span className="text-[11px] text-muted-foreground/25 tabular-nums whitespace-nowrap">
                  {formatRelativeTime(lead.created_at)}
                </span>
              </div>

              {/* Phone + Status */}
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={`tel:${lead.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground/30 hover:text-foreground transition-colors"
                >
                  <Phone className="size-3" />
                  {lead.phone}
                </a>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    statusStyles[lead.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {lead.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-[11px] tabular-nums text-muted-foreground/30">
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              disabled={page <= 1}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              disabled={page >= totalPages}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
