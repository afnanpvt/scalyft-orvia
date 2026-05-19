import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Phone,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
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

function outcomeColor(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked": return "#34C759"
    case "lead_captured": return "#007AFF"
    case "transferred": return "#FF9500"
    case "missed": return "#FF3B30"
    default: return "#AEAEB2"
  }
}

function outcomeTextColor(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked": return "#34C759"
    case "lead_captured": return "#007AFF"
    case "transferred": return "#FF9500"
    case "missed": return "#FF3B30"
    default: return "#8E8E93"
  }
}

function outcomeLabel(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked": return "booked"
    case "lead_captured": return "lead"
    case "info_given": return "info"
    case "transferred": return "transferred"
    case "missed": return "missed"
    default: return outcome ?? "unknown"
  }
}

// --- Skeletons ----------------------------------------------

function StatSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "18px 20px" }}>
      <div style={{ height: 11, width: 60, background: "rgba(60,60,67,0.08)", borderRadius: 4, marginBottom: 12 }} />
      <div style={{ height: 36, width: 48, background: "rgba(60,60,67,0.1)", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 11, width: 80, background: "rgba(60,60,67,0.06)", borderRadius: 4 }} />
    </div>
  )
}

function RowSkeletonSmall() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
      <div style={{ height: 11, width: 40, background: "rgba(60,60,67,0.07)", borderRadius: 4, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 12, width: "60%", background: "rgba(60,60,67,0.08)", borderRadius: 4, marginBottom: 4 }} />
        <div style={{ height: 10, width: "40%", background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
      </div>
    </div>
  )
}

// --- Stat Card ----------------------------------------------

function StatCard({
  value,
  label,
  sublabel,
  accentLeft,
}: {
  value: number | string
  label: string
  sublabel?: string
  accentLeft?: string
}) {
  return (
    <div
      className="ios-card animate-fade-up"
      style={{
        padding: "18px 20px",
        borderLeft: accentLeft ? `3px solid ${accentLeft}` : undefined,
      }}
    >
      <p style={{
        fontSize: 11,
        fontWeight: 500,
        color: "#8E8E93",
        letterSpacing: "1.2px",
        textTransform: "uppercase",
        fontFamily: "var(--font-mono)",
        marginBottom: 10,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 36,
        fontWeight: 700,
        color: "#1C1C1E",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        marginBottom: 6,
        fontFamily: "var(--font-mono)",
      }}>
        {value}
      </p>
      {sublabel && (
        <p style={{ fontSize: 13, color: "#8E8E93" }}>{sublabel}</p>
      )}
    </div>
  )
}

// --- Section Card -------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  count,
  action,
  children,
  style: extraStyle,
}: {
  title: string
  icon?: React.ElementType
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="ios-card animate-fade-up" style={{ padding: 0, overflow: "hidden", ...extraStyle }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "0.5px solid rgba(60,60,67,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {Icon && <Icon style={{ width: 13, height: 13, color: "#8E8E93" }} />}
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#8E8E93",
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            fontFamily: "var(--font-mono)",
          }}>
            {title}
          </span>
          {count != null && (
            <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>{count}</span>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: "12px 18px" }}>{children}</div>
    </div>
  )
}

// --- Appointment Row ----------------------------------------

