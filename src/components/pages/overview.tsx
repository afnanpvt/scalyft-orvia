import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Phone,
  Calendar,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
} from "lucide-react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  Tooltip,
} from "recharts"

import { getBriefing, getWeeklyCallStats } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Call, Appointment } from "@/lib/types"

// --- Helpers ------------------------------------------------

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildCallSummary(call: Call): string {
  if (call.summary) return call.summary
  const extracted = call.extracted_data ?? {}
  const name = (extracted.patient_name as string) ?? call.caller_phone ?? "Unknown"
  const service = (extracted.service_needed as string) ?? null
  const outcomeMap: Record<string, string> = {
    appointment_booked: "Appointment booked",
    lead_captured: "Lead captured",
    info_given: "Information provided",
    transferred: "Transferred to clinic",
    missed: "Missed",
  }
  const outcome = call.outcome ? outcomeMap[call.outcome] ?? call.outcome.replace(/_/g, " ") : ""
  if (service) return `${name} — ${service} → ${outcome}`
  return `${name} → ${outcome}`
}

function outcomeDot(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked": return "bg-emerald-500"
    case "lead_captured": return "bg-blue-500"
    case "transferred": return "bg-amber-500"
    case "missed": return "bg-red-500"
    default: return "bg-muted-foreground/30"
  }
}

// --- Skeletons ----------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/30 animate-pulse rounded ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-3 w-48 mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-2 w-20" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// --- Confidence Metrics -------------------------------------

