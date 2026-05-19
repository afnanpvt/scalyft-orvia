import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Phone,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  X,
} from "lucide-react"

import {
  getBriefing,
  getMissedCallHeatmap,
  getLiveCallStatus,
  markLeadContacted,
  getFollowUpQueue,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Call, Appointment, Lead } from "@/lib/types"

// ─── Helpers ─────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffHr < 48) {
    return `yesterday ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  }
  return `${Math.floor(diffHr / 24)}d ago`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatDuration(secs: number | null): string {
  if (secs == null) return ""
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatElapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM"
  if (h < 12) return `${h} AM`
  if (h === 12) return "12 PM"
  return `${h - 12} PM`
}

function buildCallSummary(call: Call): string {
  if (call.summary) return call.summary
  const extracted = call.extracted_data ?? {}
  const name = (extracted.patient_name as string) ?? call.caller_phone ?? "Unknown"
  const service = (extracted.service_needed as string) ?? null
  const outcomeMap: Record<string, string> = {
    appointment_booked: "Appointment booked",
    lead_captured: "Lead captured",
    info_given: "Info provided",
    transferred: "Transferred",
    missed: "Missed",
  }
  const outcome = call.outcome ? outcomeMap[call.outcome] ?? call.outcome.replace(/_/g, " ") : ""
  if (service) return `${name} — ${service} · ${outcome}`
  return `${name} · ${outcome}`
}

// ─── Outcome badge styles ─────────────────────────────────

const OUTCOME_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  appointment_booked: { bg: "#F0FFF4", text: "#34C759", label: "Booked" },
  lead_captured:      { bg: "#EFF6FF", text: "#007AFF", label: "Lead" },
  info_given:         { bg: "#F2F2F7", text: "#636366", label: "Info" },
  transferred:        { bg: "#FFF7ED", text: "#FF9500", label: "Transfer" },
  missed:             { bg: "#FFF5F5", text: "#FF3B30", label: "Missed" },
}

function OutcomeBadge({ outcome }: { outcome: Call["outcome"] }) {
  const style = outcome ? OUTCOME_BADGE[outcome] : null
  if (!style) return null
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 500,
      padding: "2px 7px",
      borderRadius: 5,
      background: style.bg,
      color: style.text,
      fontFamily: "var(--font-mono)",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {style.label}
    </span>
  )
}

// ─── Greeting ─────────────────────────────────────────────

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null
  const hour = new Date().getHours()
  if (firstName) {
    if (hour < 12) return `Good morning, ${firstName}`
    if (hour < 17) return `Good afternoon, ${firstName}`
    return `Good evening, ${firstName}`
  }
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

// ─── Skeletons ────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "18px 20px" }}>
      <div style={{ height: 11, width: 60, background: "rgba(60,60,67,0.08)", borderRadius: 4, marginBottom: 12 }} />
      <div style={{ height: 36, width: 48, background: "rgba(60,60,67,0.1)", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 11, width: 80, background: "rgba(60,60,67,0.06)", borderRadius: 4 }} />
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────

function StatCard({ value, label, sublabel, accentLeft }: {
  value: number | string
  label: string
  sublabel?: string
  accentLeft?: string
}) {
  return (
    <div className="ios-card animate-fade-up" style={{ padding: "18px 20px", borderLeft: accentLeft ? `3px solid ${accentLeft}` : undefined }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "#8E8E93", letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginBottom: 10 }}>
        {label}
      </p>
      <p style={{ fontSize: 36, fontWeight: 700, color: "#1C1C1E", fontVariantNumeric: "tabular-nums", lineHeight: 1, marginBottom: 6, fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
      {sublabel && <p style={{ fontSize: 13, color: "#8E8E93" }}>{sublabel}</p>}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────

function SectionCard({ title, icon: Icon, count, action, children, style: extraStyle, accentLeft }: {
  title: string
  icon?: React.ElementType
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
  accentLeft?: string
}) {
  return (
    <div className="ios-card animate-fade-up" style={{ padding: 0, overflow: "hidden", borderLeft: accentLeft ? `3px solid ${accentLeft}` : undefined, ...extraStyle }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {Icon && <Icon style={{ width: 13, height: 13, color: accentLeft ?? "#8E8E93" }} />}
          <span style={{ fontSize: 11, fontWeight: 500, color: accentLeft ?? "#8E8E93", letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
            {title}
          </span>
          {count != null && (
            <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>{count}</span>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: 0 }}>{children}</div>
    </div>
  )
}

// ─── Follow-up Queue ─────────────────────────────────────

function FollowUpQueue() {
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["followup-queue"],
    queryFn: getFollowUpQueue,
    refetchInterval: 60_000,
  })

  if (isLoading) return null

  if (queue.length === 0) {
    return (
      <div className="ios-card animate-fade-up" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#8E8E93" }}>No follow-ups needed. Orvia closed every lead today.</span>
      </div>
    )
  }

  return (
    <SectionCard
      title="Follow-up Queue"
      icon={Phone}
      count={queue.length}
      accentLeft="#FF9500"
    >
      {queue.map((lead: Lead) => (
        <div
          key={lead.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 18px",
            borderBottom: "0.5px solid rgba(60,60,67,0.08)",
          }}
          className="last:border-b-0"
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.name ?? "Unknown caller"}
            </p>
            <p style={{ fontSize: 12, color: "#8E8E93", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.service_needed ?? lead.notes ?? "No details"}
            </p>
          </div>
          <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {timeAgo(lead.created_at)}
          </span>
          <a
            href={`tel:${lead.phone}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              color: "#007AFF",
              textDecoration: "none",
              padding: "5px 12px",
              borderRadius: 8,
              background: "rgba(0,122,255,0.08)",
              flexShrink: 0,
            }}
          >
            <Phone style={{ width: 11, height: 11 }} />
            Call back
          </a>
          <FollowUpDoneButton leadId={lead.id} />
        </div>
      ))}
    </SectionCard>
  )
}

