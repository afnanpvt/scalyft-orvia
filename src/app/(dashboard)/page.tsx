import {
  getOverviewStats,
  getRecentCalls,
  getWeeklyCallStats,
  getOutcomeBreakdown,
} from "@/lib/queries"
import { Badge } from "@/components/ui/badge"
import { WeeklyChart } from "@/components/dashboard/weekly-chart"
import { OutcomeChart } from "@/components/dashboard/outcome-chart"
import {
  PhoneIcon,
  UserPlusIcon,
  CalendarCheckIcon,
  ActivityIcon,
  ArrowRightIcon,
  AlertCircleIcon,
} from "lucide-react"
import Link from "next/link"

export default async function OverviewPage() {
  const [stats, recentCalls, weeklyStats, outcomeBreakdown] =
    await Promise.all([
      getOverviewStats(),
      getRecentCalls(5),
      getWeeklyCallStats(),
      getOutcomeBreakdown(),
    ])

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div className="flex flex-col space-y-8 py-8 px-4 lg:px-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">{today}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Calls Today */}
        <div className="relative rounded-2xl border-0 bg-card p-6 shadow-none">
          <PhoneIcon className="absolute right-5 top-5 size-5 text-muted-foreground/30" />
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
            Calls Today
          </p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {stats.callsToday}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Handled by AI automatically
          </p>
        </div>

        {/* Leads Captured */}
        <div className="relative rounded-2xl border-0 bg-card p-6 shadow-none">
          <UserPlusIcon className="absolute right-5 top-5 size-5 text-muted-foreground/30" />
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
            Leads Captured
          </p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {stats.leadsToday}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            New patient inquiries today
          </p>
        </div>

        {/* Appointments Booked */}
        <div className="relative rounded-2xl border-0 bg-card p-6 shadow-none">
          <CalendarCheckIcon className="absolute right-5 top-5 size-5 text-muted-foreground/30" />
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
            Appointments
          </p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {stats.appointmentsToday}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Scheduled by AI receptionist
          </p>
        </div>

        {/* AI Status */}
        <div className="relative rounded-2xl border-0 bg-card p-6 shadow-none">
          <ActivityIcon className="absolute right-5 top-5 size-5 text-muted-foreground/30" />
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
            AI Status
          </p>
          <div className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            Active
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Online and taking calls
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <WeeklyChart data={weeklyStats} />
        </div>
        <div className="lg:col-span-2">
          <OutcomeChart data={outcomeBreakdown} />
        </div>
      </div>

      {/* Recent Calls */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
            Recent Calls
          </p>
          <Link
            href="/calls"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
        <div className="rounded-2xl border-0 bg-card shadow-none">
          {recentCalls.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-muted-foreground">
              No calls yet. Once your AI receptionist handles calls, they will
              appear here.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {recentCalls.map((call) => {
                const needsAttention =
                  call.outcome === null || call.status === "missed"

                return (
                  <Link
                    key={call.id}
                    href={`/calls/${call.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {needsAttention && (
                        <AlertCircleIcon className="size-4 shrink-0 text-amber-500" />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[14px] font-medium text-foreground">
                          {call.caller_phone ?? "Unknown caller"}
                        </span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {call.summary ?? "No summary available"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {call.outcome ? (
                        <Badge variant="secondary" className="capitalize">
                          {call.outcome.replace(/_/g, " ")}
                        </Badge>
                      ) : call.status === "missed" ? (
                        <Badge variant="outline" className="text-amber-600">
                          Missed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          No outcome
                        </Badge>
                      )}
                      <span className="w-8 text-right text-[12px] tabular-nums text-muted-foreground">
                        {call.duration_secs
                          ? `${Math.ceil(call.duration_secs / 60)}m`
                          : "\u2014"}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
