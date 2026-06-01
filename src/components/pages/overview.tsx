import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import {
  Phone,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bell,
  Clock,
} from "lucide-react"

// ─── Premium SVG Icons ────────────────────────────────────

function IconPhoneCall({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      <path d="M14.05 2a9 9 0 0 1 7.94 7.94"/>
      <path d="M14.05 6A5 5 0 0 1 18 9.95"/>
    </svg>
  )
}

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

function IconUsers({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconClock({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
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
  resolveOperationalEvent,
  markQueueItemHandled,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import { supabase } from "@/lib/supabase"
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
  const name = (extracted.caller_name as string) ?? call.caller_phone ?? "Unknown"
  const service = (extracted.service_needed as string) ?? null
  const outcomeMap: Record<string, string> = {
    appointment_booked: "Appointment booked",
    lead_captured: "Lead captured",
    info_given: "Info provided",
    transferred: "Transferred",
    missed: "Missed",
  }
  const outcome = call.outcome ? outcomeMap[call.outcome] ?? call.outcome.replace(/_/g, " ") : ""
  if (service) return `${name} · ${service}`
  return `${name} · ${outcome}`
}

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null
  const hour = new Date().getHours()
  return firstName
    ? (hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`)
    : (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening")
}

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return ""
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `In ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `In ${hrs}h ${rem}m` : `In ${hrs}h`
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

// ─── Sparkline ────────────────────────────────────────────

function Sparkline({ data, color, gradientId }: { data: number[]; color: string; gradientId: string }) {
  if (!data.length || !data.some(v => v > 0)) return null
  const pts = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={pts} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75}
          fill={`url(#${gradientId})`} dot={false} isAnimationActive={false}
          strokeLinecap="round" strokeLinejoin="round" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Trend Badge ──────────────────────────────────────────

function TrendBadge({ today, yesterday }: { today: number; yesterday: number }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  if (today === 0 && yesterday === 0) return null
  const diff = today - yesterday
  // Don't fabricate percentages off a zero baseline — "growth from zero" is undefined.
  // Cap displayed pct at 999% so a hot day never breaks the layout.
  const pct = yesterday > 0 ? Math.min(999, Math.round(Math.abs(diff / yesterday) * 100)) : null
  const label = pct !== null ? `${pct}%` : "New"

  if (diff > 0) return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      color: "#065F46", background: "#D1FAE5", border: "1px solid rgba(16,185,129,0.2)",
      letterSpacing: "0.01em", whiteSpace: "nowrap",
    }}>
      <TrendingUp style={{ width: 9, height: 9 }} strokeWidth={2} />
      {label}
    </span>
  )

  if (diff < 0) return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      color: isDark ? "#FCA5A5" : "#991B1B",
      background: isDark ? "rgba(229,72,77,0.1)" : "#FEE2E2",
      border: "1px solid rgba(229,72,77,0.18)",
      letterSpacing: "0.01em", whiteSpace: "nowrap",
    }}>
      <TrendingDown style={{ width: 9, height: 9 }} strokeWidth={2} />
      {label}
    </span>
  )

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
      letterSpacing: "0.01em", whiteSpace: "nowrap",
    }}>
      <Minus style={{ width: 8, height: 8 }} strokeWidth={2} />
      Same
    </span>
  )
}

// ─── Stat Card ────────────────────────────────────────────

