import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Phone,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Circle,
} from "lucide-react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
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
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
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
    transferred: "Transferred to owner",
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

function outcomeBg(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked": return "text-emerald-700"
    case "lead_captured": return "text-blue-600"
    case "transferred": return "text-amber-700"
    case "missed": return "text-red-600"
    default: return "text-muted-foreground/60"
  }
}

// --- Skeletons ----------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/40 animate-pulse rounded-lg ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-52" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Skeleton className="lg:col-span-3 h-64 rounded-xl" />
        <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
      </div>
    </div>
  )
}

// --- Metric Card --------------------------------------------

function MetricCard({
  value,
  label,
  sublabel,
  accent,
  icon: Icon,
}: {
  value: number | string
  label: string
  sublabel?: string
  accent?: boolean
  icon?: React.ElementType
}) {
  return (
    <div
      className={`rounded-xl px-5 py-5 border ${
        accent
          ? "bg-foreground text-background border-foreground"
          : "bg-card border-border/60"
      }`}
    >
      {Icon && (
        <div className={`mb-3 ${accent ? "text-background/60" : "text-muted-foreground/40"}`}>
          <Icon className="size-4" />
        </div>
      )}
      <p
        className={`text-4xl font-light tracking-[-0.05em] tabular-nums leading-none ${
          accent ? "text-background" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.1em] mt-2 ${
          accent ? "text-background/60" : "text-muted-foreground/50"
        }`}
      >
        {label}
      </p>
      {sublabel && (
        <p className={`text-[11px] mt-1 ${accent ? "text-background/40" : "text-muted-foreground/35"}`}>
          {sublabel}
        </p>
      )}
    </div>
  )
}

// --- Appointment Row ----------------------------------------