function FollowUpDoneButton({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient()
  const dismiss = useMutation({
    mutationFn: markLeadContacted,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-queue"] })
    },
  })

  return (
    <button
      onClick={() => dismiss.mutate(leadId)}
      disabled={dismiss.isPending}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 8,
        border: "none",
        background: "rgba(60,60,67,0.06)",
        color: "#8E8E93",
        cursor: dismiss.isPending ? "not-allowed" : "pointer",
        flexShrink: 0,
        opacity: dismiss.isPending ? 0.4 : 1,
      }}
      title="Mark done"
    >
      <X style={{ width: 13, height: 13 }} />
    </button>
  )
}

// ─── Feature 2: Today's Schedule Timeline ─────────────────

function ScheduleTimeline({ appointments }: { appointments: Appointment[] }) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  )
  const now = new Date()
  const nextIdx = sorted.findIndex(
    (a) => new Date(a.scheduled_start) > now && a.status === "confirmed"
  )

  return (
    <>
      {sorted.map((apt, i) => {
        const isPast = new Date(apt.scheduled_start) < now
        const isNext = i === nextIdx

        const pillColor = isPast ? "#34C759"
          : isNext ? "#007AFF"
          : "#8E8E93"
        const pillBg = isPast ? "rgba(52,199,89,0.1)"
          : isNext ? "rgba(0,122,255,0.1)"
          : "rgba(142,142,147,0.08)"
        const pillLabel = isPast ? "Done" : isNext ? "Next" : "Upcoming"

        return (
          <div
            key={apt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderBottom: "0.5px solid rgba(60,60,67,0.08)",
              borderLeft: isNext ? "3px solid #007AFF" : "3px solid transparent",
              opacity: isPast ? 0.5 : 1,
            }}
            className="last:border-b-0"
          >
            <span style={{ width: 60, flexShrink: 0, fontSize: 11, fontFamily: "var(--font-mono)", color: "#8E8E93", textAlign: "right" }}>
              {formatTime(apt.scheduled_start)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {apt.patient_name}
              </p>
              {apt.service_type && (
                <p style={{ fontSize: 12, color: "#8E8E93", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {apt.service_type}
                </p>
              )}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 5,
              color: pillColor,
              background: pillBg,
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}>
              {pillLabel}
            </span>
          </div>
        )
      })}
    </>
  )
}

