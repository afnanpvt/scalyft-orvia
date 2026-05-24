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
  LineChart,
  Line,
} from "recharts"
import {
  Phone,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  PhoneCall,
  CalendarDays,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react"

import {
  getBriefing,
  getLiveCallStatus,
  getWeeklyCallStats,
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

// ─── Card Illustrations ───────────────────────────────────
// Large 3D-style geometric shapes for the right half of each stat card

function IllustrationCalls() {
  // Rounded phone-wave hex shapes, indigo/violet tones
  return (
    <svg width="140" height="130" viewBox="0 0 140 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Back hex - softer */}
      <path d="M95 20 L122 36 L122 68 L95 84 L68 68 L68 36 Z" fill="url(#callsGrad1)" opacity="0.55" />
      {/* Front hex - main */}
      <path d="M75 34 L100 48 L100 76 L75 90 L50 76 L50 48 Z" fill="url(#callsGrad2)" />
      {/* Inner circle glow */}
      <circle cx="75" cy="62" r="16" fill="white" opacity="0.18" />
      {/* Small accent orb floating top-right */}
      <circle cx="116" cy="22" r="10" fill="#818CF8" opacity="0.5" />
      <circle cx="116" cy="22" r="6" fill="#A5B4FC" opacity="0.7" />
      <defs>
        <linearGradient id="callsGrad1" x1="68" y1="20" x2="122" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A5B4FC" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="callsGrad2" x1="50" y1="34" x2="100" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C7D2FE" />
          <stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function IllustrationAppointments() {
  // Stacked circles / orbs, emerald tones
  return (
    <svg width="140" height="130" viewBox="0 0 140 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Large back circle */}
      <circle cx="90" cy="55" r="46" fill="url(#apptGrad1)" opacity="0.4" />
      {/* Mid circle */}
      <circle cx="85" cy="60" r="34" fill="url(#apptGrad2)" opacity="0.65" />
      {/* Front circle */}
      <circle cx="80" cy="65" r="22" fill="url(#apptGrad3)" />
      {/* Inner shine */}
      <circle cx="74" cy="57" r="8" fill="white" opacity="0.25" />
      {/* Small satellite */}
      <circle cx="118" cy="28" r="9" fill="#6EE7B7" opacity="0.6" />
      <defs>
        <linearGradient id="apptGrad1" x1="44" y1="9" x2="136" y2="101" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6EE7B7" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="apptGrad2" x1="51" y1="26" x2="119" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A7F3D0" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
        <linearGradient id="apptGrad3" x1="58" y1="43" x2="102" y2="87" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D1FAE5" />
          <stop offset="1" stopColor="#6EE7B7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function IllustrationLeads() {
  // Layered rounded-square blocks / stepping stones, amber tones
  return (
    <svg width="140" height="130" viewBox="0 0 140 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Back block */}
      <rect x="62" y="14" width="64" height="64" rx="16" fill="url(#leadsGrad1)" opacity="0.45" />
      {/* Mid block */}
      <rect x="52" y="28" width="58" height="58" rx="14" fill="url(#leadsGrad2)" opacity="0.7" />
      {/* Front block */}
      <rect x="42" y="42" width="52" height="52" rx="12" fill="url(#leadsGrad3)" />
      {/* Shine */}
      <rect x="50" y="50" width="20" height="10" rx="5" fill="white" opacity="0.22" />
      {/* Accent dot */}
      <circle cx="118" cy="20" r="8" fill="#FCD34D" opacity="0.7" />
      <defs>
        <linearGradient id="leadsGrad1" x1="62" y1="14" x2="126" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="leadsGrad2" x1="52" y1="28" x2="110" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEF3C7" />
          <stop offset="1" stopColor="#FCD34D" />
        </linearGradient>
        <linearGradient id="leadsGrad3" x1="42" y1="42" x2="94" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEF9EE" />
          <stop offset="1" stopColor="#FDE68A" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function IllustrationAvgTime() {
  // Spiral / arc rings, red/rose tones
  return (
    <svg width="140" height="130" viewBox="0 0 140 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer ring */}
      <circle cx="85" cy="65" r="48" stroke="url(#timeGrad1)" strokeWidth="18" fill="none" opacity="0.35" />
      {/* Mid ring */}
      <circle cx="85" cy="65" r="33" stroke="url(#timeGrad2)" strokeWidth="14" fill="none" opacity="0.55" />
      {/* Inner filled circle */}
      <circle cx="85" cy="65" r="18" fill="url(#timeGrad3)" />
      {/* Inner shine */}
      <circle cx="79" cy="58" r="6" fill="white" opacity="0.28" />
      {/* Satellite orb */}
      <circle cx="122" cy="24" r="9" fill="#FCA5A5" opacity="0.65" />
      <defs>
        <linearGradient id="timeGrad1" x1="37" y1="17" x2="133" y2="113" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FECACA" />
          <stop offset="1" stopColor="#F87171" />
        </linearGradient>
        <linearGradient id="timeGrad2" x1="52" y1="32" x2="118" y2="98" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEE2E2" />
          <stop offset="1" stopColor="#FCA5A5" />
        </linearGradient>
        <linearGradient id="timeGrad3" x1="67" y1="47" x2="103" y2="83" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEE2E2" />
          <stop offset="1" stopColor="#F87171" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ─── Sparkline ────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null
  const pts = data.map((v, i) => ({ v, i }))
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={pts} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Stat Card ────────────────────────────────────────────

function StatCard({ value, label, sublabel, icon: Icon, iconColor, cardBg, sparkData, sparkColor, trend, illustration }: {
  value: number | string
  label: string
  sublabel?: string
  icon: React.ElementType
  iconColor: string
  cardBg: string
  sparkData?: number[]
  sparkColor?: string
  trend?: { value: string; up: boolean }
  illustration?: React.ReactNode
}) {
  const { resolvedTheme } = useTheme()
  const bg = resolvedTheme === "dark" ? "var(--card)" : cardBg
  return (
    <div
      className="ios-card-interactive animate-fade-up"
      style={{
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: bg,
        border: resolvedTheme === "dark" ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)",
        minHeight: 160,
      }}
    >
      {/* Left: text content */}
      <div style={{ padding: "22px 22px 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        <div>
          {/* Icon badge */}
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: resolvedTheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            border: resolvedTheme === "dark" ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.7)",
          }}>
            <Icon style={{ width: 15, height: 15, color: iconColor }} strokeWidth={2} />
          </div>

          {/* Label */}
          <p style={{ fontSize: 11.5, fontWeight: 500, color: resolvedTheme === "dark" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", marginBottom: 4, letterSpacing: "0.02em", textTransform: "uppercase" }}>{label}</p>

          {/* Value */}
          <p style={{
            fontSize: 40,
            fontWeight: 700,
            color: resolvedTheme === "dark" ? "#F2F2F7" : "#0A0A0B",
            lineHeight: 1,
            marginBottom: sublabel ? 5 : 0,
            fontFamily: value === "--" ? "Geist, sans-serif" : "Geist Mono, monospace",
            fontVariantNumeric: value === "--" ? "normal" : "tabular-nums",
            letterSpacing: value === "--" ? "0em" : "-0.04em",
            wordSpacing: 0,
          }}>
            {value === "--" ? (
              <span style={{ display: "inline-block", width: 28, height: 3, background: "currentColor", borderRadius: 2, opacity: 0.3, verticalAlign: "middle", marginBottom: 4 }} />
            ) : value}
          </p>

          {sublabel && (
            <p style={{ fontSize: 11.5, color: resolvedTheme === "dark" ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)", marginTop: 4 }}>{sublabel}</p>
          )}
        </div>

        {/* Trend badge */}
        {trend && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 11,
            fontWeight: 600,
            color: trend.up ? "#065F46" : "#991B1B",
            background: "rgba(255,255,255,0.6)",
            padding: "3px 9px",
            borderRadius: 999,
            border: `1px solid ${trend.up ? "rgba(16,185,129,0.25)" : "rgba(229,72,77,0.25)"}`,
            letterSpacing: "0.01em",
            width: "fit-content",
            marginTop: 10,
          }}>
            {trend.up ? "+" : ""}{trend.value}
          </div>
        )}

        {/* Sparkline at bottom - only if there's real data */}
        {sparkData && sparkData.length > 1 && sparkData.some(v => v > 0) && (
          <div className="spark-enter" style={{ marginTop: 12, marginLeft: -4 }}>
            <Sparkline data={sparkData} color={sparkColor ?? iconColor} />
          </div>
        )}
      </div>

      {/* Right: illustration - half-hidden off the right edge */}
      {illustration && (
        <div style={{
          position: "absolute",
          right: -50,
          bottom: -20,
          pointerEvents: "none",
          opacity: 0.7,
        }}>
          {illustration}
        </div>
      )}
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
  const { data: raw, isLoading } = useQuery({
    queryKey: ["weekly-stats"],
    queryFn: getWeeklyCallStats,
  })

  const days: WeekDay[] = raw ?? []
  const totalCalls = days.reduce((s, d) => s + d.calls, 0)
  const totalBooked = days.reduce((s, d) => s + d.appointments, 0)

  const subtitle = isLoading
    ? undefined
    : totalCalls === 0
    ? "No calls yet"
    : `${totalCalls} calls · ${totalBooked} booked`

  return (
    <SectionCard
      title="This Week"
      icon={TrendingUp}
      subtitle={subtitle}
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#6366F1", flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>Calls</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#10B981", flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>Appointments</span>
          </div>
        </div>
      }
    >
      <div style={{ padding: "16px 12px 14px" }}>
        {isLoading ? (
          <div style={{ height: 200, display: "flex", alignItems: "flex-end", gap: 6, padding: "0 12px" }}>
            {[60, 80, 40, 100, 70, 50, 90].map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", gap: 3, alignItems: "flex-end" }}>
                <div className="skeleton" style={{ flex: 1, height: h * 0.9, borderRadius: "4px 4px 0 0" }} />
                <div className="skeleton" style={{ flex: 1, height: h * 0.55, borderRadius: "4px 4px 0 0", opacity: 0.6 }} />
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={days} barCategoryGap="32%" barGap={3} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Geist, sans-serif" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Geist, sans-serif" }}
                width={26}
              />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.04)", radius: 6 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const calls = (payload.find((p) => p.dataKey === "calls")?.value as number) ?? 0
                  const booked = (payload.find((p) => p.dataKey === "appointments")?.value as number) ?? 0
                  return (
                    <div className="chart-tooltip">
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</p>
                      <p style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{calls} calls · {booked} booked</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="calls" fill="#6366F1" fillOpacity={0.9} radius={[5, 5, 0, 0]} />
              <Bar dataKey="appointments" fill="#10B981" fillOpacity={0.9} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
  )
}

// ─── Today's Schedule ──────────────────────────────────────

const PLACEHOLDER_SLOTS = [
  { time: "9:00 AM" },
  { time: "11:00 AM" },
  { time: "2:00 PM" },
]

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return ""
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `In ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `In ${hrs}h ${rem}m` : `In ${hrs}h`
}

function ScheduleTimeline({ appointments }: { appointments: Appointment[] }) {
  if (appointments.length === 0) {
    return (
      <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <CalendarDays style={{ width: 28, height: 28, color: "var(--muted-foreground)" }} strokeWidth={1.25} />
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", textAlign: "center" }}>Nothing on the schedule</p>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", textAlign: "center", maxWidth: 200, lineHeight: 1.5, opacity: 0.6 }}>
          Appointments Orvia books will show up here.
        </p>
      </div>
    )
  }

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  )
  const now = new Date()

  return (
    <>
      {sorted.map((apt) => {
        const isPast = new Date(apt.scheduled_start) < now
        const countdown = timeUntil(apt.scheduled_start)
        const isNext = !isPast && !!countdown

        const pillLabel = isPast ? "Done" : countdown || "Upcoming"
        const pillBg = isPast ? "var(--muted)" : isNext ? "#D1FAE5" : "var(--muted)"
        const pillColor = isPast ? "var(--muted-foreground)" : isNext ? "#065F46" : "var(--muted-foreground)"
        const pillBorder = isPast ? "var(--border)" : isNext ? "rgba(16,185,129,0.2)" : "var(--border)"

        return (
          <div
            key={apt.id}
            className="row-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              opacity: isPast ? 0.5 : 1,
            }}
          >
            {(() => {
              const slot = formatScheduleSlot(apt.scheduled_start)
              return (
                <div style={{ width: 78, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {slot.day && (
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {slot.day}
                    </p>
                  )}
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>
                    {slot.time}
                  </p>
                </div>
              )
            })()}
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: isPast ? "var(--muted)" : "#D1FAE5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {isPast
                ? <CheckCircle2 style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
                : <CalendarDays style={{ width: 12, height: 12, color: "#10B981" }} strokeWidth={1.5} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                {apt.patient_name}
              </p>
              {apt.service_type && (
                <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {apt.service_type}
                </p>
              )}
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 999,
              color: pillColor,
              background: pillBg,
              border: `1px solid ${pillBorder}`,
              flexShrink: 0,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
            }}>
              {pillLabel}
            </span>
          </div>
        )
      })}
    </>
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
        <PhoneCall style={{ width: 13, height: 13, color: cfg?.iconColor ?? "var(--muted-foreground)" }} strokeWidth={1.75} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <div className="ios-card" style={{ height: 260 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14 }}>
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
  const clinicActive = d?.clinicStatus === "active" && d?.clinicHasPhone

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

      {/* Header */}
      <div
        className="animate-fade-up animate-fade-up-1"
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, alignItems: "stretch" }}>
        <div className="animate-fade-up animate-fade-up-2" style={{ display: "flex", flexDirection: "column" }}>
          <StatCard
            value={calls}
            label="Calls Handled"
            sublabel="Today"
            icon={PhoneCall}
            iconColor="#6366F1"
            cardBg="#EEF2FF"
            sparkData={callSparkData}
            sparkColor="#6366F1"
            illustration={<IllustrationCalls />}
          />
        </div>
        <div className="animate-fade-up animate-fade-up-3" style={{ display: "flex", flexDirection: "column" }}>
          <StatCard
            value={appointments}
            label="Appointments"
            sublabel="Booked today"
            icon={CalendarDays}
            iconColor="#10B981"
            cardBg="#ECFDF5"
            sparkData={apptSparkData}
            sparkColor="#10B981"
            illustration={<IllustrationAppointments />}
          />
        </div>
        <div className="animate-fade-up animate-fade-up-4" style={{ display: "flex", flexDirection: "column" }}>
          <StatCard
            value={leads}
            label="Leads Captured"
            sublabel="Today"
            icon={Users}
            iconColor="#D97706"
            cardBg="#FFFBEB"
            sparkData={leadSparkData}
            sparkColor="#F59E0B"
            illustration={<IllustrationLeads />}
          />
        </div>
        <div className="animate-fade-up animate-fade-up-5" style={{ display: "flex", flexDirection: "column" }}>
          <StatCard
            value={avgCallDisplay}
            label="Avg Call Time"
            sublabel="Today"
            icon={Clock}
            iconColor="#E5484D"
            cardBg="#FFF1F2"
            illustration={<IllustrationAvgTime />}
          />
        </div>
      </div>

      {/* Exceptions */}
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

      {/* Schedule + Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14 }}>
        <SectionCard
          title="Coming Up Next"
          icon={CalendarDays}
          count={upcomingAppointments.length > 0 ? upcomingAppointments.length : undefined}
          action={
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
              View all <ArrowRight style={{ width: 11, height: 11 }} strokeWidth={1.5} />
            </Link>
          }
        >
          <ScheduleTimeline appointments={upcomingAppointments} />
        </SectionCard>

        <WeeklyChart />
      </div>

      {/* Recent calls */}
      <SectionCard
        title="Recent Calls"
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
              View all <ArrowRight style={{ width: 11, height: 11 }} strokeWidth={1.5} />
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

      {/* Live status footer */}
      <LiveStatusBar clinicActive={!!clinicActive} />
    </div>
  )
}
