import { useState, useEffect, useRef } from "react"
import { callerPhoneLabel, isWebTestCall } from "@/lib/caller-label"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  Phone,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bell,
  Clock,
  Info,
} from "lucide-react"

// ─── Premium SVG Icons ────────────────────────────────────

function IconCalendar({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  )
}

function IconPhone({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

import {
  getBriefing,
  getLiveCallStatus,
  getWeeklyCallStats,
  getUnresolvedOperationalEvents,
  getPendingCallQueue,
  getMonthCallStats,
  getBusinessSettings,
  resolveOperationalEvent,
  markQueueItemHandled,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import { supabase } from "@/lib/supabase"
import { TestCallButton } from "@/components/dashboard/test-call-button"
import { HoverTip, agentStatusCopy } from "@/components/dashboard/hover-tip"
import { SHOW_AGENT_SETUP_STATUS } from "@/lib/dev-flags"
import { GuestTour } from "@/components/dashboard/guest-tour"
import { useGuestNiche } from "@/lib/guest/session"
import { pickGreeting, type Greeting } from "@/lib/greetings"
import type { Call, Appointment, OperationalEvent, CallQueueItem } from "@/lib/types"

// ─── Helpers ─────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffHr < 48) return "yesterday"
  return `${Math.floor(diffHr / 24)}d ago`
}

function formatScheduleSlot(iso: string): { day: string | null; time: string } {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (dayOnly.getTime() === today.getTime()) return { day: null, time }
  if (dayOnly.getTime() === tomorrow.getTime()) return { day: "Tomorrow", time }
  return { day: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), time }
}

function formatDuration(secs: number | null): string {
  if (secs == null) return ""
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

function formatElapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}

function buildCallSummary(call: Call): string {
  if (call.summary) return call.summary
  const extracted = call.extracted_data ?? {}
  const name = (extracted.caller_name as string) ?? callerPhoneLabel(call)
  const service = (extracted.service_needed as string) ?? null
  const outcomeMap: Record<string, string> = {
    appointment_booked: "Appointment booked",
    lead_captured: "Lead captured",
    info_given: "Info provided",
    transferred: "Transferred",
    missed: "Missed",
  }
  const outcome = call.outcome ? outcomeMap[call.outcome] ?? call.outcome.replace(/_/g, " ") : ""
  // Test calls: the title already says "Test call", so describe what happened.
  if (isWebTestCall(call)) {
    if ((call.duration_secs ?? 0) < 20) return "Hung up after the greeting"
    return service ? `${service} · ${outcome}` : outcome || "Talked to the assistant"
  }
  if (service) return `${name} · ${service}`
  return `${name} · ${outcome}`
}

const NAME_TITLES = new Set(["dr", "mr", "mrs", "ms", "prof", "rev", "sir", "madam", "mx"])

function firstNameOf(name: string | null): string | null {
  const tokens = name?.trim().split(/\s+/).filter(Boolean) ?? []
  while (tokens.length > 1 && NAME_TITLES.has(tokens[0].replace(/\./g, "").toLowerCase())) {
    tokens.shift()
  }
  return tokens[0] ?? null
}

// Coarse, human countdown: precise only when it's close.
// "In 12m" · "In 1h 30m" · "In 11h" · "Tomorrow" · "In 3 days"
function timeUntil(iso: string): string {
  const target = new Date(iso)
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return ""
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `In ${mins}m`
  const hrs = Math.floor(mins / 60)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000)
  if (dayDiff === 0) {
    const rem = mins % 60
    return hrs < 2 && rem > 0 ? `In ${hrs}h ${rem}m` : `In ${hrs}h`
  }
  if (dayDiff === 1) return "Tomorrow"
  return `In ${dayDiff} days`
}

// ─── Outcome config ───────────────────────────────────────

const OUTCOME_CONFIG: Record<string, {
  bg: string; color: string; label: string;
  iconBg: string; iconColor: string; dot: string; border: string;
}> = {
  appointment_booked: { bg: "#D1FAE5", color: "#065F46", label: "Booked",   iconBg: "#D1FAE5", iconColor: "#10B981", dot: "#10B981", border: "rgba(16,185,129,0.2)" },
  lead_captured:      { bg: "var(--muted)", color: "var(--foreground)", label: "Lead",     iconBg: "var(--muted)", iconColor: "var(--foreground)", dot: "var(--foreground)", border: "var(--border)" },
  info_given:         { bg: "var(--muted)", color: "var(--muted-foreground)", label: "Info",     iconBg: "var(--muted)", iconColor: "var(--muted-foreground)", dot: "var(--muted-foreground)", border: "var(--border)" },
  transferred:        { bg: "#FEF3C7", color: "#92400E", label: "Transfer", iconBg: "#FEF3C7", iconColor: "#D97706", dot: "#F59E0B", border: "rgba(245,158,11,0.2)" },
  missed:             { bg: "#FEE2E2", color: "#991B1B", label: "Missed",   iconBg: "#FEE2E2", iconColor: "#E5484D", dot: "#E5484D", border: "rgba(229,72,77,0.2)" },
}

