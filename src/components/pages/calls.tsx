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

// --- Badge styles -------------------------------------------

const outcomeDotColors: Record<string, string> = {
  appointment_booked: "bg-emerald-500",
  lead_captured: "bg-blue-500",
  info_given: "bg-muted-foreground/30",
  transferred: "bg-amber-500",
  missed: "bg-red-500",
}

const outcomeBadgeStyles: Record<string, string> = {
  appointment_booked: "bg-emerald-500/10 text-emerald-700",
  lead_captured: "bg-blue-500/10 text-blue-700",
  info_given: "bg-muted text-muted-foreground",
  transferred: "bg-amber-500/10 text-amber-700",
  missed: "bg-red-500/10 text-red-700",
}

// --- Skeletons ----------------------------------------------

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0">
      <div className="size-2 rounded-full bg-muted/50 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-32 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-2.5 w-14 bg-muted/40 animate-pulse rounded-lg" />
        </div>
        <div className="h-3 w-3/4 bg-muted/30 animate-pulse rounded-lg" />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="h-5 w-24 bg-muted/40 animate-pulse rounded-full" />
        <div className="h-3 w-10 bg-muted/30 animate-pulse rounded-lg" />
      </div>
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">Calls</h1>
          {!isLoading && total > 0 && (
            <span className="text-[14px] tabular-nums text-muted-foreground/35">{total}</span>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground/50 mt-1">
          Every call handled by Orvia
        </p>
      </div>

      {/* Error */}
      {isError && (
        <div className="py-16 text-center">
          <p className="text-[14px] text-destructive">Something went wrong loading calls.</p>
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
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Phone className="size-8 text-muted-foreground/15" strokeWidth={1.5} />
            <div className="text-center space-y-1">
              <p className="text-[14px] font-medium text-muted-foreground/40">No calls yet</p>
              <p className="text-[12px] text-muted-foreground/25">
                Calls will appear here when callers reach your Orvia number
              </p>
            </div>
          </div>
        ) : (
          calls.map((call: Call) => (
            <Link
              key={call.id}
              to="/calls/$id"
              params={{ id: call.id }}
              className="flex items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0 hover:bg-accent/20 transition-colors duration-100 cursor-pointer"
            >
              {/* Outcome dot */}
              <div
                className={`size-2 rounded-full shrink-0 ${
                  outcomeDotColors[call.outcome ?? ""] ?? "bg-muted-foreground/20"
                }`}
              />

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-medium truncate">
                    {call.caller_phone ?? "Unknown caller"}
                  </span>
                  <span className="text-[11px] text-muted-foreground/35 tabular-nums shrink-0">
                    {formatRelativeTime(call.started_at ?? call.created_at)}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground/50 truncate mt-0.5">
                  {call.summary ?? "No summary"}
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${
                    outcomeBadgeStyles[call.outcome ?? ""] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatLabel(call.outcome)}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground/35 w-12 text-right hidden sm:block">
                  {formatDuration(call.duration_secs)}
                </span>
              </div>
            </Link>
          ))
        )}

        {/* Pagination — inside the card */}
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
