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

// ─── Needs Action Panel ───────────────────────────────────
// Shows unresolved operational events (ai_failure, partial_booking)
// and pending callback queue items at the top of the dashboard.

const EVENT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ai_failure:       { label: "AI Failed",       color: "#991B1B", bg: "#FEE2E2", border: "rgba(229,72,77,0.2)" },
  partial_booking:  { label: "Partial Booking", color: "#92400E", bg: "#FEF3C7", border: "rgba(245,158,11,0.2)" },
  concurrent_call:  { label: "Concurrent Call", color: "#1E40AF", bg: "#DBEAFE", border: "rgba(59,130,246,0.2)" },
  transfer_unknown: { label: "Transfer ?",      color: "#92400E", bg: "#FEF3C7", border: "rgba(245,158,11,0.2)" },
}

function OperationalEventItem({ event, onResolve }: {
  event: OperationalEvent
  onResolve: (id: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.ai_failure
  const p = event.payload ?? {}
  const phone = (p.caller_phone as string) ?? null
  const reason = (p.ended_reason as string) ?? null
  const callId = event.call_id

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "11px 20px",
      borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
    }}>
      {/* Type badge */}
      <span style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
        letterSpacing: "0.01em",
      }}>
        {cfg.label}
      </span>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
          {phone ?? "Unknown caller"}
          {reason && <span style={{ color: "var(--muted-foreground)", marginLeft: 6, fontSize: 11.5 }}>{reason.replace(/-/g, " ")}</span>}
        </p>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
          {timeAgo(event.created_at)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {callId && (
          <Link
            to="/calls/$id"
            params={{ id: callId }}
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--muted-foreground)",
              textDecoration: "none",
              padding: "4px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              letterSpacing: "-0.01em",
              transition: "opacity 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            View call
          </Link>
        )}
        <button
          type="button"
          onClick={() => onResolve(event.id)}
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--muted-foreground)",
            cursor: "pointer",
            padding: "4px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card)",
            letterSpacing: "-0.01em",
            transition: "opacity 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function CallbackQueueItem({ item, onHandled }: {
  item: CallQueueItem
  onHandled: (id: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const isPartial = item.queue_type === "partial_booking"

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "11px 20px",
      borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
    }}>
      {/* Phone icon circle */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: isPartial
          ? isDark ? "rgba(245,158,11,0.1)" : "#FEF3C7"
          : isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: isPartial ? "1px solid rgba(245,158,11,0.2)" : "1px solid var(--border)",
      }}>
        <IconPhone
          color={isPartial ? "#D97706" : "var(--muted-foreground)"}
          size={13}
        />
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
          {item.caller_name ?? item.caller_phone ?? "Unknown caller"}
          {item.queue_type === "partial_booking" && (
            <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "2px 7px", borderRadius: 999, border: "1px solid rgba(245,158,11,0.2)" }}>
              Partial booking
            </span>
          )}
        </p>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
          {item.caller_phone && item.caller_name ? item.caller_phone + " · " : ""}
          {item.service_needed ? item.service_needed + " · " : ""}
          {timeAgo(item.created_at)}
        </p>
      </div>

      {/* Mark handled */}
      <button
        type="button"
        onClick={() => onHandled(item.id)}
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--muted-foreground)",
          cursor: "pointer",
          padding: "4px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--card)",
          letterSpacing: "-0.01em",
          transition: "opacity 0.15s",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Mark handled
      </button>
    </div>
  )
}