function OutcomeBadge({ outcome }: { outcome: Call["outcome"] }) {
  const cfg = outcome ? OUTCOME_CONFIG[outcome] : null
  if (!cfg) return null
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 999,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "0.01em",
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Stat Card ────────────────────────────────────────────

// One hero metric (big number + sparkline) and compact secondaries.
// Flat surfaces, no icon tiles — the number is the design.

function MetricValue({ value, size }: { value: number | string; size: number }) {
  return (
    <p className="stat-card-value" style={{
      fontSize: size, fontWeight: 600,
      color: "var(--foreground)",
      lineHeight: 1, fontFamily: "Geist Mono, monospace",
      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em",
    }}>
      {value === "--" ? (
        <span style={{ display: "inline-block", width: size * 0.6, height: 3, background: "currentColor", borderRadius: 2, opacity: 0.18, verticalAlign: "middle" }} />
      ) : value}
    </p>
  )
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500,
  color: "var(--muted-foreground)",
  letterSpacing: "-0.01em",
}

function PrimaryStatCard({ value, label, sublabel, days }: {
  value: number | string
  label: string
  sublabel?: string
  days: WeekDay[]
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const today = days[6]
  const yesterday = days[5]
  const delta = today && yesterday ? today.appointments - yesterday.appointments : null
  const hasData = days.some(d => d.calls > 0)
  const chartData = days.map((d, i) => ({
    ...d,
    other: Math.max(0, d.calls - d.appointments),
    isToday: i === days.length - 1,
  }))
  const muted = isDark ? "rgba(255,255,255,0.12)" : "rgba(10,10,11,0.08)"

  return (
    <div className="ios-card stat-primary" data-tour="hero" style={{
      padding: "20px 22px 16px",
      display: "grid", gridTemplateColumns: "minmax(150px, 0.8fr) 1.6fr", gap: 20,
      height: "100%",
    }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <p style={metricLabelStyle}>{label}</p>
        <div style={{ marginTop: 14 }}>
          <MetricValue value={value} size={56} />
        </div>
        {delta !== null && delta !== 0 && (
          <p style={{
            fontSize: 12, fontWeight: 600, marginTop: 10, letterSpacing: "-0.01em",
            color: delta > 0 ? "#059669" : (isDark ? "#FCA5A5" : "#DC2626"),
          }}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} vs yesterday
          </p>
        )}
        {sublabel && (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, letterSpacing: "-0.01em" }}>
            {sublabel}
          </p>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#10B981" }} /> Booked
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: muted }} /> Other calls
          </span>
        </div>
      </div>

      <div className="stat-primary-chart" style={{ minWidth: 0, minHeight: 170 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="28%" margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" axisLine={false} tickLine={false} interval={0}
                tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", fontFamily: "Geist, sans-serif" }} />
              <Tooltip
                cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)", radius: 6 }}
                content={({ active, payload, label: dayLabel }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as { calls: number; appointments: number }
                  return (
                    <div className="chart-tooltip">
                      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>{dayLabel}</p>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{row.appointments} booked · {row.calls} calls</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="appointments" stackId="d" maxBarSize={34} isAnimationActive={false}>
                {chartData.map((d, i) => <Cell key={i} fill="#10B981" fillOpacity={d.isToday ? 1 : 0.55} />)}
              </Bar>
              <Bar dataKey="other" stackId="d" maxBarSize={34} radius={[5, 5, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => <Cell key={i} fill={d.isToday ? (isDark ? "rgba(255,255,255,0.22)" : "rgba(10,10,11,0.16)") : muted} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Your week will chart here once calls come in</p>
          </div>
        )}
      </div>
    </div>
  )
}

// 7-day trend with its own legend: day initials under each bar, and a
// caption that swaps to the exact value for whichever bar is hovered.
function MiniBars({ series, labels, color, format }: {
  series: number[]
  labels: string[]
  color: string
  format: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...series, 1)
  const caption = hover === null
    ? "Last 7 days"
    : `${hover === series.length - 1 ? "Today" : labels[hover]} · ${format(series[hover])}`

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}
      onMouseLeave={() => setHover(null)}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 28 }}>
        {series.map((v, i) => {
          const isToday = i === series.length - 1
          const active = hover === i
          return (
            <span key={i}
              onMouseEnter={() => setHover(i)}
              title={`${labels[i]}: ${format(v)}`}
              style={{
                width: 9, borderRadius: 2, cursor: "default",
                height: Math.max(3, Math.round((v / max) * 28)),
                background: color,
                opacity: active ? 1 : hover !== null ? 0.3 : v === 0 ? 0.15 : isToday ? 1 : 0.45,
                transition: "opacity 0.12s",
              }} />
          )
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {labels.map((l, i) => (
          <span key={i} style={{
            width: 9, textAlign: "center", fontSize: 8.5, lineHeight: 1,
            color: hover === i ? "var(--foreground)" : "var(--muted-foreground)",
            opacity: hover === i ? 1 : 0.7, fontWeight: hover === i ? 700 : 500,
          }}>
            {l.charAt(0)}
          </span>
        ))}
      </div>
      <span style={{
        fontSize: 10.5, color: hover === null ? "var(--muted-foreground)" : "var(--foreground)",
        fontWeight: hover === null ? 400 : 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      }}>
        {caption}
      </span>
    </div>
  )
}

function CompactStatCard({ value, label, sublabel, series, seriesLabels, formatPoint, color }: {
  value: number | string
  label: string
  sublabel?: string
  series?: number[]
  seriesLabels?: string[]
  formatPoint?: (v: number) => string
  color: string
}) {
  return (
    <div className="ios-card stat-compact" style={{
      padding: "14px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={metricLabelStyle}>{label}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6, minWidth: 0 }}>
          <MetricValue value={value} size={26} />
          {sublabel && (
            <p style={{
              fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
            }}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
      {series && seriesLabels && series.some(v => v > 0) && (
        <MiniBars series={series} labels={seriesLabels} color={color} format={formatPoint ?? (v => String(v))} />
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────

function StatSkeleton({ primary }: { primary?: boolean }) {
  return (
    <div className="ios-card" style={{ padding: primary ? "20px 22px" : "14px 18px", height: "100%" }}>
      <div className="skeleton" style={{ height: 10, width: 80, borderRadius: 6, marginBottom: primary ? 16 : 8 }} />
      <div className="skeleton" style={{ height: primary ? 48 : 20, width: primary ? 72 : 36, borderRadius: 6 }} />
    </div>
  )
}

// ─── Status Strip ─────────────────────────────────────────
// Calm 3-card operational reassurance band. Passive by default.

function StatusStrip({ clinicActive, agentStatus, actionCount, nextAppointment, liveCall, elapsed }: {
  clinicActive: boolean
  agentStatus: { hasPhone: boolean; isActive: boolean; exhausted: boolean }
  actionCount: number
  nextAppointment: Appointment | null
  liveCall: Call | null
  elapsed: string
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const slot = nextAppointment ? formatScheduleSlot(nextAppointment.scheduled_start) : null
  const countdown = nextAppointment ? timeUntil(nextAppointment.scheduled_start) : null

  // Subtle, monochrome shell. Color reserved for the status dot only.
  const stripCard: React.CSSProperties = {
    flex: 1,
    borderRadius: 14,
    background: isDark ? "var(--card)" : "#ffffff",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
    padding: "14px 16px",
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 600,
    color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.42)",
    letterSpacing: "0.06em", textTransform: "uppercase",
  }

  const primaryStyle: React.CSSProperties = {
    fontSize: 15, fontWeight: 600,
    color: isDark ? "#F2F2F7" : "#0A0A0B",
    letterSpacing: "-0.02em", lineHeight: 1.25,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }

  const metaStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.42)",
    letterSpacing: "-0.01em", lineHeight: 1.3,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }

  const aiDotColor = liveCall ? "#10B981" : clinicActive ? "#10B981" : "#E5484D"
  const aiPrimary = liveCall ? `On call · ${elapsed || "…"}` : clinicActive ? "Live" : "Offline"
  const aiMeta = liveCall ? "Active conversation"
    : clinicActive ? "Answering calls"
    : agentStatus.exhausted ? "Out of call minutes"
    : !agentStatus.isActive ? "Account not active"
    : !agentStatus.hasPhone ? "No phone number connected"
    : "Not accepting calls"

  const needsDotColor = actionCount > 0 ? "#F59E0B" : "#10B981"
  const needsPrimary = actionCount > 0
    ? `${actionCount} ${actionCount === 1 ? "item" : "items"} to review`
    : "All clear"
  const needsMeta = actionCount > 0 ? "Missed calls and unfinished bookings" : "No issues right now"

  return (
    <div style={{ display: "flex", gap: 10 }} className="status-strip">
      {/* AI Agent */}
      <div data-tour="agent" style={{ flex: 1, minWidth: 0, display: "flex" }}>
        <HoverTip block {...agentStatusCopy({ onCall: !!liveCall, ...agentStatus })}>
          <div tabIndex={0} style={{ ...stripCard, height: "100%", cursor: "help", outline: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                className={liveCall || clinicActive ? "animate-live-pulse" : undefined}
                style={{ width: 6, height: 6, borderRadius: "50%", background: aiDotColor, flexShrink: 0 }}
              />
              <p style={labelStyle}>AI Agent</p>
              <Info style={{ width: 11, height: 11, color: "var(--muted-foreground)", opacity: 0.6, marginLeft: "auto" }} strokeWidth={1.75} />
            </div>
            <p style={primaryStyle}>{aiPrimary}</p>
            <p style={metaStyle}>{aiMeta}</p>
          </div>
        </HoverTip>
      </div>

      {/* Needs Attention */}
      <Link to="/needs-action" data-tour="needs" style={{
        ...stripCard,
        textDecoration: "none",
        cursor: actionCount > 0 ? "pointer" : "default",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: needsDotColor, flexShrink: 0 }} />
            <p style={labelStyle}>Needs Attention</p>
          </div>
        </div>
        <p style={primaryStyle}>{needsPrimary}</p>
        <p style={metaStyle}>{needsMeta}</p>
      </Link>

      {/* Next Appointment */}
      <Link to="/appointments" search={{ open: nextAppointment?.id }} data-tour="next"
        style={{ ...stripCard, textDecoration: "none", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: nextAppointment ? "#6366F1" : (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)"),
            flexShrink: 0,
          }} />
          <p style={labelStyle}>Next Appointment</p>
        </div>
        {nextAppointment && slot ? (
          <>
            <p style={primaryStyle}>{nextAppointment.customer_name}</p>
            <p style={metaStyle}>
              {slot.day ? `${slot.day} · ` : ""}{slot.time}
              {countdown && (
                <>
                  <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
                  <span style={{ color: isDark ? "#A5B4FC" : "#4F46E5", fontWeight: 600 }}>{countdown}</span>
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p style={{ ...primaryStyle, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }}>
              Nothing scheduled
            </p>
            <p style={metaStyle}>Bookings will land here</p>
          </>
        )}
      </Link>
    </div>
  )
}

// ─── Status Strip (compact, mobile-only) ──────────────────
// One horizontal row of 3 pills. Replaces the full StatusStrip on phones so
// the top of the dashboard isn't 3 stacked cards eating half the viewport.
// Each pill: colored dot + short status. The Needs Action pill links to /needs-action.

function StatusStripCompact({
  clinicActive, actionCount, nextAppointment, liveCall,
}: {
  clinicActive: boolean
  actionCount: number
  nextAppointment: Appointment | null
  liveCall: Call | null
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const aiDotColor = liveCall ? "#10B981" : clinicActive ? "#10B981" : "#E5484D"
  const aiText = liveCall ? "On call" : clinicActive ? "Live" : "Offline"

  const needsDotColor = actionCount > 0 ? "#F59E0B" : "#10B981"
  const needsText = actionCount > 0 ? `${actionCount} to review` : "All clear"

  const nextText = nextAppointment
    ? (timeUntil(nextAppointment.scheduled_start) || formatScheduleSlot(nextAppointment.scheduled_start).time)
    : "Nothing yet"
  const nextDotColor = nextAppointment ? "#6366F1" : (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)")

  const pillStyle: React.CSSProperties = {
    flex: 1, minWidth: 0,
    display: "flex", alignItems: "center", gap: 7,
    padding: "9px 12px",
    background: isDark ? "var(--card)" : "#ffffff",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
    borderRadius: 999,
    fontSize: 11.5, fontWeight: 500,
    color: isDark ? "#F2F2F7" : "#0A0A0B",
    letterSpacing: "-0.01em",
    overflow: "hidden",
    textDecoration: "none",
  }
  const textStyle: React.CSSProperties = {
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1,
  }

  return (
    <div className="status-strip-compact" style={{ gap: 6 }}>
      {/* AI Agent */}
      <div style={pillStyle}>
        <span
          className={liveCall || clinicActive ? "animate-live-pulse" : undefined}
          style={{ width: 6, height: 6, borderRadius: "50%", background: aiDotColor, flexShrink: 0 }}
        />
        <span style={textStyle}>{aiText}</span>
      </div>

      {/* Needs Attention */}
      <Link to="/needs-action" style={pillStyle}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: needsDotColor, flexShrink: 0 }} />
        <span style={textStyle}>{needsText}</span>
      </Link>

      {/* Next Appointment */}
      <Link to="/appointments" search={{ open: nextAppointment?.id }} style={pillStyle}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: nextDotColor, flexShrink: 0 }} />
        <span style={textStyle}>{nextText}</span>
      </Link>
    </div>
  )
}

// ─── Notification Bell ────────────────────────────────────

const EVENT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ai_failure:       { label: "AI Failed",       color: "#991B1B", bg: "#FEE2E2", border: "rgba(229,72,77,0.2)" },
  partial_booking:  { label: "Partial Booking", color: "#92400E", bg: "#FEF3C7", border: "rgba(245,158,11,0.2)" },
  concurrent_call:  { label: "Concurrent Call", color: "#1E40AF", bg: "#DBEAFE", border: "rgba(59,130,246,0.2)" },
  transfer_unknown: { label: "Unknown Transfer", color: "#92400E", bg: "#FEF3C7", border: "rgba(245,158,11,0.2)" },
}

function NotificationBell() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function openCall(callId: string | null) {
    if (!callId) return
    setOpen(false)
    navigate({ to: "/calls/$id", params: { id: callId } })
  }

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ["operational-events"],
    queryFn: getUnresolvedOperationalEvents,
    refetchInterval: 30_000,
  })
  const { data: queue = [], refetch: refetchQueue } = useQuery({
    queryKey: ["call-queue"],
    queryFn: getPendingCallQueue,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const eventsChannel = supabase
      .channel("operational_events_live_bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "operational_events" }, () => refetchEvents())
      .subscribe()
    const queueChannel = supabase
      .channel("call_queue_live_bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_queue" }, () => refetchQueue())
      .subscribe()
    return () => { supabase.removeChannel(eventsChannel); supabase.removeChannel(queueChannel) }
  }, [refetchEvents, refetchQueue])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function handleResolveEvent(id: string) {
    await resolveOperationalEvent(id)
    queryClient.setQueryData<OperationalEvent[]>(["operational-events"], prev => (prev ?? []).filter(e => e.id !== id))
  }
  async function handleQueueHandled(id: string) {
    await markQueueItemHandled(id)
    queryClient.setQueryData<CallQueueItem[]>(["call-queue"], prev => (prev ?? []).filter(q => q.id !== id))
  }

  // A partial booking raises both an event and a queue item for the same call;
  // show it once (the queue item, which has the caller's name and service).
  const queuedCallIds = new Set(queue.map(q => q.call_id).filter(Boolean))
  const actionableEvents = events.filter(e => e.event_type !== "concurrent_call" && !(e.call_id && queuedCallIds.has(e.call_id)))
  const totalCount = actionableEvents.length + queue.length
  const hasItems = totalCount > 0

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-label="Notifications"
        style={{
          position: "relative", width: 34, height: 34, borderRadius: 10,
          background: open
            ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")
            : (isDark ? "rgba(255,255,255,0.04)" : "var(--card)"),
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "background 0.15s", flexShrink: 0,
        }}
      >
        <Bell style={{ width: 14, height: 14, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)" }} strokeWidth={1.75} />
        {hasItems && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 15, height: 15, borderRadius: 999,
            background: "#E5484D", color: "#fff",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3.5px", letterSpacing: "0.02em",
            border: `2px solid ${isDark ? "var(--background)" : "#F5F5F7"}`,
            lineHeight: 1,
          }}>
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-scale-in" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340,
          background: isDark ? "var(--popover)" : "#fff",
          borderRadius: 16,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
          overflow: "hidden", zIndex: 100,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 16px 11px",
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
              Needs Attention
            </span>
            {hasItems && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                background: "#E5484D", color: "#fff", letterSpacing: "0.02em",
              }}>
                {totalCount} item{totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {!hasItems ? (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: isDark ? "rgba(16,185,129,0.08)" : "#ECFDF5",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 10px",
                border: "1px solid rgba(16,185,129,0.15)",
              }}>
                <CheckCircle2 style={{ width: 16, height: 16, color: "#10B981" }} strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", letterSpacing: "-0.01em", marginBottom: 3 }}>
                All clear
              </p>
              <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
                No items need your attention
              </p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {actionableEvents.map((event) => {
                const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.ai_failure
                const p = event.payload ?? {}
                const phone = (p.caller_phone as string) ?? null
                const reason = (p.ended_reason as string) ?? null
                const callId = event.call_id
                return (
                  <div key={event.id} className="row-hover"
                    role={callId ? "button" : undefined} tabIndex={callId ? 0 : undefined}
                    onClick={() => openCall(callId)}
                    onKeyDown={e => { if (e.key === "Enter") openCall(callId) }}
                    style={{
                    display: "flex", alignItems: "flex-start", gap: 11,
                    padding: "11px 16px", cursor: callId ? "pointer" : "default",
                    borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: isDark ? "rgba(229,72,77,0.1)" : "#FEE2E2",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid rgba(229,72,77,0.2)",
                    }}>
                      <AlertTriangle style={{ width: 12, height: 12, color: "#E5484D" }} strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                          color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                          whiteSpace: "nowrap", letterSpacing: "0.01em",
                        }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>{timeAgo(event.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 12.5, color: "var(--foreground)", letterSpacing: "-0.01em", marginBottom: 7 }}>
                        {phone ?? "Unknown caller"}
                        {reason && <span style={{ color: "var(--muted-foreground)", marginLeft: 5, fontSize: 11 }}>{reason.replace(/-/g, " ")}</span>}
                      </p>
                      <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => handleResolveEvent(event.id)} style={{
                          fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)",
                          cursor: "pointer", padding: "3px 9px", borderRadius: 7,
                          border: "1px solid var(--border)", background: "var(--card)",
                          letterSpacing: "-0.01em", whiteSpace: "nowrap",
                        }}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                    {callId && <ChevronRight style={{ width: 14, height: 14, color: "var(--muted-foreground)", opacity: 0.6, flexShrink: 0, alignSelf: "center" }} />}
                  </div>
                )
              })}
              {queue.map((item) => {
                const isPartial = item.queue_type === "partial_booking"
                return (
                  <div key={item.id} className="row-hover"
                    role={item.call_id ? "button" : undefined} tabIndex={item.call_id ? 0 : undefined}
                    onClick={() => openCall(item.call_id)}
                    onKeyDown={e => { if (e.key === "Enter") openCall(item.call_id) }}
                    style={{
                    display: "flex", alignItems: "flex-start", gap: 11,
                    padding: "11px 16px", cursor: item.call_id ? "pointer" : "default",
                    borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: isPartial ? (isDark ? "rgba(245,158,11,0.1)" : "#FEF3C7") : (isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: isPartial ? "1px solid rgba(245,158,11,0.2)" : "1px solid var(--border)",
                    }}>
                      <IconPhone color={isPartial ? "#D97706" : "var(--muted-foreground)"} size={12} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--foreground)", letterSpacing: "-0.01em", marginBottom: 2 }}>
                        {item.caller_name ?? item.caller_phone ?? "Unknown caller"}
                        <span style={{
                          marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                          color: isPartial ? "#92400E" : "var(--muted-foreground)",
                          background: isPartial ? "#FEF3C7" : "var(--muted)",
                          border: isPartial ? "1px solid rgba(245,158,11,0.2)" : "1px solid var(--border)",
                        }}>
                          {isPartial ? "Partial booking" : "Missed call"}
                        </span>
                      </p>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 7, letterSpacing: "-0.01em" }}>
                        {item.service_needed ? `${item.service_needed} · ` : ""}{timeAgo(item.created_at)}
                      </p>
                      <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                        {item.caller_phone && (
                          <a href={`tel:${item.caller_phone}`} style={{
                            fontSize: 11, fontWeight: 600, color: "var(--background)", background: "var(--foreground)",
                            textDecoration: "none", padding: "3px 9px", borderRadius: 7, whiteSpace: "nowrap",
                          }}>
                            Call back
                          </a>
                        )}
                        <button type="button" onClick={() => handleQueueHandled(item.id)} style={{
                          fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)",
                          cursor: "pointer", padding: "3px 9px", borderRadius: 7,
                          border: "1px solid var(--border)", background: "var(--card)",
                          letterSpacing: "-0.01em", whiteSpace: "nowrap",
                        }}>
                          Mark handled
                        </button>
                      </div>
                    </div>
                    {item.call_id && <ChevronRight style={{ width: 14, height: 14, color: "var(--muted-foreground)", opacity: 0.6, flexShrink: 0, alignSelf: "center" }} />}
                  </div>
                )
              })}
              <Link to="/needs-action" onClick={() => setOpen(false)} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "10px 16px",
                fontSize: 11.5, fontWeight: 600, color: "var(--muted-foreground)",
                textDecoration: "none", letterSpacing: "-0.01em",
                background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              }}>
                View all in Needs Action
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type WeekDay = { date: string; calls: number; leads: number; appointments: number }