function AppointmentRow({ apt, isNext }: { apt: Appointment; isNext?: boolean }) {
  const isPast = new Date(apt.scheduled_start) < new Date()

  return (
    <div
      className={`flex items-center gap-4 py-3 border-b border-border/40 last:border-0 ${
        isNext ? "bg-emerald-500/5 -mx-4 px-4 rounded-lg" : ""
      } ${isPast ? "opacity-40" : ""}`}
    >
      <div className="w-14 shrink-0 text-right">
        <span className="text-[13px] font-medium tabular-nums">{formatTime(apt.scheduled_start)}</span>
        {isNext && (
          <span className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-600 mt-0.5">
            Next
          </span>
        )}
      </div>

      <div className={`size-1.5 rounded-full shrink-0 ${
        apt.status === "confirmed" ? "bg-emerald-500" :
        apt.status === "completed" ? "bg-muted-foreground/30" :
        apt.status === "no_show" ? "bg-red-500" : "bg-amber-500"
      }`} />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate leading-tight">{apt.patient_name}</p>
        {apt.service_type && (
          <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5">{apt.service_type}</p>
        )}
      </div>

      {apt.patient_phone && (
        <a
          href={`tel:${apt.patient_phone}`}
          className="text-[11px] tabular-nums text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {apt.patient_phone}
        </a>
      )}

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

// --- Activity Row -------------------------------------------

function ActivityRow({ call }: { call: Call }) {
  const summary = buildCallSummary(call)
  const parts = summary.split("→")
  const hasArrow = parts.length > 1

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="flex items-start gap-3 py-2.5 hover:bg-accent/20 -mx-4 px-4 rounded-lg transition-colors cursor-pointer group"
    >
      <span className={`size-2 rounded-full shrink-0 mt-1.5 ${outcomeDot(call.outcome)}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          {hasArrow ? (
            <>
              <span className="text-foreground/80">{parts[0].trim()}</span>
              <span className="text-muted-foreground/40 mx-1">→</span>
              <span className={`font-medium ${outcomeBg(call.outcome)}`}>{parts.slice(1).join("→").trim()}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60">{summary}</span>
          )}
        </p>
      </div>
      <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 mt-0.5">
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Weekly Chart -------------------------------------------

function WeeklyChart({ data }: { data: { date: string; calls: number }[] }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[12px] text-muted-foreground/30">No data yet</p>
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.4 }}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.4 }}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.2, radius: 4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg shadow-black/8">
                <p className="text-[10px] text-muted-foreground/50 mb-0.5">{label}</p>
                <p className="text-[13px] font-semibold tabular-nums">{payload[0].value} calls</p>
              </div>
            )
          }}
        />
        <Bar dataKey="calls" fill="var(--foreground)" radius={[4, 4, 0, 0]} barSize={20} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Section Card -------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  count,
  action,
  children,
  className = "",
}: {
  title: string
  icon?: React.ElementType
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-card border border-border/60 rounded-xl overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-3.5 text-muted-foreground/50" />}
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
            {title}
          </h3>
          {count != null && (
            <span className="text-[11px] tabular-nums text-muted-foreground/40">{count}</span>
          )}
        </div>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

// --- Greeting -----------------------------------------------

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null
  const greetings = firstName
    ? [
        `Good to see you, ${firstName}`,
        `Hey ${firstName}`,
        `Welcome back, ${firstName}`,
        `Hi ${firstName}`,
      ]
    : ["Welcome back", "Good to see you", "Hey there"]

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return greetings[dayOfYear % greetings.length]
}

// --- Exception Row ------------------------------------------

function ExceptionRow({ call }: { call: Call }) {
  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="flex items-center gap-3 py-2.5 hover:bg-accent/20 -mx-4 px-4 rounded-lg transition-colors cursor-pointer"
    >
      <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] truncate">
          <span className="font-medium">{call.caller_phone ?? "Unknown"}</span>
          <span className="text-muted-foreground/40 mx-1">—</span>
          <span className="text-muted-foreground/60">
            {call.status === "transferred" ? "Transferred to owner" : "Call failed"}
          </span>
        </p>
      </div>
      <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Page ---------------------------------------------------

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

  const greeting = getGreeting(profile.fullName)
  let statusLine: string
  if (calls === 0) {
    statusLine = "Orvia is ready and listening. No calls yet today."
  } else {
    const parts = [`${calls} call${calls !== 1 ? "s" : ""} handled today`]
    if (appointments > 0) parts.push(`${appointments} appointment${appointments !== 1 ? "s" : ""} booked`)
    if (leads > 0) parts.push(`${leads} lead${leads !== 1 ? "s" : ""} captured`)
    statusLine = parts.join(" · ")
  }

  const weeklyData = (weekly.data ?? []).map((d) => ({ date: d.date, calls: d.calls }))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
          {greeting}
        </h1>
        <p className="text-[13px] text-muted-foreground/60 mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {" · "}
          {statusLine}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          value={calls}
          label="Calls handled"
          sublabel="Today"
          accent
          icon={Phone}
        />
        <MetricCard
          value={appointments}
          label="Appointments"
          sublabel="Booked today"
          icon={Calendar}
        />
        <MetricCard
          value={leads}
          label="Leads captured"
          sublabel="Awaiting follow-up"
          icon={TrendingUp}
        />
      </div>

      {/* Exceptions banner — only when needed */}
      {exceptions.length > 0 && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-3.5 text-amber-600" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-700">
              Needs review ({exceptions.length})
            </span>
          </div>
          <div>
            {exceptions.map((call) => (
              <ExceptionRow key={call.id} call={call} />
            ))}
          </div>
        </div>
      )}

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Appointments */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Today's appointments"
            icon={Calendar}
            count={todaysAppointments.length > 0 ? todaysAppointments.length : undefined}
          >
            {todaysAppointments.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2">
                <Circle className="size-6 text-muted-foreground/15" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground/40">No appointments scheduled today</p>
              </div>
            ) : (
              (() => {
                const sorted = [...todaysAppointments].sort(
                  (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
                )
                const now = new Date()
                const nextIdx = sorted.findIndex(
                  (a) => new Date(a.scheduled_start) > now && a.status === "confirmed"
                )
                return sorted.map((apt, i) => (
                  <AppointmentRow key={apt.id} apt={apt} isNext={i === nextIdx} />
                ))
              })()
            )}
          </SectionCard>
        </div>

        {/* Weekly chart */}
        <div className="lg:col-span-2">
          <SectionCard title="This week" icon={TrendingUp} className="h-full">
            <div className="h-[160px]">
              <WeeklyChart data={weeklyData} />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Recent calls */}
      <SectionCard
        title="Recent calls"
        icon={Phone}
        action={
          recentCalls.length > 0 ? (
            <Link
              to="/calls"
              className="text-[11px] font-medium text-muted-foreground/50 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          ) : undefined
        }
      >
        {recentCalls.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2">
            <Phone className="size-6 text-muted-foreground/15" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground/40">No calls yet</p>
          </div>
        ) : (
          <div>
            {recentCalls.map((call) => (
              <ActivityRow key={call.id} call={call} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Status footer */}
      <div className="flex items-center gap-2 pb-2">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        <span className="text-[11px] text-muted-foreground/40">
          Orvia is active and answering calls
        </span>
      </div>
    </div>
  )
}