function MetricBlock({
  value,
  label,
  accent,
}: {
  value: number | string
  label: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl px-6 py-5 ${
        accent
          ? "bg-foreground text-background"
          : "bg-card ring-1 ring-border/10"
      }`}
    >
      <p
        className={`text-4xl font-light tracking-[-0.04em] tabular-nums ${
          accent ? "text-background" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p
        className={`text-[10px] font-medium uppercase tracking-[0.12em] mt-1 ${
          accent ? "text-background/70" : "text-muted-foreground/65"
        }`}
      >
        {label}
      </p>
    </div>
  )
}

// --- Today's Appointments -----------------------------------

function AppointmentRow({ apt, isNext }: { apt: Appointment; isNext?: boolean }) {
  const isPast = new Date(apt.scheduled_start) < new Date()

  return (
    <div
      className={`flex items-center gap-4 py-3.5 border-b border-border/10 last:border-0 ${
        isNext ? "bg-accent/30 -mx-3 px-3 rounded-lg" : ""
      } ${isPast ? "opacity-40" : ""}`}
    >
      {/* Time */}
      <div className="w-16 shrink-0">
        <span className="text-[13px] font-medium tabular-nums">
          {formatTime(apt.scheduled_start)}
        </span>
        {isNext && (
          <span className="block text-[9px] font-medium uppercase tracking-[0.1em] text-emerald-600 mt-0.5">
            Next
          </span>
        )}
      </div>

      {/* Patient info */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate">
          {apt.patient_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {apt.service_type && (
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {apt.service_type}
            </span>
          )}
        </div>
      </div>

      {/* Contact — so doctor can call if patient is late */}
      {apt.patient_phone && (
        <a
          href={`tel:${apt.patient_phone}`}
          className="text-[11px] tabular-nums text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {apt.patient_phone}
        </a>
      )}

      {/* Status */}
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${
          apt.status === "confirmed"
            ? "bg-emerald-500/10 text-emerald-700"
            : apt.status === "completed"
              ? "bg-muted text-muted-foreground"
              : apt.status === "no_show"
                ? "bg-red-500/10 text-red-600"
                : "bg-amber-500/10 text-amber-700"
        }`}
      >
        {apt.status === "no_show" ? "No show" : apt.status}
      </span>
    </div>
  )
}

// --- Exception Call Row -------------------------------------

function ExceptionRow({ call }: { call: Call }) {
  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="flex items-center gap-3 py-3 border-b border-border/10 last:border-0 hover:bg-accent/20 -mx-1 px-1 rounded-lg transition-colors cursor-pointer"
    >
      <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] truncate">
          <span className="font-medium">{call.caller_phone ?? "Unknown"}</span>
          <span className="text-muted-foreground/65"> — </span>
          <span className="text-muted-foreground/50">
            {call.status === "transferred"
              ? "Transferred to clinic"
              : "Call failed"}
          </span>
        </p>
      </div>
      <span className="text-[11px] text-muted-foreground/55 tabular-nums shrink-0">
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Mini Weekly Chart (supporting context) -----------------

function WeeklyMiniChart({ data }: { data: { date: string; calls: number }[] }) {
  if (!data.length) return null

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55 mb-3">
        This week
      </p>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.25 }}
            tickMargin={8}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.15 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-popover border border-border/40 rounded-lg px-3 py-2 shadow-sm">
                  <p className="text-[10px] text-muted-foreground/50 mb-1">{label}</p>
                  <p className="text-[12px] font-medium tabular-nums">{payload[0].value} calls</p>
                </div>
              )
            }}
          />
          <Bar dataKey="calls" fill="var(--foreground)" radius={[3, 3, 0, 0]} barSize={16} opacity={0.15} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// --- Recent Activity Row ------------------------------------

function ActivityRow({ call }: { call: Call }) {
  const summary = buildCallSummary(call)
  const parts = summary.split("→")
  const hasArrow = parts.length > 1

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="flex items-center gap-3 py-2.5 group hover:bg-accent/15 -mx-1 px-1 rounded-lg transition-colors cursor-pointer"
    >
      <span className={`size-1.5 rounded-full shrink-0 ${outcomeDot(call.outcome)}`} />
      <p className="text-[12px] min-w-0 flex-1 truncate">
        {hasArrow ? (
          <>
            <span className="font-medium text-foreground">{parts[0].trim()}</span>
            <span className="text-muted-foreground/55"> → </span>
            <span className="text-muted-foreground/65">{parts.slice(1).join("→").trim()}</span>
          </>
        ) : (
          <span className="text-muted-foreground/50">{summary}</span>
        )}
      </p>
      <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Page ---------------------------------------------------

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null

  // Neutral, warm greetings that work any time of day
  const greetings = firstName
    ? [
        `Welcome back, ${firstName}`,
        `Hey ${firstName}, here's your update`,
        `Hi ${firstName}, here's what's happening`,
        `${firstName}, here's your overview`,
        `Here's your day, ${firstName}`,
      ]
    : [
        "Welcome back",
        "Here's your update",
        "Here's what's happening",
        "Your overview",
        "Here's your day",
      ]

  // Pick based on day of year so it changes daily but stays consistent within a day
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return greetings[dayOfYear % greetings.length]
}

export default function OverviewPage() {
  const { profile } = useAuth()

  const briefing = useQuery({
    queryKey: ["briefing"],
    queryFn: getBriefing,
    refetchInterval: 30_000,
  })

  const weekly = useQuery({
    queryKey: ["weekly-stats"],
    queryFn: getWeeklyCallStats,
  })

  if (briefing.isLoading) return <PageSkeleton />

  if (briefing.isError) return (
    <div className="py-24 text-center">
      <p className="text-[14px] text-destructive">Something went wrong loading your dashboard.</p>
      <button onClick={() => briefing.refetch()} className="text-[13px] text-muted-foreground/50 hover:text-foreground mt-2 cursor-pointer">
        Try again
      </button>
    </div>
  )

  const d = briefing.data
  const calls = d?.callsToday ?? 0
  const appointments = d?.appointmentsToday ?? 0
  const leads = d?.leadsToday ?? 0
  const todaysAppointments = d?.todaysAppointments ?? []
  const exceptions = d?.exceptionCalls ?? []
  const recentCalls = d?.recentCalls ?? []

  // Personalized greeting + status
  const greeting = getGreeting(profile.fullName)
  let status: string
  if (calls === 0) {
    status = "No calls yet today. Orvia is ready and listening."
  } else {
    const parts = [`Orvia handled ${calls} call${calls !== 1 ? "s" : ""} today`]
    if (appointments > 0) parts.push(`${appointments} appointment${appointments !== 1 ? "s" : ""} booked`)
    status = parts.join(". ") + "."
  }

  return (
    <div className="space-y-10">
      {/* Personalized greeting + briefing */}
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.03em]">
          {greeting}
        </h1>
        <p className="text-[14px] text-muted-foreground/50 leading-relaxed mt-2 tabular-nums">
          {status}
        </p>
        <p className="text-[11px] text-muted-foreground/50 mt-1">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Confidence metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricBlock value={calls} label="Calls handled" accent />
        <MetricBlock value={appointments} label="Appointments" />
        <MetricBlock value={leads} label="Leads captured" />
      </div>

      {/* Two-column: Appointments + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Today's appointments (3 cols) */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
              <Calendar className="size-3 inline-block mr-1.5 -mt-px" />
              Today's appointments
            </p>
            {todaysAppointments.length > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground/55">
                {todaysAppointments.length}
              </span>
            )}
          </div>
          {todaysAppointments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground/55 py-6">
              No appointments scheduled today.
            </p>
          ) : (
            <div>
              {(() => {
                // Sort by scheduled time (earliest first) — safety net
                const sorted = [...todaysAppointments].sort(
                  (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
                )
                // Find next upcoming appointment (first confirmed one in the future)
                const now = new Date()
                const nextIdx = sorted.findIndex(
                  (a) => new Date(a.scheduled_start) > now && a.status === "confirmed"
                )
                return sorted.map((apt, i) => (
                  <AppointmentRow key={apt.id} apt={apt} isNext={i === nextIdx} />
                ))
              })()}
            </div>
          )}
        </div>

        {/* Right: Weekly mini chart (2 cols) */}
        <div className="lg:col-span-2">
          <WeeklyMiniChart
            data={(weekly.data ?? []).map((d) => ({ date: d.date, calls: d.calls }))}
          />
        </div>
      </div>

      {/* Exceptions — only show if there are any */}
      {exceptions.length > 0 && (
        <section>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-amber-600/60 mb-2">
            <AlertTriangle className="size-3 inline-block mr-1.5 -mt-px" />
            Needs review ({exceptions.length})
          </p>
          <div>
            {exceptions.map((call) => (
              <ExceptionRow key={call.id} call={call} />
            ))}
          </div>
        </section>
      )}

      {/* Recent activity feed */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
            <Phone className="size-3 inline-block mr-1.5 -mt-px" />
            Recent calls
          </p>
          {recentCalls.length > 0 && (
            <Link
              to="/calls"
              className="text-[11px] text-muted-foreground/55 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
        {recentCalls.length === 0 ? (
          <p className="text-[13px] text-muted-foreground/55 py-4">
            No recent calls.
          </p>
        ) : (
          <div>
            {recentCalls.map((call) => (
              <ActivityRow key={call.id} call={call} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