// ─── Call Minutes Card ────────────────────────────────────
// Compact usage summary: "120 / 500 mins" + horizontal bar + footer meta

function CallMinutesCard({ secondsRemaining: balanceSecs, allowOverage, monthStats, usageFromCalls }: {
  secondsRemaining: number
  allowOverage: boolean
  monthStats?: { calls: number; secs: number }
  // Demo accounts: generated calls never touch the billing balance, so usage
  // is derived from the month's call durations instead.
  usageFromCalls?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const FULL_SECS = 5 * 60 * 60
  const FULL_MINS = Math.floor(FULL_SECS / 60)
  const secondsRemaining = usageFromCalls && monthStats ? FULL_SECS - monthStats.secs : balanceSecs
  const isExhausted = secondsRemaining <= 0
  const remainSecs = Math.max(0, secondsRemaining)
  const usedSecs = FULL_SECS - remainSecs

  // Math discipline: never show "100% used" or "300/300 mins" while any
  // time remains. If even 1 second is left, cap displayed usage at 99% /
  // FULL_MINS - 1. 100% / full count is reserved for true exhaustion.
  let usedMins: number
  let usedPct: number
  if (isExhausted) {
    usedMins = FULL_MINS
    usedPct = 100
  } else {
    // ceil() so a remainder of 59 seconds still consumes a minute on the display.
    const rawUsedMins = Math.ceil(usedSecs / 60)
    usedMins = Math.min(FULL_MINS - 1, rawUsedMins)
    const rawPct = Math.round((usedSecs / FULL_SECS) * 100)
    usedPct = Math.min(99, Math.max(0, rawPct))
  }

  const isLow = remainSecs > 0 && remainSecs <= 1800

  // accent based on usage; the more used, the warmer
  const accentColor = isExhausted ? "#E5484D" : isLow ? "#F59E0B" : "#10B981"
  const trackBg = isDark ? "rgba(255,255,255,0.08)" : "#F1F1F4"

  // Plan resets - first day of next month
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const daysToReset = Math.max(0, Math.ceil((nextReset.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))

  return (
    <div className="ios-card" style={{ overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
      {/* Top: title only */}
      <div style={{ padding: "14px 16px 0" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
          Call Minutes
        </p>
      </div>

      {/* Main KPI: "120 / 500 mins" */}
      <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "baseline", gap: 5 }}>
        <p style={{
          fontSize: 30, fontWeight: 700, color: isDark ? "#F2F2F7" : "#0A0A0B",
          lineHeight: 1, fontFamily: "Geist Mono, monospace",
          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em",
        }}>
          {usedMins}
        </p>
        <p style={{
          fontSize: 13, color: "var(--muted-foreground)", letterSpacing: "-0.01em",
          fontFamily: "Geist, sans-serif", lineHeight: 1,
        }}>
          / {FULL_MINS} mins
        </p>
      </div>

      {/* Horizontal usage bar */}
      <div style={{ padding: "14px 16px 8px" }}>
        <div style={{
          width: "100%", height: 7, borderRadius: 999,
          background: trackBg, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            height: "100%", width: `${usedPct}%`,
            background: accentColor, borderRadius: 999,
            transition: "width 0.4s var(--ease-out-strong)",
          }} />
        </div>
      </div>

      {/* Used % left + View usage link right */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px 4px",
      }}>
        <p style={{
          fontSize: 11, fontWeight: 500,
          color: isExhausted ? "#DC2626" : isLow ? "#B45309" : "var(--muted-foreground)",
          letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums",
        }}>
          {isExhausted && !allowOverage ? "Limit reached" : `${usedPct}% used`}
        </p>
        <Link to="/calls" style={{
          fontSize: 11, fontWeight: 500,
          color: isDark ? "#818CF8" : "#6366F1",
          textDecoration: "none", letterSpacing: "-0.01em",
        }}>
          See calls
        </Link>
      </div>

      {/* This month at a glance — fills the card with context, not whitespace */}
      {monthStats && monthStats.calls > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          margin: "14px 16px 0", paddingTop: 12, borderTop: "1px solid var(--border)",
        }}>
          {[
            { label: "Calls", value: String(monthStats.calls) },
            { label: "Avg call", value: formatDuration(Math.round(monthStats.secs / monthStats.calls)) },
            { label: "Left", value: `${Math.max(0, Math.floor(secondsRemaining / 60))}m` },
          ].map(item => (
            <div key={item.label} style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginBottom: 2 }}>{item.label}</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer: reset info */}
      <div style={{
        padding: "10px 16px 14px",
        marginTop: "auto",
      }}>
        <p style={{
          fontSize: 11, color: "var(--muted-foreground)",
          opacity: 0.7, letterSpacing: "-0.01em",
        }}>
          {isExhausted && allowOverage
            ? "Overage active"
            : daysToReset === 0
              ? "Resets today"
              : `Resets in ${daysToReset} day${daysToReset !== 1 ? "s" : ""}`}
        </p>
      </div>
    </div>
  )
}

// ─── Schedule Card ────────────────────────────────────────

function ScheduleCard({ appointments }: { appointments: Appointment[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const sorted = [...appointments].sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
  const now = new Date()
  const upcoming = sorted.filter(a => new Date(a.scheduled_start) >= now)
  const count = upcoming.length

  return (
    <div className="ios-card schedule-card" style={{ overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 18px 13px",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: isDark ? "rgba(255,255,255,0.06)" : "#ECFDF5",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.04)",
          }}>
            <IconCalendar color="#10B981" size={12} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#F2F2F7" : "#0A0A0B", letterSpacing: "-0.02em" }}>
            Coming Up
          </span>
          {count > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px",
              borderRadius: 999, color: "#065F46",
              background: "#D1FAE5", border: "1px solid rgba(16,185,129,0.2)", letterSpacing: "0.02em",
            }}>
              {count}
            </span>
          )}
        </div>
        <Link to="/appointments" style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 11, fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
          textDecoration: "none", letterSpacing: "-0.01em",
          transition: "color 0.15s",
        }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)")}
        >
          View all
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 7 }}>
          <IconCalendar color={isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.15)"} size={22} />
          <p style={{ fontSize: 12.5, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.33)", letterSpacing: "-0.01em" }}>
            No upcoming appointments
          </p>
        </div>
      ) : (
        <div className="schedule-card-body">
          {upcoming.map((apt, idx) => {
            const countdown = timeUntil(apt.scheduled_start)
            const isNext = idx === 0 && !!countdown
            const slot = formatScheduleSlot(apt.scheduled_start)
            return (
              <div key={apt.id} className="row-hover" style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "10px 18px",
                borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
              }}>
                <div style={{ width: 60, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {slot.day && (
                    <p style={{ fontSize: 9, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.2, marginBottom: 1 }}>
                      {slot.day}
                    </p>
                  )}
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? "#F2F2F7" : "#0A0A0B", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                    {slot.time}
                  </p>
                </div>

                <div style={{
                  width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                  background: isNext ? "#10B981" : (isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)"),
                  boxShadow: isNext ? "0 0 0 3px rgba(16,185,129,0.14)" : "none",
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 500, color: isDark ? "#F2F2F7" : "#0A0A0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                    {apt.customer_name}
                  </p>
                  {apt.service_type && (
                    <p style={{ fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                      {apt.service_type}
                    </p>
                  )}
                </div>

                {countdown ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                    color: isNext ? "#065F46" : (isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.35)"),
                    background: isNext ? "#D1FAE5" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
                    border: isNext ? "1px solid rgba(16,185,129,0.2)" : `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
                    flexShrink: 0, whiteSpace: "nowrap", letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums",
                  }}>
                    {countdown}
                  </span>
                ) : (
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 999,
                    color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)",
                    background: "transparent", flexShrink: 0, letterSpacing: "0.01em",
                  }}>
                    Upcoming
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Activity Row ─────────────────────────────────────────

function ActivityRow({ call, delay }: { call: Call & { is_repeat_caller?: boolean }; delay?: number }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const cfg = OUTCOME_CONFIG[call.outcome ?? ""] ?? null
  const callerDisplay = callerPhoneLabel(call)
  const summary = buildCallSummary(call)

  return (
    <Link to="/calls/$id" params={{ id: call.id }}
      className="animate-fade-up"
      style={{
        display: "flex", alignItems: "center", gap: 0,
        textDecoration: "none",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
        animationDelay: `${delay ?? 0}ms`,
        transition: "background 0.1s ease",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.018)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* Outcome dot accent - left edge */}
      <div style={{ width: 3, alignSelf: "stretch", background: cfg?.dot ?? "transparent", opacity: 0.65, flexShrink: 0 }} />

      {/* Caller info */}
      <div style={{ padding: "10px 14px 10px 13px", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.85)" : "#0A0A0B",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}>
            {callerDisplay}
          </span>
          {call.is_repeat_caller && (
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 999,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)",
              fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap", letterSpacing: "0.03em",
            }}>
              RETURN
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.38)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em",
        }}>
          {summary}
        </p>
      </div>

      {/* Outcome badge */}
      <div style={{ padding: "0 10px 0 0", flexShrink: 0 }}>
        <OutcomeBadge outcome={call.outcome} />
      </div>

      {/* Duration */}
      {call.duration_secs != null && (
        <span style={{
          fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
          fontVariantNumeric: "tabular-nums", padding: "0 10px 0 0", flexShrink: 0, minWidth: 38,
        }}>
          {formatDuration(call.duration_secs)}
        </span>
      )}

      {/* Time + chevron */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 14px 0 0", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.28)", whiteSpace: "nowrap" }}>
          {timeAgo(call.started_at ?? call.created_at)}
        </span>
      </div>
    </Link>
  )
}

function GhostActivityRow() {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      borderBottom: "1px solid var(--border)", opacity: 0.28,
    }}>
      <div style={{ width: 3, alignSelf: "stretch", background: "var(--muted-foreground)" }} />
      <div style={{ padding: "10px 14px 10px 13px", flex: 1 }}>
        <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 5, borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 9, width: 150, borderRadius: 5 }} />
      </div>
      <div style={{ padding: "0 10px 0 0" }}>
        <div className="skeleton" style={{ height: 18, width: 48, borderRadius: 999 }} />
      </div>
      <div style={{ padding: "0 14px 0 0" }}>
        <div className="skeleton" style={{ height: 9, width: 32, borderRadius: 5 }} />
      </div>
    </div>
  )
}

// ─── Footer Status ────────────────────────────────────────

function FooterStatus({ clinicActive, agentStatus }: {
  clinicActive: boolean
  agentStatus: { hasPhone: boolean; isActive: boolean; exhausted: boolean }
}) {
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
      intervalRef.current = setInterval(() => setElapsed(formatElapsed(liveCall.created_at!)), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setElapsed("")
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [liveCall?.id, liveCall?.created_at])

  if (!clinicActive) {
    // Same wording as the AI Agent tooltip. A missing phone number is a setup
    // step, not an error, so it reads neutral; paused/inactive stay red.
    const { title, body } = agentStatusCopy(agentStatus)
    const isSetupStep = agentStatus.isActive && !agentStatus.exhausted && !agentStatus.hasPhone
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "4px 0 20px" }}>
        {isSetupStep
          ? <Info style={{ width: 13, height: 13, color: "var(--muted-foreground)", flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
          : <XCircle style={{ width: 13, height: 13, color: "#E5484D", flexShrink: 0, marginTop: 1 }} strokeWidth={1.5} />}
        <span style={{ fontSize: 11.5, letterSpacing: "-0.01em", color: isSetupStep ? "var(--muted-foreground)" : "#E5484D" }}>
          <span style={{ fontWeight: 600 }}>{title}.</span> {body}
        </span>
      </div>
    )
  }

  if (liveCall) return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0 20px" }}>
      <span className="animate-live-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--foreground)", flexShrink: 0, display: "block" }} />
      <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
        Call in progress
        {elapsed && <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 6 }}>{elapsed}</span>}
      </span>
    </div>
  )

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0 20px" }}>
      <span className="animate-live-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", flexShrink: 0, display: "block" }} />
      <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>Orvia is live</span>
    </div>
  )
}

// ─── Mock data (dev only) ─────────────────────────────────

export default function OverviewPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [liveElapsed, setLiveElapsed] = useState("")
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Picked once per visit (not per refetch) so the header doesn't reshuffle
  // every 30 seconds while you're looking at it.
  const greetingRef = useRef<Greeting | null>(null)


  const briefing = useQuery({ queryKey: ["briefing"], queryFn: getBriefing, refetchInterval: 30_000 })
  const weeklyQuery = useQuery({ queryKey: ["weekly-stats"], queryFn: getWeeklyCallStats })
  const liveCallQuery = useQuery({ queryKey: ["live-call"], queryFn: getLiveCallStatus, refetchInterval: 10_000 })
  const { data: opEvents = [] } = useQuery({ queryKey: ["operational-events"], queryFn: getUnresolvedOperationalEvents, refetchInterval: 30_000 })
  const { data: callQueue = [] } = useQuery({ queryKey: ["call-queue"], queryFn: getPendingCallQueue, refetchInterval: 30_000 })
  const { data: monthStats } = useQuery({ queryKey: ["month-call-stats"], queryFn: getMonthCallStats, refetchInterval: 60_000 })
  const { data: businessSettings } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettings })
  const isGuest = useGuestNiche() !== null

  useEffect(() => {
    const liveCall = liveCallQuery.data
    if (liveCall?.created_at) {
      setLiveElapsed(formatElapsed(liveCall.created_at))
      liveIntervalRef.current = setInterval(() => setLiveElapsed(formatElapsed(liveCall.created_at!)), 1000)
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
      setLiveElapsed("")
    }
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current) }
  }, [liveCallQuery.data?.id, liveCallQuery.data?.created_at])

  const weeklyDays = weeklyQuery.data ?? []
  const weekLabels = weeklyDays.map(d => d.date)
  const todayStats = weeklyDays[6]
  const yestStats = weeklyDays[5]

  if (briefing.isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 8, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 12, width: 170, opacity: 0.55, borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ height: 34, width: 34, borderRadius: 10 }} />
      </div>
      <div className="skeleton" style={{ height: 64, borderRadius: 14 }} />
      <div className="overview-stat-grid">
        <StatSkeleton primary />
        <div className="stat-compact-stack">
          <StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
      </div>
      <div className="overview-bottom-grid-3">
        <div className="ios-card" style={{ height: 220 }} />
        <div className="ios-card" style={{ height: 220 }} />
      </div>
      <div className="ios-card" style={{ height: 300 }} />
    </div>
  )

  if (briefing.isError) return (
    <div style={{ padding: "80px 0", textAlign: "center" }}>
      <XCircle style={{ width: 28, height: 28, color: "#E5484D", margin: "0 auto 10px" }} strokeWidth={1.5} />
      <p style={{ fontSize: 13.5, color: "var(--foreground)", fontWeight: 500, letterSpacing: "-0.01em" }}>Something went wrong loading your dashboard.</p>
      <button onClick={() => briefing.refetch()}
        style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
        Try again
      </button>
    </div>
  )

  const d = briefing.data
  const calls = d?.callsToday ?? 0
  const appointments = d?.appointmentsToday ?? 0
  const leads = d?.leadsToday ?? 0
  const upcomingAppointments = d?.upcomingAppointments ?? []
  const recentCalls = d?.recentCalls ?? []
  const clinicActive = !SHOW_AGENT_SETUP_STATUS || (d?.businessStatus === "active" && d?.businessHasPhone && (d?.hasCredits ?? false))
  const secondsRemaining = d?.secondsRemaining ?? 0
  const allowOverage = d?.allowOverage ?? false

  const weeklyTotalCalls = weeklyDays.reduce((s, d) => s + d.calls, 0)
  const weeklyTotalBooked = weeklyDays.reduce((s, d) => s + d.appointments, 0)
  // Booking rate must never exceed 100%. If booked > calls, the data is inconsistent
  // (e.g. historical appointments without matching calls) — show "--" rather than a misleading number.
  const rawRatePct = weeklyTotalCalls > 0
    ? Math.round((weeklyTotalBooked / weeklyTotalCalls) * 100)
    : calls > 0 ? Math.round((appointments / calls) * 100) : null
  const bookingRatePct = rawRatePct !== null && rawRatePct >= 0 && rawRatePct <= 100 ? rawRatePct : null
  const bookingRateDisplay = bookingRatePct !== null ? `${bookingRatePct}%` : "--"

  // ─── Stat card sublabels: trend vs yesterday + small detail ──────────
  function trendCopy(today: number, yesterday: number): string | null {
    if (today === 0 && yesterday === 0) return null
    if (yesterday === 0) return today > 0 ? "first of the day" : null
    const pct = Math.round(Math.abs((today - yesterday) / yesterday) * 100)
    if (pct === 0) return "same as yesterday"
    const dir = today > yesterday ? "↑" : "↓"
    return `${dir} ${Math.min(999, pct)}% vs yesterday`
  }

  const callsTrend = trendCopy(todayStats?.calls ?? 0, yestStats?.calls ?? 0)
  const leadsTrend = trendCopy(todayStats?.leads ?? 0, yestStats?.leads ?? 0)

  const todayApptCount = upcomingAppointments.filter(a => {
    const d = new Date(a.scheduled_start)
    const t = new Date()
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  }).length

  const callsSublabel = callsTrend ?? (calls === 1 ? "1 call today" : `${calls} calls today`)
  // Same measure as the big number (bookings *made*), so the two never
  // disagree — appointments *scheduled* for today live in Coming Up.
  const apptSublabel = weeklyTotalBooked > 0
    ? `${weeklyTotalBooked} booked in the last 7 days`
    : "none booked yet"
  const leadsSublabel = leadsTrend ?? (leads === 1 ? "1 new today" : `${leads} new today`)
  const bookingSublabel = bookingRatePct !== null
    ? `${weeklyTotalBooked} booked · ${weeklyTotalCalls} calls`
    : weeklyTotalCalls === 0 ? "no calls this week" : "—"
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const now = new Date()
  const nextAppointment = upcomingAppointments
    .filter(a => new Date(a.scheduled_start) >= now)
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0] ?? null

  // Same dedupe as the bell: a partial booking's event and queue item count once.
  const queuedCallIds = new Set(callQueue.map(q => q.call_id).filter(Boolean))
  const actionableCount = opEvents.filter(e => e.event_type !== "concurrent_call" && !(e.call_id && queuedCallIds.has(e.call_id))).length + callQueue.length

  if (!greetingRef.current) {
    greetingRef.current = pickGreeting({
      firstName: firstNameOf(profile.fullName),
      now: new Date(),
      callsToday: calls,
      bookedToday: appointments,
      leadsToday: leads,
      bookedThisWeek: weeklyTotalBooked,
      nextAppointment: nextAppointment ? { name: nextAppointment.customer_name, at: new Date(nextAppointment.scheduled_start) } : null,
      actionCount: actionableCount,
      agentLive: !!clinicActive,
    })
  }
  const greeting = greetingRef.current

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {isGuest && <GuestTour agentName={businessSettings?.settings.receptionist_name} />}
      <style>{`
        .overview-stat-grid {
          display: grid;
          grid-template-columns: 1.25fr 1fr;
          gap: 12px;
          align-items: stretch;
        }
        .stat-compact-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .stat-compact-stack > * { flex: 1; }
        .overview-bottom-grid-3 {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 12px;
          /* Equal heights: grid stretches all cards to match the tallest peer.
             ScheduleCard self-caps with internal scroll, so it never becomes
             the dictating tallest child on desktop. */
          align-items: stretch;
        }
        /* Cap Schedule card height so a long list doesn't push the row taller
           than its peers. Body scrolls internally instead. */
        .schedule-card { max-height: 240px; }
        @media (max-width: 700px) {
          /* Single column: let the card breathe — users scroll the page, not the card. */
          .schedule-card { max-height: none; }
        }
        .schedule-card-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .schedule-card-body::-webkit-scrollbar { width: 6px; }
        .schedule-card-body::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 999px;
        }
        .schedule-card-body::-webkit-scrollbar-track { background: transparent; }
        .status-strip { flex-wrap: nowrap; }
        @media (max-width: 860px) {
          .overview-bottom-grid-3 { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 800px) {
          .status-strip { flex-wrap: wrap; }
          .status-strip > * { flex: 1 1 calc(50% - 5px) !important; min-width: 0 !important; }
        }
        @media (max-width: 700px) {
          .overview-stat-grid { grid-template-columns: 1fr; gap: 10px; }
          .overview-bottom-grid-3 { grid-template-columns: 1fr; }
          .overview-header-right { display: none !important; }
          .overview-header h1 { font-size: 22px !important; }
          /* Hide the full status-strip on mobile; the compact pill row takes over. */
          .status-strip { display: none !important; }
          .status-strip-compact { display: flex !important; }
        }
        /* Compact mobile-only strip: 3 pills in one row, ~36px tall. */
        .status-strip-compact { display: none; }
        @media (max-width: 400px) {
          .overview-stat-grid { gap: 8px; }
        }
        @media (max-width: 700px) {
          .stat-primary { grid-template-columns: 1fr !important; }
          .stat-primary .stat-card-value { font-size: 44px !important; }
          .stat-primary-chart { min-height: 140px !important; height: 140px; }
        }
      `}</style>

      {/* ── Header ────────────────────────────────────────── */}
      {/* position+zIndex: the fade-up transform makes this a stacking context;
          lifting it keeps the bell dropdown above the cards below. */}
      <div className="overview-header animate-fade-up animate-fade-up-1"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2, position: "relative", zIndex: 30 }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px",
            color: "var(--foreground)", marginBottom: 5, lineHeight: 1.2, fontFamily: "Geist, sans-serif",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {greeting.headline}
            {greeting.emoji === "wave"
              ? <img src="/wave-emoji.png" alt="" style={{ width: 28, height: 28, display: "inline-block", verticalAlign: "middle" }} />
              : <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>{greeting.emoji}</span>}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
            {todayStr}
            <span style={{ margin: "0 7px", opacity: 0.4 }}>&middot;</span>
            {greeting.subline}
          </p>
        </div>

        <div className="overview-header-right" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <TestCallButton />
          <NotificationBell />
        </div>
      </div>

      {/* ── Status Strip ────────────────────────────────────
          Full 3-card strip on tablet+ , compact pill row on phones.
          CSS swaps them via media query at 700px. */}
      <StatusStrip
        clinicActive={!!clinicActive}
        agentStatus={{
          hasPhone: !!d?.businessHasPhone,
          isActive: d?.businessStatus === "active",
          exhausted: !(d?.hasCredits ?? false),
        }}
        actionCount={actionableCount}
        nextAppointment={nextAppointment}
        liveCall={liveCallQuery.data ?? null}
        elapsed={liveElapsed}
      />
      <StatusStripCompact
        clinicActive={!!clinicActive}
        actionCount={actionableCount}
        nextAppointment={nextAppointment}
        liveCall={liveCallQuery.data ?? null}
      />

      {/* ── KPI Cards ─────────────────────────────────────── */}
      {/* Appointments booked is the outcome owners pay for — it gets the hero slot. */}
      <div className="overview-stat-grid">
        <PrimaryStatCard
          value={appointments} label="Appointments booked today"
          sublabel={apptSublabel}
          days={weeklyDays}
        />
        <div className="stat-compact-stack" data-tour="kpis">
          <CompactStatCard value={calls} label="Calls handled today" sublabel={callsSublabel}
            series={weeklyDays.map(d => d.calls)} seriesLabels={weekLabels}
            formatPoint={v => `${v} call${v === 1 ? "" : "s"}`} color="#6366F1" />
          <CompactStatCard value={leads} label="New leads today" sublabel={leadsSublabel}
            series={weeklyDays.map(d => d.leads)} seriesLabels={weekLabels}
            formatPoint={v => `${v} lead${v === 1 ? "" : "s"}`} color="#F59E0B" />
          <CompactStatCard value={bookingRateDisplay} label="Booking rate · 7 days" sublabel={bookingSublabel}
            series={weeklyDays.map(d => d.calls > 0 ? Math.round((d.appointments / d.calls) * 100) : 0)} seriesLabels={weekLabels}
            formatPoint={v => `${v}% booked`} color="#10B981" />
        </div>
      </div>

      {/* ── Schedule / Chart / Minutes ─────────────────────── */}
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, opacity: 0.45 }}>
          Schedule &amp; Performance
        </p>
        <div className="overview-bottom-grid-3" data-tour="schedule">
          <ScheduleCard appointments={upcomingAppointments} />
          <CallMinutesCard
            secondsRemaining={secondsRemaining}
            allowOverage={allowOverage}
            monthStats={monthStats}
            usageFromCalls={!!businessSettings?.settings.demo_autofill}
          />
        </div>
      </div>

      {/* ── Recent Calls ──────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, opacity: 0.45 }}>
          Recent Activity
        </p>
        <div className="ios-card animate-fade-up" data-tour="recent" style={{ padding: 0, overflow: "hidden" }}>
          {/* Card header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 16px 12px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Phone style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em" }}>Latest Calls</span>
              {recentCalls.length > 0 && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "1px 6px",
                  borderRadius: 999, color: "var(--primary-foreground)",
                  background: "var(--foreground)", letterSpacing: "0.02em",
                }}>
                  {recentCalls.length}
                </span>
              )}
            </div>
            {recentCalls.length > 0 && (
              <Link to="/calls" style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 11.5, fontWeight: 500,
                color: "var(--muted-foreground)", textDecoration: "none",
                letterSpacing: "-0.01em", opacity: 0.65,
                transition: "opacity 0.15s ease",
              }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "0.65")}
              >
                See all
              </Link>
            )}
          </div>

          {recentCalls.length === 0 ? (
            <>
              <GhostActivityRow />
              <GhostActivityRow />
              <GhostActivityRow />
            </>
          ) : (
            recentCalls.map((call, i) => <ActivityRow key={call.id} call={call} delay={i * 35} />)
          )}
        </div>
      </div>

      {/* Footer */}
      <FooterStatus clinicActive={!!clinicActive} agentStatus={{
        hasPhone: !!d?.businessHasPhone,
        isActive: d?.businessStatus === "active",
        exhausted: !(d?.hasCredits ?? false),
      }} />
    </div>
  )
}