// ─── Feature 4: Missed Call Heatmap ──────────────────────

function MissedCallHeatmap({ rows }: { rows: { hour: number; count: number }[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  const maxCount = Math.max(...rows.map((r) => r.count))

  return (
    <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row, i) => {
        const pct = row.count / maxCount
        const barColor = i < 2
          ? "rgba(255,59,48,0.5)"
          : i < 4
          ? "rgba(255,149,0,0.4)"
          : "rgba(142,142,147,0.3)"
        return (
          <div key={row.hour} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 44, fontSize: 11, color: "#8E8E93", fontFamily: "var(--font-mono)", flexShrink: 0, textAlign: "right" }}>
              {formatHour(row.hour)}
            </span>
            <div style={{ flex: 1, background: "rgba(60,60,67,0.06)", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                borderRadius: 4,
                background: barColor,
                width: mounted ? `${pct * 100}%` : "0%",
                transition: `width 600ms ease-out ${i * 60}ms`,
              }} />
            </div>
            <span style={{ width: 44, fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", textAlign: "right", flexShrink: 0 }}>
              {row.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Feature 5: Activity Row (with badges + repeat flag) ──

function ActivityRow({ call, delay }: { call: Call & { is_repeat_caller?: boolean }; delay?: number }) {
  const summary = buildCallSummary(call)
  const [hovered, setHovered] = useState(false)
  const dotColor = OUTCOME_BADGE[call.outcome ?? ""]?.text ?? "#AEAEB2"

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 18px",
        textDecoration: "none",
        cursor: "pointer",
        background: hovered ? "#F2F2F7" : "transparent",
        transition: "background 0.15s",
        borderBottom: "0.5px solid rgba(60,60,67,0.08)",
        animationDelay: `${delay ?? 0}ms`,
      }}
      className="animate-fade-up last:border-b-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <p style={{ fontSize: 14, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {summary}
          </p>
          {call.is_repeat_caller && (
            <span style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              background: "#F2F2F7",
              color: "#636366",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}>
              Returning
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <OutcomeBadge outcome={call.outcome} />
          {call.duration_secs != null && (
            <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)" }}>
              {formatDuration(call.duration_secs)}
            </span>
          )}
        </div>
      </div>

      <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}>
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// ─── Feature 6: Live Status Bar ───────────────────────────

function LiveStatusBar({ clinicActive }: { clinicActive: boolean }) {
  const { data: liveCall } = useQuery({
    queryKey: ["live-call"],
    queryFn: getLiveCallStatus,
    refetchInterval: 10_000,
  })

  const [elapsed, setElapsed] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (liveCall?.created_at) {
      setElapsed(formatElapsed(liveCall.created_at))
      intervalRef.current = setInterval(() => {
        setElapsed(formatElapsed(liveCall.created_at!))
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setElapsed("")
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [liveCall?.id, liveCall?.created_at])

  if (!clinicActive) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF3B30", flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "#FF3B30", fontFamily: "var(--font-mono)" }}>
          Orvia is not configured — check settings
        </span>
      </div>
    )
  }

  if (liveCall) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#007AFF", flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "#007AFF", fontFamily: "var(--font-mono)" }}>
          Call in progress — AI is handling it
          {elapsed && <span style={{ color: "#AEAEB2", marginLeft: 8 }}>{elapsed}</span>}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759", flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "#34C759", fontFamily: "var(--font-mono)" }}>
        Orvia is live — ready for calls
      </span>
    </div>
  )
}

// ─── Exception Row ────────────────────────────────────────

function ExceptionRow({ call }: { call: Call }) {
  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        textDecoration: "none",
        cursor: "pointer",
        borderBottom: "0.5px solid rgba(60,60,67,0.08)",
      }}
      className="last:border-b-0"
    >
      <AlertTriangle style={{ width: 13, height: 13, color: "#FF9500", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 500, color: "#1C1C1E" }}>{call.caller_phone ?? "Unknown"}</span>
          <span style={{ color: "#AEAEB2", margin: "0 6px" }}>—</span>
          <span style={{ color: "#636366" }}>{call.status === "transferred" ? "Transferred to owner" : "Call failed"}</span>
        </p>
      </div>
      <span style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function OverviewPage() {
  const { profile } = useAuth()

  const briefing = useQuery({
    queryKey: ["briefing"],
    queryFn: getBriefing,
    refetchInterval: 30_000,
  })

  const heatmapQuery = useQuery({
    queryKey: ["missed-heatmap"],
    queryFn: getMissedCallHeatmap,
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
        <div className="ios-card" style={{ height: 120 }} />
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
      <button onClick={() => briefing.refetch()} style={{ fontSize: 13, color: "#8E8E93", marginTop: 8, border: "none", background: "transparent", cursor: "pointer" }}>
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
  const statusLine = calls === 0
    ? "Orvia is ready. No calls yet today."
    : [
        `${calls} call${calls !== 1 ? "s" : ""} handled`,
        appointments > 0 && `${appointments} booked`,
        leads > 0 && `${leads} lead${leads !== 1 ? "s" : ""}`,
      ].filter(Boolean).join(" · ")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

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

      {/* Follow-up queue */}
      <FollowUpQueue />

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <div className="ios-card animate-fade-up" style={{ padding: 0, overflow: "hidden", borderLeft: "3px solid #FF9500" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 18px", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
            <AlertTriangle style={{ width: 13, height: 13, color: "#FF9500" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "#FF9500", letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              Needs review ({exceptions.length})
            </span>
          </div>
          {exceptions.map((call) => <ExceptionRow key={call.id} call={call} />)}
        </div>
      )}

      {/* Two-column: schedule + heatmap — only rendered when there is data */}
      {(todaysAppointments.length > 0 || (heatmapQuery.data ?? []).length > 0) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: todaysAppointments.length > 0 && (heatmapQuery.data ?? []).length > 0
            ? "3fr 2fr"
            : "1fr",
          gap: 12,
        }}>
          {todaysAppointments.length > 0 && (
            <SectionCard
              title="Today's schedule"
              icon={Calendar}
              count={todaysAppointments.length}
            >
              <ScheduleTimeline appointments={todaysAppointments} />
            </SectionCard>
          )}

          {(heatmapQuery.data ?? []).length > 0 && (
            <SectionCard title="When you miss calls" icon={TrendingUp} style={{ height: "100%" }}>
              <div style={{ padding: "4px 0" }}>
                <p style={{ fontSize: 11, color: "#AEAEB2", fontFamily: "var(--font-mono)", padding: "0 18px 10px" }}>Last 30 days</p>
                <MissedCallHeatmap rows={heatmapQuery.data!} />
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Feature 3 + 5: Recent calls with outcome badges + repeat flag */}
      <SectionCard
        title="Recent calls"
        icon={Phone}
        action={
          recentCalls.length > 0 ? (
            <Link to="/calls" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: "#007AFF", textDecoration: "none" }}>
              View all <ArrowRight style={{ width: 11, height: 11 }} />
            </Link>
          ) : undefined
        }
      >
        {recentCalls.length === 0 ? (
          <div style={{ padding: "28px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Phone style={{ width: 24, height: 24, color: "#AEAEB2" }} strokeWidth={1.5} />
            <p style={{ fontSize: 13, color: "#AEAEB2" }}>No calls yet</p>
          </div>
        ) : (
          recentCalls.map((call, i) => <ActivityRow key={call.id} call={call} delay={i * 50} />)
        )}
      </SectionCard>

      {/* Feature 6: Live status */}
      <LiveStatusBar clinicActive={true} />
    </div>
  )
}
