import { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
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
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react"

// ─── Premium SVG Icons ────────────────────────────────────
// Hand-crafted SVGs, not generic icon library defaults

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

function IconZap({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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
  getBusinessBilling,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import type { Call, Appointment } from "@/lib/types"

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

// "10:00 AM" if today, "Tomorrow 10:00 AM" if tomorrow, "Mon May 25 10:00 AM" otherwise
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
  if (service) return `${name} - ${service} - ${outcome}`
  return `${name} - ${outcome}`
}

function getGreeting(name: string | null): string {
  const firstName = name?.split(" ")[0] ?? null
  const hour = new Date().getHours()
  const label = firstName
    ? (hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`)
    : (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening")
  return label
}

// ─── Outcome config ───────────────────────────────────────

const OUTCOME_CONFIG: Record<string, {
  bg: string; color: string; label: string;
  iconBg: string; iconColor: string; dot: string;
  border: string;
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
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 9px",
      borderRadius: 999,
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
      flexShrink: 0,
      letterSpacing: "0.01em",
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
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={pts} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="75%" stopColor={color} stopOpacity={0.06} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Stat Card ────────────────────────────────────────────
// Double-bezel: outer shell (tinted bg + hairline border) wraps inner white core.
// Sparkline bleeds full-width to card bottom edge - no padding clipping it.

function StatCard({ value, label, sublabel, icon: Icon, iconColor, cardBg, sparkData, sparkColor, gradientId }: {
  value: number | string
  label: string
  sublabel?: string
  icon: ({ color, size }: { color: string; size?: number }) => React.ReactElement
  iconColor: string
  cardBg: string
  sparkData?: number[]
  sparkColor?: string
  gradientId?: string
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const hasSpark = sparkData && sparkData.length > 1 && sparkData.some(v => v > 0)

  return (
    // Outer shell - tinted to card accent color, hairline border
    <div
      className="stat-card-root"
      style={{
        padding: 2,
        borderRadius: 22,
        background: isDark ? "rgba(255,255,255,0.04)" : cardBg,
        border: isDark ? "1px solid rgba(255,255,255,0.07)" : `1px solid ${cardBg}`,
        boxShadow: isDark
          ? "0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.12)"
          : "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.05)",
        minHeight: 170,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.2s cubic-bezier(0.32,0.72,0,1), transform 0.2s cubic-bezier(0.32,0.72,0,1)",
        cursor: "default",
      }}
    >
      {/* Inner core - white card with inner highlight */}
      <div
        style={{
          flex: 1,
          borderRadius: 20,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: isDark ? "var(--card)" : "#ffffff",
          boxShadow: isDark
            ? "inset 0 1px 0 rgba(255,255,255,0.06)"
            : "inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
      >
        <div className="stat-card-inner" style={{ padding: "20px 20px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Icon + label row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: isDark ? "rgba(255,255,255,0.08)" : cardBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.04)",
              flexShrink: 0,
            }}>
              <Icon color={iconColor} size={13} />
            </div>
            <p style={{
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.36)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              {label}
            </p>
          </div>

          {/* Value */}
          <p className="stat-card-value" style={{
            fontSize: 42,
            fontWeight: 700,
            color: isDark ? "#F2F2F7" : "#0A0A0B",
            lineHeight: 1,
            fontFamily: "Geist Mono, monospace",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
            marginBottom: 5,
          }}>
            {value === "--" ? (
              <span style={{ display: "inline-block", width: 28, height: 3, background: "currentColor", borderRadius: 2, opacity: 0.2, verticalAlign: "middle" }} />
            ) : value}
          </p>

          {sublabel && (
            <p style={{ fontSize: 11.5, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.36)", letterSpacing: "-0.01em" }}>
              {sublabel}
            </p>
          )}

          <div style={{ flex: 1 }} />
        </div>

        {/* Sparkline bleeds full width to card bottom - no padding */}
        {hasSpark && gradientId ? (
          <div style={{ marginTop: -14 }}>
            <Sparkline data={sparkData!} color={sparkColor ?? iconColor} gradientId={gradientId} />
          </div>
        ) : (
          <div style={{ height: 16 }} />
        )}
      </div>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="ios-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 11 }} />
        <div className="skeleton" style={{ width: 44, height: 20, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 11, width: 72, marginBottom: 8, borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 38, width: 52, marginBottom: 6, borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 10, width: 88, borderRadius: 6 }} />
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────

function SectionCard({ title, icon: Icon, count, action, subtitle, children, style: extraStyle }: {
  title: string
  icon?: React.ElementType
  count?: number
  action?: React.ReactNode
  subtitle?: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="ios-card animate-fade-up" style={{ padding: 0, overflow: "hidden", ...extraStyle }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "15px 20px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon style={{ width: 14, height: 14, color: "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={1.5} />}
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
            {title}
          </span>
          {count != null && count > 0 && (
            <span style={{
              fontSize: 10.5,
              color: "var(--primary-foreground)",
              background: "var(--foreground)",
              padding: "2px 7px",
              borderRadius: 999,
              fontWeight: 700,
              lineHeight: "17px",
              display: "inline-block",
              letterSpacing: "0.02em",
            }}>
              {count}
            </span>
          )}
          {subtitle && (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 400 }}>{subtitle}</span>
          )}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ─── Weekly Chart ─────────────────────────────────────────

type WeekDay = { date: string; calls: number; leads: number; appointments: number }

function WeeklyChart() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const { data: raw, isLoading } = useQuery({
    queryKey: ["weekly-stats"],
    queryFn: getWeeklyCallStats,
  })

  const days: WeekDay[] = raw ?? []
  const totalCalls = days.reduce((s, d) => s + d.calls, 0)
  const totalBooked = days.reduce((s, d) => s + d.appointments, 0)
  const bookingRate = totalCalls > 0 ? Math.round((totalBooked / totalCalls) * 100) : 0

  return (
    <div className="ios-card" style={{ overflow: "hidden", padding: 0 }}>
        {/* Header row - title left, metrics right */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "18px 20px 0",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <TrendingUp style={{ width: 13, height: 13, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }} strokeWidth={1.5} />
              <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.36)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                This Week
              </span>
            </div>
            {!isLoading && (
              <p style={{ fontSize: 28, fontWeight: 700, color: isDark ? "#F2F2F7" : "#0A0A0B", lineHeight: 1, fontFamily: "Geist Mono, monospace", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
                {totalCalls}
                <span style={{ fontSize: 13, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)", letterSpacing: "-0.01em", marginLeft: 6, fontFamily: "Geist, sans-serif" }}>
                  call{totalCalls !== 1 ? "s" : ""}
                </span>
              </p>
            )}
          </div>

          {/* Metric pills - right aligned */}
          {!isLoading && totalCalls > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: "#6366F1", flexShrink: 0, display: "block" }} />
                  <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)", letterSpacing: "-0.01em" }}>Calls</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: "#10B981", flexShrink: 0, display: "block" }} />
                  <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)", letterSpacing: "-0.01em" }}>Booked</span>
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 999,
                color: "#065F46",
                background: "#D1FAE5",
                border: "1px solid rgba(16,185,129,0.2)",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}>
                {bookingRate}% booked
              </span>
            </div>
          )}
        </div>

        {/* Chart area */}
        <div style={{ padding: "12px 10px 14px" }}>
          {isLoading ? (
            <div style={{ height: 180, display: "flex", alignItems: "flex-end", gap: 5, padding: "0 10px" }}>
              {[55, 75, 38, 95, 65, 48, 85].map((h, i) => (
                <div key={i} style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end" }}>
                  <div className="skeleton" style={{ flex: 1, height: h * 0.9, borderRadius: "5px 5px 0 0" }} />
                  <div className="skeleton" style={{ flex: 1, height: h * 0.5, borderRadius: "5px 5px 0 0", opacity: 0.5 }} />
                </div>
              ))}
            </div>
          ) : totalCalls === 0 ? (
            <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: isDark ? "rgba(255,255,255,0.04)" : "#F5F5F7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.05)",
              }}>
                <TrendingUp style={{ width: 20, height: 20, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)" }} strokeWidth={1.25} />
              </div>
              <p style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", letterSpacing: "-0.01em" }}>No calls this week yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={days} barCategoryGap="32%" barGap={2} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10.5, fill: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", fontFamily: "Geist, sans-serif" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(Math.ceil(max * 1.25), 4)]}
                  tick={{ fontSize: 10.5, fill: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)", fontFamily: "Geist, sans-serif" }}
                  tickFormatter={(v) => `${v}`}
                  width={22}
                />
                <Tooltip
                  cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(99,102,241,0.04)", radius: 8 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const calls = (payload.find((p) => p.dataKey === "calls")?.value as number) ?? 0
                    const booked = (payload.find((p) => p.dataKey === "appointments")?.value as number) ?? 0
                    return (
                      <div className="chart-tooltip">
                        <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--foreground)", marginBottom: 7, letterSpacing: "-0.01em" }}>{label}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: "#6366F1", flexShrink: 0 }} />
                            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{calls} call{calls !== 1 ? "s" : ""}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: "#10B981", flexShrink: 0 }} />
                            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{booked} booked</span>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="calls" fill="#6366F1" fillOpacity={isDark ? 0.75 : 0.82} radius={[5, 5, 0, 0]} name="Calls" />
                <Bar dataKey="appointments" fill="#10B981" fillOpacity={isDark ? 0.75 : 0.82} radius={[5, 5, 0, 0]} name="Booked" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
    </div>
  )
}

// ─── Today's Schedule ──────────────────────────────────────

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return ""
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `In ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `In ${hrs}h ${rem}m` : `In ${hrs}h`
}

function ScheduleCard({ appointments }: { appointments: Appointment[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  )
  const now = new Date()
  const upcoming = sorted.filter((a) => new Date(a.scheduled_start) >= now)
  const count = upcoming.length

  return (
    <div className="ios-card" style={{ overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
        {/* Card header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: isDark ? "rgba(255,255,255,0.06)" : "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.04)",
            }}>
              <IconCalendar color="#10B981" size={13} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#F2F2F7" : "#0A0A0B", letterSpacing: "-0.02em" }}>
              Coming Up Next
            </span>
            {count > 0 && (
              <span style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                color: "#065F46",
                background: "#D1FAE5",
                border: "1px solid rgba(16,185,129,0.2)",
                letterSpacing: "0.02em",
                lineHeight: "17px",
              }}>
                {count}
              </span>
            )}
          </div>
          <Link
            to="/calls"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11.5,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              textDecoration: "none",
              letterSpacing: "-0.01em",
              transition: "color 0.15s cubic-bezier(0.16,1,0.3,1)",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)")}
          >
            View all <ArrowRight style={{ width: 10, height: 10 }} strokeWidth={1.5} />
          </Link>
        </div>

        {/* Appointment list or empty state */}
        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "36px 20px", gap: 8 }}>
            <IconCalendar color={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.18)"} size={24} />
            <p style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)", letterSpacing: "-0.01em" }}>
              No upcoming appointments
            </p>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            {sorted.slice(0, 5).map((apt, idx) => {
              const isPast = new Date(apt.scheduled_start) < now
              const countdown = timeUntil(apt.scheduled_start)
              const isNext = !isPast && !!countdown && idx === sorted.findIndex(a => new Date(a.scheduled_start) >= now)
              const slot = formatScheduleSlot(apt.scheduled_start)

              return (
                <div
                  key={apt.id}
                  className="row-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 20px",
                    borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                    opacity: isPast ? 0.45 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {/* Time column - prominent */}
                  <div style={{ width: 68, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {slot.day && (
                      <p style={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.2, marginBottom: 1 }}>
                        {slot.day}
                      </p>
                    )}
                    <p style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#F2F2F7" : "#0A0A0B", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                      {slot.time}
                    </p>
                  </div>

                  {/* Status dot */}
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isPast ? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)") : isNext ? "#10B981" : (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.22)"),
                    flexShrink: 0,
                    boxShadow: isNext ? "0 0 0 3px rgba(16,185,129,0.15)" : "none",
                  }} />

                  {/* Name + service */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: isDark ? "#F2F2F7" : "#0A0A0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                      {apt.customer_name}
                    </p>
                    {apt.service_type && (
                      <p style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {apt.service_type}
                      </p>
                    )}
                  </div>

                  {/* Countdown pill or done check */}
                  {isPast ? (
                    <CheckCircle2 style={{ width: 14, height: 14, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", flexShrink: 0 }} strokeWidth={1.5} />
                  ) : countdown ? (
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 999,
                      color: isNext ? "#065F46" : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)"),
                      background: isNext ? "#D1FAE5" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"),
                      border: isNext ? "1px solid rgba(16,185,129,0.2)" : `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      letterSpacing: "0.01em",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {countdown}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
                      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                      flexShrink: 0,
                      letterSpacing: "0.01em",
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
  const summary = buildCallSummary(call)
  const cfg = OUTCOME_CONFIG[call.outcome ?? ""] ?? null

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="row-hover animate-fade-up"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 20px",
        textDecoration: "none",
        borderBottom: "1px solid var(--border)",
        animationDelay: `${delay ?? 0}ms`,
      }}
    >
      {/* Outcome dot - left border color indicator */}
      <div style={{
        width: 4,
        height: 36,
        borderRadius: 2,
        background: cfg?.dot ?? "var(--muted-foreground)",
        flexShrink: 0,
      }} />

      {/* Icon circle */}
      <div style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: cfg?.iconBg ?? "var(--muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <IconPhoneCall color={cfg?.iconColor ?? "var(--muted-foreground)"} size={13} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <p style={{ fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            {summary}
          </p>
          {call.is_repeat_caller && (
            <span style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 999,
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              fontWeight: 600,
              flexShrink: 0,
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}>
              RETURN
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <OutcomeBadge outcome={call.outcome} />
          {call.duration_secs != null && (
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
              {formatDuration(call.duration_secs)}
            </span>
          )}
        </div>
      </div>

      {/* Time */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {timeAgo(call.started_at ?? call.created_at)}
        </span>
        <ArrowRight style={{ width: 11, height: 11, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
      </div>
    </Link>
  )
}

function GhostActivityRow() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 20px",
      borderBottom: "1px solid var(--border)",
      opacity: 0.35,
    }}>
      <div style={{ width: 4, height: 34, borderRadius: 2, background: "var(--muted-foreground)", flexShrink: 0 }} />
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--muted)", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Waiting for first call...</p>
        <div className="skeleton" style={{ height: 10, width: 72, marginTop: 6, borderRadius: 6 }} />
      </div>
      <div className="skeleton" style={{ height: 10, width: 40, flexShrink: 0, borderRadius: 6 }} />
    </div>
  )
}

// ─── Exception Row ────────────────────────────────────────

function ExceptionRow({ call }: { call: Call }) {
  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="row-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        textDecoration: "none",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "#FEF3C7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1px solid rgba(245,158,11,0.2)",
      }}>
        <AlertTriangle style={{ width: 13, height: 13, color: "#D97706" }} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
          {call.caller_phone ?? "Unknown number"}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          {call.status === "transferred" ? "Transferred to owner" : "Call failed - needs review"}
        </p>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", flexShrink: 0 }}>
        {timeAgo(call.started_at ?? call.created_at)}
      </span>
    </Link>
  )
}

// ─── Billing Widget ───────────────────────────────────────
// Usage meter card. Same design language as stat cards.
// Segmented arc-style track shows remaining minutes at a glance.
// No alarmist copy - the visual does the talking.

function BillingWidget() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: getBusinessBilling,
    refetchInterval: 60_000,
  })

  if (isLoading) return (
    <div style={{
      height: 72,
      borderRadius: 22,
      background: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f7",
      border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.05)",
    }} className="skeleton" />
  )
  if (!data) return null

  const secs = data.seconds_remaining
  const mins = Math.floor(Math.abs(secs) / 60)
  const hours = Math.floor(mins / 60)
  const isExhausted = secs <= 0
  const isLow = secs > 0 && secs <= 1800

  const FULL_SECS = 5 * 60 * 60
  const pct = isExhausted ? 0 : Math.min(100, (secs / FULL_SECS) * 100)

  // Semantic colors - confident, not alarming
  const accentColor = isExhausted ? "#E5484D" : isLow ? "#F59E0B" : "#10B981"
  const accentBg = isExhausted
    ? isDark ? "rgba(229,72,77,0.12)" : "#FFF1F2"
    : isLow
    ? isDark ? "rgba(245,158,11,0.12)" : "#FFFBEB"
    : isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5"
  const accentBorder = isExhausted
    ? isDark ? "rgba(229,72,77,0.2)" : "rgba(229,72,77,0.15)"
    : isLow
    ? isDark ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.2)"
    : isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.2)"

  const balanceDisplay = isExhausted
    ? "0 min"
    : hours > 0
    ? `${hours}h ${mins % 60}m`
    : `${mins} min`

  const statusLabel = isExhausted
    ? data.allow_overage ? "Overage active" : "Calls paused"
    : isLow
    ? "Running low"
    : "Available"

  // Segment track: 20 segments, filled = remaining
  const SEGMENTS = 20
  const filledCount = Math.round((pct / 100) * SEGMENTS)

  return (
    <div
      style={{
        padding: 2,
        borderRadius: 22,
        background: isDark ? "rgba(255,255,255,0.04)" : accentBg,
        border: `1px solid ${accentBorder}`,
        boxShadow: isDark
          ? "0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.12)"
          : "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{
        borderRadius: 20,
        padding: "16px 20px",
        background: isDark ? "var(--card)" : "#ffffff",
        boxShadow: isDark
          ? "inset 0 1px 0 rgba(255,255,255,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.9)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        {/* Icon badge */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: isDark ? "rgba(255,255,255,0.06)" : accentBg,
          border: `1px solid ${accentBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <IconZap color={accentColor} size={15} />
        </div>

        {/* Label + status */}
        <div style={{ flexShrink: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.36)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>
            Call Minutes
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: isDark ? "#F2F2F7" : "#0A0A0B", fontFamily: "Geist Mono, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {balanceDisplay}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              color: accentColor,
              background: isDark ? "rgba(255,255,255,0.06)" : accentBg,
              border: `1px solid ${accentBorder}`,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
            }}>
              {statusLabel}
            </span>
            {data.allow_overage && !isExhausted && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, color: "var(--muted-foreground)", background: "var(--muted)", border: "1px solid var(--border)", letterSpacing: "0.03em" }}>
                OVERAGE
              </span>
            )}
          </div>
        </div>

        {/* Segmented track - the visual story */}
        <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const filled = i < filledCount
            const isLast = i === filledCount - 1
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: filled
                    ? accentColor
                    : isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
                  opacity: filled ? (isLast ? 0.6 : 1) : 0.5,
                  transition: "background 0.3s ease",
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Live Status Bar ──────────────────────────────────────

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 20px" }}>
        <XCircle style={{ width: 14, height: 14, color: "#E5484D", flexShrink: 0 }} strokeWidth={1.5} />
        <span style={{ fontSize: 12, color: "#E5484D", letterSpacing: "-0.01em" }}>Orvia is not configured - check settings</span>
      </div>
    )
  }

  if (liveCall) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 20px" }}>
        <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--foreground)", flexShrink: 0, display: "block" }} />
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500, letterSpacing: "-0.01em" }}>
          Call in progress - AI is handling it
          {elapsed && <span style={{ color: "var(--muted-foreground)", marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{elapsed}</span>}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 20px" }}>
      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0, display: "block" }} />
      <span style={{ fontSize: 12, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>Orvia is live and ready for calls</span>
    </div>
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

  const weeklyQuery = useQuery({
    queryKey: ["weekly-stats"],
    queryFn: getWeeklyCallStats,
  })

  const weeklyDays = weeklyQuery.data ?? []
  const callSparkData = weeklyDays.map((d) => d.calls)
  const apptSparkData = weeklyDays.map((d) => d.appointments)
  const leadSparkData = weeklyDays.map((d) => d.leads)

  if (briefing.isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div className="skeleton" style={{ height: 30, width: 260, marginBottom: 10, borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 13, width: 180, opacity: 0.6, borderRadius: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="skeleton" style={{ height: 34, width: 110, borderRadius: 999 }} />
            <div className="skeleton" style={{ width: 34, height: 34, borderRadius: "50%" }} />
          </div>
        </div>
        <div className="overview-stat-grid">
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <div className="ios-card" style={{ height: 260 }} />
        <div className="overview-bottom-grid">
          <div className="ios-card" style={{ height: 240 }} />
          <div className="ios-card" style={{ height: 240 }} />
        </div>
        <div className="ios-card" style={{ height: 320 }} />
      </div>
    )
  }

  if (briefing.isError) return (
    <div style={{ padding: "96px 0", textAlign: "center" }}>
      <XCircle style={{ width: 32, height: 32, color: "#E5484D", margin: "0 auto 12px" }} strokeWidth={1.5} />
      <p style={{ fontSize: 14, color: "var(--foreground)", fontWeight: 500, letterSpacing: "-0.01em" }}>Something went wrong loading your dashboard.</p>
      <button
        onClick={() => briefing.refetch()}
        style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
      >
        Try again
      </button>
    </div>
  )

  const d = briefing.data
  const calls = d?.callsToday ?? 0
  const appointments = d?.appointmentsToday ?? 0
  const leads = d?.leadsToday ?? 0
  const avgCallSecs = d?.avgCallSecs ?? null
  const upcomingAppointments = d?.upcomingAppointments ?? []
  const exceptions = d?.exceptionCalls ?? []
  const recentCalls = d?.recentCalls ?? []
  const clinicActive = d?.businessStatus === "active" && d?.businessHasPhone

  const avgCallDisplay = avgCallSecs != null ? formatDuration(avgCallSecs) : "--"
  const greeting = getGreeting(profile.fullName)

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const statusLine = calls === 0
    ? "Orvia is handling calls for you."
    : [
        `${calls} call${calls !== 1 ? "s" : ""} handled`,
        appointments > 0 && `${appointments} booked`,
        leads > 0 && `${leads} lead${leads !== 1 ? "s" : ""}`,
      ].filter(Boolean).join(" · ")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{`
        .overview-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          align-items: stretch;
        }
        .overview-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 14px;
        }
        @media (max-width: 700px) {
          .overview-stat-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          .overview-bottom-grid {
            grid-template-columns: 1fr;
          }
          .overview-header-status {
            display: none !important;
          }
          .overview-header h1 {
            font-size: 22px !important;
          }
        }
        @media (max-width: 400px) {
          .overview-stat-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
        }
        @media (max-width: 700px) {
          .stat-card-value {
            font-size: 32px !important;
          }
          .stat-card-inner {
            padding: 16px 16px 14px !important;
          }
          .stat-card-root {
            min-height: 130px !important;
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="overview-header animate-fade-up animate-fade-up-1"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}
      >
        <div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.6px",
            color: "var(--foreground)",
            marginBottom: 6,
            lineHeight: 1.2,
            fontFamily: "Geist, sans-serif",
          }}>
            {greeting}
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
            {todayStr}
            <span style={{ margin: "0 8px", color: "var(--muted-foreground)", opacity: 0.5 }}>&middot;</span>
            <span style={{ color: "var(--muted-foreground)" }}>{statusLine}</span>
          </p>
        </div>

        {/* Status pill - real data */}
        <div className="overview-header-status" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "var(--card)",
            border: `1px solid ${clinicActive ? "rgba(16,185,129,0.2)" : "rgba(229,72,77,0.15)"}`,
            padding: "7px 14px",
            borderRadius: 999,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {clinicActive ? (
              <>
                <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0, display: "block" }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--foreground)", opacity: 0.6, letterSpacing: "-0.01em" }}>AI Agent</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#065F46", letterSpacing: "-0.01em" }}>Live</span>
              </>
            ) : (
              <>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E5484D", flexShrink: 0, display: "block" }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--foreground)", opacity: 0.6, letterSpacing: "-0.01em" }}>AI Agent</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#E5484D", letterSpacing: "-0.01em" }}>Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Section: Today at a glance ─────────────────────── */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, opacity: 0.6 }}>
          Today at a glance
        </p>
        <div className="overview-stat-grid">
          <StatCard
            value={calls}
            label="Calls Handled"
            sublabel={calls === 1 ? "call answered today" : "calls answered today"}
            icon={IconPhoneCall}
            iconColor="#6366F1"
            cardBg="#EEF2FF"
            sparkData={callSparkData}
            sparkColor="#6366F1"
            gradientId="spark-calls"
          />
          <StatCard
            value={appointments}
            label="Appointments"
            sublabel="booked today"
            icon={IconCalendar}
            iconColor="#10B981"
            cardBg="#ECFDF5"
            sparkData={apptSparkData}
            sparkColor="#10B981"
            gradientId="spark-appts"
          />
          <StatCard
            value={leads}
            label="Leads Captured"
            sublabel="new leads today"
            icon={IconUsers}
            iconColor="#D97706"
            cardBg="#FFFBEB"
            sparkData={leadSparkData}
            sparkColor="#F59E0B"
            gradientId="spark-leads"
          />
          <StatCard
            value={avgCallDisplay}
            label="Avg Call Length"
            sublabel="per call today"
            icon={IconClock}
            iconColor="#E5484D"
            cardBg="#FFF1F2"
          />
        </div>
      </div>

      {/* Billing - inline quiet strip or alert card */}
      <BillingWidget />

      {/* ── Section: Needs Attention ───────────────────────── */}
      {exceptions.length > 0 && (
        <div
          className="ios-card animate-fade-up"
          style={{ padding: 0, overflow: "hidden", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "13px 20px",
            borderBottom: "1px solid rgba(245,158,11,0.15)",
            background: "linear-gradient(135deg, #FFFBEB 0%, #FEF9EC 100%)",
          }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "#D97706" }} strokeWidth={1.75} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Needs Review</span>
            <span style={{
              fontSize: 10.5,
              color: "#FFFFFF",
              background: "#F59E0B",
              padding: "2px 8px",
              borderRadius: 999,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}>
              {exceptions.length}
            </span>
          </div>
          {exceptions.map((call) => <ExceptionRow key={call.id} call={call} />)}
        </div>
      )}

      {/* ── Section: Schedule + Performance ───────────────── */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, opacity: 0.6 }}>
          Schedule &amp; Performance
        </p>
        <div className="overview-bottom-grid" style={{ alignItems: "stretch" }}>
          <ScheduleCard appointments={upcomingAppointments} />
          <WeeklyChart />
        </div>
      </div>

      {/* ── Section: Recent Call Activity ─────────────────── */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, opacity: 0.6 }}>
          Recent Call Activity
        </p>
        <SectionCard
          title="Latest Calls"
          icon={Phone}
          action={
            recentCalls.length > 0 ? (
              <Link
                to="/calls"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--muted-foreground)",
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                  opacity: 0.7,
                  transition: "opacity 0.15s ease",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.7")}
              >
                See all calls <ArrowRight style={{ width: 11, height: 11 }} strokeWidth={1.5} />
              </Link>
            ) : undefined
          }
        >
          {recentCalls.length === 0 ? (
            <>
              <GhostActivityRow />
              <GhostActivityRow />
              <GhostActivityRow />
            </>
          ) : (
            recentCalls.map((call, i) => <ActivityRow key={call.id} call={call} delay={i * 40} />)
          )}
        </SectionCard>
      </div>

      {/* Live status footer */}
      <LiveStatusBar clinicActive={!!clinicActive} />
    </div>
  )
}