function AppointmentRow({ apt, isNext }: { apt: Appointment; isNext?: boolean }) {
  const isPast = new Date(apt.scheduled_start) < new Date()

  const statusColor = apt.status === "confirmed" ? "#34C759"
    : apt.status === "no_show" ? "#FF3B30"
    : "#8E8E93"

  return (
    <div
      className="ios-separator"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        opacity: isPast ? 0.45 : 1,
        background: isNext ? "rgba(52,199,89,0.04)" : "transparent",
      }}
    >
      <div style={{ width: 52, flexShrink: 0, textAlign: "right" }}>
        <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)", color: "#1C1C1E" }}>
          {formatTime(apt.scheduled_start)}
        </span>
        {isNext && (
          <span style={{ display: "block", fontSize: 9, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "#34C759", marginTop: 1, fontFamily: "var(--font-mono)" }}>
            Next
          </span>
        )}
      </div>

      <div style={{ width: 4, height: 4, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {apt.patient_name}
        </p>
        {apt.service_type && (
          <p style={{ fontSize: 11, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
            {apt.service_type}
          </p>
        )}
      </div>

      <span style={{
        fontSize: 10,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 6,
        color: statusColor,
        background: apt.status === "confirmed" ? "rgba(52,199,89,0.1)"
          : apt.status === "no_show" ? "rgba(255,59,48,0.1)"
          : "rgba(142,142,147,0.1)",
        fontFamily: "var(--font-mono)",
        textTransform: "capitalize",
        flexShrink: 0,
      }}>
        {apt.status === "no_show" ? "no show" : apt.status}
      </span>
    </div>
  )
}

// --- Activity Row -------------------------------------------

function ActivityRow({ call, delay }: { call: Call; delay?: number }) {
  const summary = buildCallSummary(call)
  const parts = summary.split("→")
  const hasArrow = parts.length > 1
  const color = outcomeColor(call.outcome)

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="ios-separator animate-fade-up"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0,
        padding: "12px 0",
        textDecoration: "none",
        cursor: "pointer",
        position: "relative",
        animationDelay: `${delay ?? 0}ms`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "#F2F2F7";
        (e.currentTarget as HTMLElement).style.marginLeft = "-18px";
        (e.currentTarget as HTMLElement).style.marginRight = "-18px";
        (e.currentTarget as HTMLElement).style.paddingLeft = "18px";
        (e.currentTarget as HTMLElement).style.paddingRight = "18px";
        (e.currentTarget as HTMLElement).style.borderRadius = "8px";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.marginLeft = "0";
        (e.currentTarget as HTMLElement).style.marginRight = "0";
        (e.currentTarget as HTMLElement).style.paddingLeft = "0";
        (e.currentTarget as HTMLElement).style.paddingRight = "0";
        (e.currentTarget as HTMLElement).style.borderRadius = "0";
      }}
    >
      {/* Left color strip */}
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: color, flexShrink: 0, marginRight: 12 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
          {hasArrow ? (
            <>
              <span style={{ color: "#3A3A3C" }}>{parts[0].trim()}</span>
              <span style={{ color: "#AEAEB2", margin: "0 4px" }}>→</span>
              <span style={{ fontWeight: 500, color: outcomeTextColor(call.outcome) }}>{parts.slice(1).join("→").trim()}</span>
            </>
          ) : (
            <span style={{ color: "#636366" }}>{summary}</span>
          )}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "1px 7px",
            borderRadius: 6,
            color: outcomeTextColor(call.outcome),
            background: `${color}18`,
            fontFamily: "var(--font-mono)",
          }}>
            {outcomeLabel(call.outcome)}
          </span>
          {call.duration_secs != null && (
            <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>
              {Math.floor(call.duration_secs / 60)}m {call.duration_secs % 60}s
            </span>
          )}
        </div>
      </div>

      <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0, marginLeft: 12, marginTop: 2 }}>
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Weekly Chart -------------------------------------------

function WeeklyChart({ data }: { data: { date: string; calls: number }[] }) {
  if (!data.length) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <p style={{ fontSize: 12, color: "#AEAEB2" }}>No data yet</p>
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "#AEAEB2", fontFamily: "'SF Mono', monospace" }}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "#AEAEB2", fontFamily: "'SF Mono', monospace" }}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(60,60,67,0.05)", radius: 4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div style={{
                background: "#FFFFFF",
                borderRadius: 10,
                padding: "8px 12px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              }}>
                <p style={{ fontSize: 10, color: "#8E8E93", marginBottom: 2, fontFamily: "'SF Mono', monospace" }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1C1C1E", fontFamily: "'SF Mono', monospace" }}>{payload[0].value} calls</p>
              </div>
            )
          }}
        />
        <Bar dataKey="calls" fill="#007AFF" radius={[4, 4, 0, 0]} barSize={18} opacity={0.75} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Exception Row ------------------------------------------