function StatCard({ value, label, sublabel, icon: Icon, iconColor, cardBg,
  sparkData, sparkColor, gradientId, trendToday, trendYesterday }: {
  value: number | string
  label: string
  sublabel?: string
  icon: ({ color, size }: { color: string; size?: number }) => React.ReactElement
  iconColor: string
  cardBg: string
  sparkData?: number[]
  sparkColor?: string
  gradientId?: string
  trendToday?: number
  trendYesterday?: number
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const hasSpark = sparkData && sparkData.length > 1 && sparkData.some(v => v > 0)
  const showTrend = trendToday !== undefined && trendYesterday !== undefined

  return (
    <div className="stat-card-root" style={{
      padding: 2, borderRadius: 22,
      background: isDark ? "rgba(255,255,255,0.04)" : cardBg,
      border: isDark ? "1px solid rgba(255,255,255,0.07)" : `1px solid ${cardBg}`,
      boxShadow: isDark
        ? "0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.12)"
        : "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.05)",
      minHeight: 165, height: "100%",
      display: "flex", flexDirection: "column",
      cursor: "default",
    }}>
      <div style={{
        flex: 1, borderRadius: 20, overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: isDark ? "var(--card)" : "#ffffff",
        boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "inset 0 1px 0 rgba(255,255,255,0.9)",
      }}>
        <div className="stat-card-inner" style={{ padding: "18px 18px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: isDark ? "rgba(255,255,255,0.07)" : cardBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.04)",
                flexShrink: 0,
              }}>
                <Icon color={iconColor} size={12} />
              </div>
              <p style={{
                fontSize: 10.5, fontWeight: 600,
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
                {label}
              </p>
            </div>
            {showTrend && typeof trendToday === "number" && typeof trendYesterday === "number" && (
              <TrendBadge today={trendToday} yesterday={trendYesterday} />
            )}
          </div>

          <p className="stat-card-value" style={{
            fontSize: 40, fontWeight: 700,
            color: isDark ? "#F2F2F7" : "#0A0A0B",
            lineHeight: 1, fontFamily: "Geist Mono, monospace",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", marginBottom: 4,
          }}>
            {value === "--" ? (
              <span style={{ display: "inline-block", width: 24, height: 3, background: "currentColor", borderRadius: 2, opacity: 0.18, verticalAlign: "middle" }} />
            ) : value}
          </p>

          {sublabel && (
            <p style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.32)", letterSpacing: "-0.01em" }}>
              {sublabel}
            </p>
          )}
          <div style={{ flex: 1 }} />
        </div>

        {hasSpark && gradientId ? (
          <div style={{ marginTop: -10 }}>
            <Sparkline data={sparkData!} color={sparkColor ?? iconColor} gradientId={gradientId} />
          </div>
        ) : (
          <div style={{ height: 14 }} />
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 7 }} />
        <div className="skeleton" style={{ width: 40, height: 18, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 36, width: 48, marginBottom: 6, borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 10, width: 80, borderRadius: 6 }} />
    </div>
  )
}

// ─── Status Strip ─────────────────────────────────────────
// Calm 3-card operational reassurance band. Passive by default.

function StatusStrip({ clinicActive, actionCount, nextAppointment, liveCall, elapsed }: {
  clinicActive: boolean
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
    boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.025)",
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
  const aiMeta = liveCall ? "Active conversation" : clinicActive ? "Answering calls" : "Not accepting calls"

  const needsDotColor = actionCount > 0 ? "#F59E0B" : "#10B981"
  const needsPrimary = actionCount > 0
    ? `${actionCount} ${actionCount === 1 ? "item" : "items"} to review`
    : "All clear"
  const needsMeta = actionCount > 0 ? "Open Needs Action →" : "No issues right now"

  return (
    <div style={{ display: "flex", gap: 10 }} className="status-strip">
      {/* AI Agent */}
      <div style={stripCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            className={liveCall || clinicActive ? "animate-live-pulse" : undefined}
            style={{ width: 6, height: 6, borderRadius: "50%", background: aiDotColor, flexShrink: 0 }}
          />
          <p style={labelStyle}>AI Agent</p>
        </div>
        <p style={primaryStyle}>{aiPrimary}</p>
        <p style={metaStyle}>{aiMeta}</p>
      </div>

      {/* Needs Attention */}
      <Link to="/needs-action" style={{
        ...stripCard,
        textDecoration: "none",
        cursor: actionCount > 0 ? "pointer" : "default",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: needsDotColor, flexShrink: 0 }} />
            <p style={labelStyle}>Needs Attention</p>
          </div>
          {actionCount > 0 && (
            <ChevronRight style={{ width: 12, height: 12, color: "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={1.75} />
          )}
        </div>
        <p style={primaryStyle}>{needsPrimary}</p>
        <p style={metaStyle}>{needsMeta}</p>
      </Link>

      {/* Next Appointment */}
      <div style={stripCard}>
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
      </div>
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
      <Link to="/appointments" style={pillStyle}>
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
  concurrent_call:  { label: "Concurrent",      color: "#1E40AF", bg: "#DBEAFE", border: "rgba(59,130,246,0.2)" },
  transfer_unknown: { label: "Transfer ?",      color: "#92400E", bg: "#FEF3C7", border: "rgba(245,158,11,0.2)" },
}

function NotificationBell() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

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

  const actionableEvents = events.filter(e => e.event_type !== "concurrent_call")
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
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
                  <div key={event.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 11,
                    padding: "11px 16px",
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
                      <div style={{ display: "flex", gap: 6 }}>
                        {callId && (
                          <Link to="/calls/$id" params={{ id: callId }} onClick={() => setOpen(false)} style={{
                            fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)",
                            textDecoration: "none", padding: "3px 9px", borderRadius: 7,
                            border: "1px solid var(--border)", background: "var(--card)",
                            letterSpacing: "-0.01em", whiteSpace: "nowrap",
                          }}>
                            View
                          </Link>
                        )}
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
                  </div>
                )
              })}
              {queue.map((item) => {
                const isPartial = item.queue_type === "partial_booking"
                return (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 11,
                    padding: "11px 16px",
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
                        {isPartial && (
                          <span style={{
                            marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#92400E",
                            background: "#FEF3C7", padding: "1px 6px", borderRadius: 999,
                            border: "1px solid rgba(245,158,11,0.2)",
                          }}>
                            Partial booking
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 7, letterSpacing: "-0.01em" }}>
                        {item.service_needed ? `${item.service_needed} · ` : ""}{timeAgo(item.created_at)}
                      </p>
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

// ─── Weekly Chart ─────────────────────────────────────────
// Compact executive summary: KPI on left, mini bar chart on right

type WeekDay = { date: string; calls: number; leads: number; appointments: number }

function WeeklyChart() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const { data: raw, isLoading } = useQuery({ queryKey: ["weekly-stats"], queryFn: getWeeklyCallStats })
  const days: WeekDay[] = raw ?? []
  const totalCalls = days.reduce((s, d) => s + d.calls, 0)
  const totalBooked = days.reduce((s, d) => s + d.appointments, 0)
  // Shape per-day data for the stacked bar: green base = appointments,
  // purple cap = calls beyond bookings. Single bar per day centres on its
  // label tick, fixing the grouped-bar offset that drifted bars off-axis.
  const chartData = days.map(d => ({
    ...d,
    callsRemaining: Math.max(0, d.calls - d.appointments),
  }))
  // Cap at 100% — see note in OverviewPage. Inconsistent seeds can push booked > calls.
  const rawRate = totalCalls > 0 ? Math.round((totalBooked / totalCalls) * 100) : null
  const bookingRate = rawRate !== null && rawRate >= 0 && rawRate <= 100 ? rawRate : null
  const bookingRateDisplay = bookingRate !== null ? `${bookingRate}%` : "--"

  // Single-day "today vs yesterday" comparison as a lightweight trend signal.
  // Skip if yesterday was zero — growth-from-zero isn't a meaningful percentage.
  const todayCalls = days[6]?.calls ?? 0
  const yestCalls = days[5]?.calls ?? 0
  const trendDiff = yestCalls > 0
    ? Math.max(-999, Math.min(999, Math.round(((todayCalls - yestCalls) / yestCalls) * 100)))
    : null

  return (
    <div className="ios-card" style={{ overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
      {/* Header: compact, KPI inline with title */}
      <div style={{
        padding: "14px 16px 8px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 600,
            color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.42)",
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
            This Week
          </p>
          <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "—" : `${totalCalls} call${totalCalls !== 1 ? "s" : ""} · ${totalBooked} booked`}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {isLoading ? (
            <div className="skeleton" style={{ height: 28, width: 64, borderRadius: 6 }} />
          ) : (
            <>
              <p style={{
                fontSize: 24, fontWeight: 700, color: isDark ? "#F2F2F7" : "#0A0A0B",
                lineHeight: 1, fontFamily: "Geist Mono, monospace",
                letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums",
              }}>
                {bookingRateDisplay}
              </p>
              <p style={{
                fontSize: 10, color: "var(--muted-foreground)",
                letterSpacing: "-0.01em", marginTop: 3,
              }}>
                Booking rate
                {trendDiff !== null && trendDiff !== 0 && (
                  <span style={{
                    marginLeft: 6, fontWeight: 600,
                    color: trendDiff > 0 ? (isDark ? "#6EE7B7" : "#059669") : (isDark ? "#FCA5A5" : "#DC2626"),
                  }}>
                    {trendDiff > 0 ? "↑" : "↓"} {Math.abs(trendDiff)}%
                  </span>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Chart fills remaining space — no fixed height, no dead zone */}
      <div style={{ flex: 1, minHeight: 0, padding: "0 8px 10px", display: "flex" }}>
        {isLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 6, padding: "8px 8px 0" }}>
            {[55, 75, 38, 95, 65, 48, 85].map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", gap: 1.5, alignItems: "flex-end" }}>
                <div className="skeleton" style={{ flex: 1, height: h * 0.65, borderRadius: "3px 3px 0 0" }} />
                <div className="skeleton" style={{ flex: 1, height: h * 0.35, borderRadius: "3px 3px 0 0", opacity: 0.5 }} />
              </div>
            ))}
          </div>
        ) : totalCalls === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)", letterSpacing: "-0.01em" }}>
              No calls yet this week
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              barCategoryGap="35%"
              margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
            >
              <XAxis dataKey="date" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", fontFamily: "Geist, sans-serif" }}
                interval={0} />
              <Tooltip cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(99,102,241,0.04)", radius: 4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  // Both segments live on the same stack — pull from the day record directly.
                  const dayRow = payload[0]?.payload as { calls?: number; appointments?: number } | undefined
                  const calls = dayRow?.calls ?? 0
                  const booked = dayRow?.appointments ?? 0
                  return (
                    <div className="chart-tooltip">
                      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 5, letterSpacing: "-0.01em" }}>{label}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {[{ color: "#6366F1", label: `${calls} call${calls !== 1 ? "s" : ""}` }, { color: "#10B981", label: `${booked} booked` }].map(({ color, label: lbl }) => (
                          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{lbl}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }}
              />
              {/* Single bar per day, stacked: green "booked" base + purple "uncovered calls" cap.
                  This guarantees each bar sits dead-centre on its day label. Booked goes on
                  the bottom so the green portion reads as "calls we converted". */}
              <Bar dataKey="appointments" stackId="day" fill="#10B981" fillOpacity={isDark ? 0.75 : 0.9} maxBarSize={11} />
              <Bar dataKey="callsRemaining" stackId="day" fill="#6366F1" fillOpacity={isDark ? 0.7 : 0.85} radius={[3, 3, 0, 0]} maxBarSize={11} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer legend */}
      {!isLoading && totalCalls > 0 && (
        <div style={{
          padding: "8px 16px 12px",
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: "#10B981" }} />
            Booked
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: "#6366F1" }} />
            Other calls
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Call Minutes Card ────────────────────────────────────
// Compact usage summary: "120 / 500 mins" + horizontal bar + footer meta

function CallMinutesCard({ secondsRemaining, allowOverage }: { secondsRemaining: number; allowOverage: boolean }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const FULL_SECS = 5 * 60 * 60
  const FULL_MINS = Math.floor(FULL_SECS / 60)
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
        <Link to="/settings" style={{
          fontSize: 11, fontWeight: 500,
          color: isDark ? "#818CF8" : "#6366F1",
          textDecoration: "none", letterSpacing: "-0.01em",
        }}>
          View usage
        </Link>
      </div>

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
          View all <ArrowRight style={{ width: 9, height: 9 }} strokeWidth={1.5} />
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
  const callerDisplay = call.caller_phone ?? "Unknown"
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
        <ArrowRight style={{ width: 9, height: 9, color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)" }} strokeWidth={1.5} />
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

function FooterStatus({ clinicActive }: { clinicActive: boolean }) {
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

  if (!clinicActive) return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0 20px" }}>
      <XCircle style={{ width: 13, height: 13, color: "#E5484D", flexShrink: 0 }} strokeWidth={1.5} />
      <span style={{ fontSize: 11.5, color: "#E5484D", letterSpacing: "-0.01em" }}>Orvia is not configured - check settings</span>
    </div>
  )

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

const MOCK_EVENTS: OperationalEvent[] = [
  { id: "mock-1", business_id: "mock", call_id: null, event_type: "ai_failure", severity: "warning", resolved: false, payload: { caller_phone: "+1 (512) 555-0192", ended_reason: "silence-timed-out" }, created_at: new Date(Date.now() - 8 * 60_000).toISOString() },
  { id: "mock-2", business_id: "mock", call_id: null, event_type: "partial_booking", severity: "warning", resolved: false, payload: { caller_phone: "+1 (737) 555-0847", service_needed: "Pipe repair" }, created_at: new Date(Date.now() - 23 * 60_000).toISOString() },
]
const MOCK_QUEUE: CallQueueItem[] = [
  { id: "mock-q-1", business_id: "mock", call_id: null, queue_type: "missed_callback", priority: 5, caller_phone: "+1 (210) 555-0374", caller_name: "Marcus Webb", service_needed: "Water heater install", status: "pending", handled_by: null, handled_at: null, created_at: new Date(Date.now() - 4 * 60_000).toISOString() },
]

// ─── Page ─────────────────────────────────────────────────

export default function OverviewPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [mockActive, setMockActive] = useState(false)
  const [liveElapsed, setLiveElapsed] = useState("")
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function toggleMock() {
    if (!mockActive) {
      queryClient.setQueryData(["operational-events"], MOCK_EVENTS)
      queryClient.setQueryData(["call-queue"], MOCK_QUEUE)
    } else {
      queryClient.setQueryData(["operational-events"], [])
      queryClient.setQueryData(["call-queue"], [])
    }
    setMockActive(!mockActive)
  }

  const briefing = useQuery({ queryKey: ["briefing"], queryFn: getBriefing, refetchInterval: 30_000 })
  const weeklyQuery = useQuery({ queryKey: ["weekly-stats"], queryFn: getWeeklyCallStats })
  const liveCallQuery = useQuery({ queryKey: ["live-call"], queryFn: getLiveCallStatus, refetchInterval: 10_000 })
  const { data: opEvents = [] } = useQuery({ queryKey: ["operational-events"], queryFn: getUnresolvedOperationalEvents, refetchInterval: 30_000 })
  const { data: callQueue = [] } = useQuery({ queryKey: ["call-queue"], queryFn: getPendingCallQueue, refetchInterval: 30_000 })

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
  const callSparkData = weeklyDays.map(d => d.calls)
  const apptSparkData = weeklyDays.map(d => d.appointments)
  const leadSparkData = weeklyDays.map(d => d.leads)
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
        <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
      </div>
      <div className="overview-bottom-grid-3">
        <div className="ios-card" style={{ height: 220 }} />
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
  const clinicActive = d?.businessStatus === "active" && d?.businessHasPhone && (d?.hasCredits ?? false)
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
  const apptSublabel = todayApptCount > 0
    ? `${todayApptCount} today · ${upcomingAppointments.length} this week`
    : upcomingAppointments.length > 0
      ? `${upcomingAppointments.length} this week`
      : "none booked yet"
  const leadsSublabel = leadsTrend ?? (leads === 1 ? "1 new today" : `${leads} new today`)
  const bookingSublabel = bookingRatePct !== null
    ? `${weeklyTotalBooked} booked · ${weeklyTotalCalls} calls`
    : weeklyTotalCalls === 0 ? "no calls this week" : "—"
  const greeting = getGreeting(profile.fullName)
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const statusLine = calls === 0
    ? "Your AI receptionist is on duty."
    : appointments > 0
      ? `${calls} call${calls !== 1 ? "s" : ""} handled · ${appointments} appointment${appointments !== 1 ? "s" : ""} booked`
      : `${calls} call${calls !== 1 ? "s" : ""} handled today`

  const now = new Date()
  const nextAppointment = upcomingAppointments
    .filter(a => new Date(a.scheduled_start) >= now)
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0] ?? null

  const actionableCount = opEvents.filter(e => e.event_type !== "concurrent_call").length + callQueue.length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .overview-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          align-items: stretch;
        }
        .overview-bottom-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1.55fr 0.9fr;
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
          .overview-stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
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
          .stat-card-value { font-size: 32px !important; }
          .stat-card-inner { padding: 14px 14px 10px !important; }
          .stat-card-root { min-height: 130px !important; }
        }
      `}</style>

      {/* ── Header ────────────────────────────────────────── */}
      <div className="overview-header animate-fade-up animate-fade-up-1"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2 }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px",
            color: "var(--foreground)", marginBottom: 5, lineHeight: 1.2, fontFamily: "Geist, sans-serif",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {greeting}
            <img src="/wave-emoji.png" alt="" style={{ width: 28, height: 28, display: "inline-block", verticalAlign: "middle" }} />
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
            {todayStr}
            <span style={{ margin: "0 7px", opacity: 0.4 }}>&middot;</span>
            {statusLine}
          </p>
        </div>

        <div className="overview-header-right" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {import.meta.env.DEV && (
            <button onClick={toggleMock} style={{
              fontSize: 10.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
              border: `1px solid ${mockActive ? "rgba(229,72,77,0.3)" : "var(--border)"}`,
              background: mockActive ? "rgba(229,72,77,0.07)" : "var(--card)",
              color: mockActive ? "#E5484D" : "var(--muted-foreground)",
              cursor: "pointer", letterSpacing: "0.02em", transition: "all 0.15s",
            }}>
              {mockActive ? "Clear mock" : "Mock alerts"}
            </button>
          )}
          <NotificationBell />
        </div>
      </div>

      {/* ── Status Strip ────────────────────────────────────
          Full 3-card strip on tablet+ , compact pill row on phones.
          CSS swaps them via media query at 700px. */}
      <StatusStrip
        clinicActive={!!clinicActive}
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
      <div className="overview-stat-grid">
        <StatCard
          value={calls} label="Calls Handled"
          sublabel={callsSublabel}
          icon={IconPhoneCall} iconColor="#6366F1" cardBg="#EEF2FF"
          sparkData={callSparkData} sparkColor="#6366F1" gradientId="spark-calls"
        />
        <StatCard
          value={appointments} label="Appointments"
          sublabel={apptSublabel}
          icon={IconCalendar} iconColor="#10B981" cardBg="#ECFDF5"
          sparkData={apptSparkData} sparkColor="#10B981" gradientId="spark-appts"
        />
        <StatCard
          value={leads} label="Leads"
          sublabel={leadsSublabel}
          icon={IconUsers} iconColor="#D97706" cardBg="#FFFBEB"
          sparkData={leadSparkData} sparkColor="#F59E0B" gradientId="spark-leads"
        />
        <StatCard
          value={bookingRateDisplay} label="Booking Rate"
          sublabel={bookingSublabel}
          icon={IconClock} iconColor="#8B5CF6" cardBg="#F5F3FF"
        />
      </div>

      {/* ── Schedule / Chart / Minutes ─────────────────────── */}
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, opacity: 0.45 }}>
          Schedule &amp; Performance
        </p>
        <div className="overview-bottom-grid-3">
          <ScheduleCard appointments={upcomingAppointments} />
          <WeeklyChart />
          <CallMinutesCard secondsRemaining={secondsRemaining} allowOverage={allowOverage} />
        </div>
      </div>

      {/* ── Recent Calls ──────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, opacity: 0.45 }}>
          Recent Activity
        </p>
        <div className="ios-card animate-fade-up" style={{ padding: 0, overflow: "hidden" }}>
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
                See all <ArrowRight style={{ width: 10, height: 10 }} strokeWidth={1.5} />
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
      <FooterStatus clinicActive={!!clinicActive} />
    </div>
  )
}