function NeedsActionPanel() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
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

  // Realtime subscriptions
  useEffect(() => {
    const eventsChannel = supabase
      .channel("operational_events_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "operational_events" }, () => {
        refetchEvents()
      })
      .subscribe()

    const queueChannel = supabase
      .channel("call_queue_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_queue" }, () => {
        refetchQueue()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(queueChannel)
    }
  }, [refetchEvents, refetchQueue])

  async function handleResolveEvent(id: string) {
    await resolveOperationalEvent(id)
    queryClient.setQueryData<OperationalEvent[]>(["operational-events"], (prev) =>
      (prev ?? []).filter((e) => e.id !== id)
    )
  }

  async function handleQueueHandled(id: string) {
    await markQueueItemHandled(id)
    queryClient.setQueryData<CallQueueItem[]>(["call-queue"], (prev) =>
      (prev ?? []).filter((q) => q.id !== id)
    )
  }

  // Only render the panel if there is something actionable
  const hasEvents = events.filter(e => e.event_type !== "concurrent_call").length > 0
  const hasQueue = queue.length > 0

  if (!hasEvents && !hasQueue) return null

  const actionCount = events.filter(e => e.event_type !== "concurrent_call").length + queue.length

  return (
    <div
      className="ios-card animate-fade-up"
      style={{
        padding: 0,
        overflow: "hidden",
        border: `1px solid ${isDark ? "rgba(229,72,77,0.2)" : "rgba(229,72,77,0.18)"}`,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "13px 20px",
        borderBottom: `1px solid ${isDark ? "rgba(229,72,77,0.12)" : "rgba(229,72,77,0.1)"}`,
        background: isDark
          ? "rgba(229,72,77,0.06)"
          : "linear-gradient(135deg, #FFF1F2 0%, #FFF5F5 100%)",
      }}>
        <AlertTriangle style={{ width: 14, height: 14, color: "#E5484D" }} strokeWidth={1.75} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          Needs Action
        </span>
        <span style={{
          fontSize: 10.5,
          color: "#FFFFFF",
          background: "#E5484D",
          padding: "2px 8px",
          borderRadius: 999,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}>
          {actionCount}
        </span>
      </div>

      {/* Operational events (ai_failure, partial_booking) - not concurrent_call which is just info */}
      {events
        .filter(e => e.event_type !== "concurrent_call")
        .map((event) => (
          <OperationalEventItem key={event.id} event={event} onResolve={handleResolveEvent} />
        ))
      }

      {/* Callback queue */}
      {queue.map((item) => (
        <CallbackQueueItem key={item.id} item={item} onHandled={handleQueueHandled} />
      ))}
    </div>
  )
}

// ─── Mock data (dev only) ─────────────────────────────────

const MOCK_EVENTS: OperationalEvent[] = [
  {
    id: "mock-1",
    business_id: "mock",
    call_id: null,
    event_type: "ai_failure",
    severity: "warning",
    resolved: false,
    payload: { caller_phone: "+1 (512) 555-0192", ended_reason: "silence-timed-out" },
    created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
  },
  {
    id: "mock-2",
    business_id: "mock",
    call_id: null,
    event_type: "partial_booking",
    severity: "warning",
    resolved: false,
    payload: { caller_phone: "+1 (737) 555-0847", service_needed: "Pipe repair" },
    created_at: new Date(Date.now() - 23 * 60_000).toISOString(),
  },
]

const MOCK_QUEUE: CallQueueItem[] = [
  {
    id: "mock-q-1",
    business_id: "mock",
    call_id: null,
    queue_type: "missed_callback",
    priority: 5,
    caller_phone: "+1 (210) 555-0374",
    caller_name: "Marcus Webb",
    service_needed: "Water heater install",
    status: "pending",
    handled_by: null,
    handled_at: null,
    created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
]

// ─── Page ─────────────────────────────────────────────────

export default function OverviewPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [mockActive, setMockActive] = useState(false)

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
  // Live = DB status active + phone provisioned + credits available (or overage enabled)
  const clinicActive = d?.businessStatus === "active" && d?.businessHasPhone && (d?.hasCredits ?? false)

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

        {/* Dev mock toggle + status pill */}
        <div className="overview-header-status" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {import.meta.env.DEV && (
            <button
              onClick={toggleMock}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${mockActive ? "rgba(229,72,77,0.3)" : "var(--border)"}`,
                background: mockActive ? "rgba(229,72,77,0.08)" : "var(--card)",
                color: mockActive ? "#E5484D" : "var(--muted-foreground)",
                cursor: "pointer",
                letterSpacing: "0.02em",
                transition: "all 0.15s",
              }}
            >
              {mockActive ? "Clear mock" : "Mock alerts"}
            </button>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--card)",
            border: `1px solid ${clinicActive ? "rgba(16,185,129,0.2)" : "rgba(229,72,77,0.15)"}`,
            padding: "6px 12px",
            borderRadius: 999,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            {clinicActive
              ? <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0, display: "block" }} />
              : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E5484D", flexShrink: 0, display: "block" }} />
            }
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>AI Agent</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: clinicActive ? "#065F46" : "#E5484D", letterSpacing: "-0.01em" }}>
              {clinicActive ? "Live" : "Paused"}
            </span>
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

      {/* ── Section: Needs Action (operational events + callback queue) ── */}
      <NeedsActionPanel />

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
