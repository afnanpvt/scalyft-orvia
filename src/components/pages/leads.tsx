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
  if (diffDays === 1) {
    return `Yesterday ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  }
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const urgencyBadge: Record<string, string> = {
  emergency: "bg-red-500/10 text-red-700 border border-red-500/20",
  urgent: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  routine: "bg-muted text-muted-foreground border border-transparent",
  inquiry: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
}

const statusBadge: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700",
  contacted: "bg-violet-500/10 text-violet-700",
  booked: "bg-emerald-500/10 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  lost: "bg-red-500/10 text-red-600",
}

const FILTERS = ["all", "new", "contacted", "booked", "closed"] as const

const EMPTY_TEXT: Record<string, string> = {
  all: "No leads yet. They'll appear here when Orvia captures caller inquiries.",
  new: "No new leads right now.",
  contacted: "No leads have been contacted yet.",
  booked: "No leads have been booked yet.",
  closed: "No closed leads.",
}

// --- Skeletons ----------------------------------------------

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-36 bg-muted/50 animate-pulse rounded-lg" />
        <div className="h-3 w-24 bg-muted/30 animate-pulse rounded-lg" />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="h-5 w-16 bg-muted/40 animate-pulse rounded-full" />
        <div className="h-3 w-20 bg-muted/30 animate-pulse rounded-lg" />
        <div className="h-5 w-16 bg-muted/40 animate-pulse rounded-full" />
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.04em]">Leads</h1>
            {!isLoading && total > 0 && (
              <span className="text-[14px] tabular-nums text-muted-foreground/35">{total}</span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground/50 mt-1">
            Caller inquiries captured by Orvia
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 self-start sm:self-auto">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md capitalize transition-colors cursor-pointer ${
                status === filter
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="py-16 text-center">
          <p className="text-[14px] text-destructive">Something went wrong loading leads.</p>
          <button onClick={() => refetch()} className="text-[13px] text-muted-foreground/50 hover:text-foreground mt-2 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* Card */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        {isLoading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <UserPlus className="size-8 text-muted-foreground/15" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground/40 text-center max-w-[260px]">
              {EMPTY_TEXT[status] ?? `No ${status} leads`}
            </p>
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
              className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border/40 last:border-0 transition-colors duration-100 ${
                lead.call_id ? "hover:bg-accent/20 cursor-pointer" : "cursor-default"
              }`}
            >
              {/* Name + service */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate leading-tight">
                  {lead.name ?? "Unknown caller"}
                </p>
                <p className="text-[12px] text-muted-foreground/50 truncate mt-0.5">
                  {lead.service_needed ?? "No service specified"}
                </p>
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    urgencyBadge[lead.urgency] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {lead.urgency}
                </span>
                <a
                  href={`tel:${lead.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <Phone className="size-3" />
                  {lead.phone}
                </a>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    statusBadge[lead.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {lead.status}
                </span>
                <span className="text-[11px] text-muted-foreground/35 tabular-nums whitespace-nowrap hidden sm:block">
                  {formatRelativeTime(lead.created_at)}
                </span>
              </div>
            </div>
          ))
        )}

        {/* Pagination */}
        {!isLoading && total > pageSize && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/40 bg-background/40">
            <span className="text-[11px] tabular-nums text-muted-foreground/40">
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page <= 1}
                className="flex items-center justify-center size-7 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-[11px] tabular-nums text-muted-foreground/50 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page >= totalPages}
                className="flex items-center justify-center size-7 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