function ExceptionRow({ call }: { call: Call }) {
  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="ios-separator"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <AlertTriangle style={{ width: 13, height: 13, color: "#FF9500", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 500, color: "#1C1C1E" }}>{call.caller_phone ?? "Unknown"}</span>
          <span style={{ color: "#AEAEB2", margin: "0 6px" }}>—</span>
          <span style={{ color: "#636366" }}>
            {call.status === "transferred" ? "Transferred to owner" : "Call failed"}
          </span>
        </p>
      </div>
      <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// --- Greeting -----------------------------------------------

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null
  const greetings = firstName
    ? [`Good to see you, ${firstName}`, `Hey ${firstName}`, `Welcome back, ${firstName}`, `Hi ${firstName}`]
    : ["Welcome back", "Good to see you", "Hey there"]
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  return greetings[dayOfYear % greetings.length]
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

  if (briefing.isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <div style={{ height: 28, width: 240, background: "rgba(60,60,67,0.08)", borderRadius: 6, marginBottom: 8 }} />
          <div style={{ height: 14, width: 180, background: "rgba(60,60,67,0.05)", borderRadius: 4 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
          <div className="ios-card" style={{ height: 240 }} />
          <div className="ios-card" style={{ height: 240 }} />
        </div>
      </div>
    )
  }

  if (briefing.isError) return (
    <div style={{ padding: "96px 0", textAlign: "center" }}>
      <p style={{ fontSize: 14, color: "#FF3B30" }}>Something went wrong loading your dashboard.</p>
      <button
        onClick={() => briefing.refetch()}
        style={{ fontSize: 13, color: "#8E8E93", marginTop: 8, border: "none", background: "transparent", cursor: "pointer" }}
      >
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
    statusLine = "Orvia is ready. No calls yet today."
  } else {
    const parts = [`${calls} call${calls !== 1 ? "s" : ""} handled`]
    if (appointments > 0) parts.push(`${appointments} booked`)
    if (leads > 0) parts.push(`${leads} lead${leads !== 1 ? "s" : ""}`)
    statusLine = parts.join(" · ")
  }

  const weeklyData = (weekly.data ?? []).map((d) => ({ date: d.date, calls: d.calls }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Header */}
      <div className="animate-fade-up animate-fade-up-1">
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.5px", color: "#1C1C1E", marginBottom: 4 }}>
          {greeting}
        </h1>
        <p style={{ fontSize: 13, color: "#8E8E93" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          <span style={{ margin: "0 6px", color: "#AEAEB2" }}>·</span>
          {statusLine}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="animate-fade-up animate-fade-up-2">
          <StatCard value={calls} label="Calls handled" sublabel="Today" accentLeft="#34C759" />
        </div>
        <div className="animate-fade-up animate-fade-up-3">
          <StatCard value={appointments} label="Appointments" sublabel="Booked today" accentLeft="#007AFF" />
        </div>
        <div className="animate-fade-up animate-fade-up-4">
          <StatCard value={leads} label="Leads captured" sublabel="Awaiting follow-up" accentLeft="#FF9500" />
        </div>
      </div>

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <div
          className="ios-card animate-fade-up"
          style={{
            padding: "14px 18px",
            borderLeft: "3px solid #FF9500",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <AlertTriangle style={{ width: 12, height: 12, color: "#FF9500" }} />
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#FF9500",
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}>
              Needs review ({exceptions.length})
            </span>
          </div>
          {exceptions.map((call) => (
            <ExceptionRow key={call.id} call={call} />
          ))}
        </div>
      )}

      {/* Two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
        {/* Appointments */}
        <SectionCard
          title="Today's schedule"
          icon={Calendar}
          count={todaysAppointments.length > 0 ? todaysAppointments.length : undefined}
        >
          {todaysAppointments.length === 0 ? (
            <div style={{ padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Circle style={{ width: 24, height: 24, color: "#AEAEB2" }} strokeWidth={1.5} />
              <p style={{ fontSize: 13, color: "#AEAEB2" }}>No appointments today</p>
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

        {/* Weekly chart */}
        <SectionCard title="This week" icon={TrendingUp} style={{ height: "100%" }}>
          <div style={{ height: 156 }}>
            <WeeklyChart data={weeklyData} />
          </div>
        </SectionCard>
      </div>

      {/* Recent calls */}
      <SectionCard
        title="Recent calls"
        icon={Phone}
        action={
          recentCalls.length > 0 ? (
            <Link
              to="/calls"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: "#007AFF",
                textDecoration: "none",
              }}
            >
              View all
              <ArrowRight style={{ width: 11, height: 11 }} />
            </Link>
          ) : undefined
        }
      >
        {recentCalls.length === 0 ? (
          <div style={{ padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Phone style={{ width: 24, height: 24, color: "#AEAEB2" }} strokeWidth={1.5} />
            <p style={{ fontSize: 13, color: "#AEAEB2" }}>No calls yet</p>
          </div>
        ) : (
          <div>
            {recentCalls.map((call, i) => (
              <ActivityRow key={call.id} call={call} delay={i * 50} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Status line */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <span
          className="animate-live-pulse"
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759", flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: "#8E8E93", fontFamily: "var(--font-mono)" }}>
          Orvia is active and answering calls
        </span>
      </div>
    </div>
  )
}
