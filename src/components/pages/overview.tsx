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
  Zap,
} from "lucide-react"

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

// ─── Mini Sparkbar (replaces noisy SVG illustrations) ────────
// Shows a 7-bar mini chart using the card's accent color - clean, data-first

function MiniSparkbar({ data, color }: { data: number[]; color: string }) {
  if (!data.length || !data.some(v => v > 0)) return null
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 32 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: "3px 3px 0 0",
            background: color,
            height: `${Math.max(4, Math.round((v / max) * 100))}%`,
            opacity: v === 0 ? 0.15 : 0.9,
            transition: "height 0.4s ease",
          }}
        />
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────

function StatCard({ value, label, sublabel, icon: Icon, iconColor, cardBg, sparkData, sparkColor }: {
  value: number | string
  label: string
  sublabel?: string
  icon: React.ElementType
  iconColor: string
  cardBg: string
  sparkData?: number[]
  sparkColor?: string
}) {
  const { resolvedTheme } = useTheme()
  const bg = resolvedTheme === "dark" ? "var(--card)" : cardBg
  const hasSpark = sparkData && sparkData.length > 1 && sparkData.some(v => v > 0)

  return (
    <div
      className="ios-card-interactive stat-card-root"
      style={{
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: bg,
        border: resolvedTheme === "dark" ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.05)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
        minHeight: 148,
      }}
    >
      <div className="stat-card-inner" style={{ padding: "18px 18px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Top row: icon + label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: resolvedTheme === "dark" ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: resolvedTheme === "dark" ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.8)",
            flexShrink: 0,
          }}>
            <Icon style={{ width: 14, height: 14, color: iconColor }} strokeWidth={2} />
          </div>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            color: resolvedTheme === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>
            {label}
          </p>
        </div>

        {/* Value */}
        <div>
          <p className="stat-card-value" style={{
            fontSize: 38,
            fontWeight: 700,
            color: resolvedTheme === "dark" ? "#F2F2F7" : "#0A0A0B",
            lineHeight: 1,
            fontFamily: value === "--" ? "Geist, sans-serif" : "Geist Mono, monospace",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
          }}>
            {value === "--" ? (
              <span style={{ display: "inline-block", width: 24, height: 3, background: "currentColor", borderRadius: 2, opacity: 0.25, verticalAlign: "middle" }} />
            ) : value}
          </p>
          {sublabel && (
            <p style={{ fontSize: 11, color: resolvedTheme === "dark" ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)", marginTop: 3, letterSpacing: "-0.01em" }}>
              {sublabel}
            </p>
          )}
        </div>

        {/* Mini sparkbar at bottom */}
        {hasSpark && (
          <MiniSparkbar data={sparkData!} color={sparkColor ?? iconColor} />
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
        ) : totalCalls === 0 ? (
          <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <TrendingUp style={{ width: 28, height: 28, color: "var(--muted-foreground)", opacity: 0.3 }} strokeWidth={1.25} />
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", opacity: 0.5 }}>No calls this week yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={days} barCategoryGap="30%" barGap={3} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Geist, sans-serif" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, (max: number) => Math.max(Math.ceil(max * 1.2), 3)]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Geist, sans-serif" }}
                tickFormatter={(v) => `${v}`}
                width={24}
                label={{
                  value: "Count",
                  angle: -90,
                  position: "insideLeft",
                  offset: 14,
                  style: { fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.5 },
                }}
              />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.05)", radius: 6 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const calls = (payload.find((p) => p.dataKey === "calls")?.value as number) ?? 0
                  const booked = (payload.find((p) => p.dataKey === "appointments")?.value as number) ?? 0
                  return (
                    <div className="chart-tooltip">
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#6366F1", flexShrink: 0 }} />
                          <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{calls} call{calls !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#10B981", flexShrink: 0 }} />
                          <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{booked} appointment{booked !== 1 ? "s" : ""} booked</span>
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="calls" fill="#6366F1" fillOpacity={0.85} radius={[4, 4, 0, 0]} name="Calls" />
              <Bar dataKey="appointments" fill="#10B981" fillOpacity={0.85} radius={[4, 4, 0, 0]} name="Appointments booked" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
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
                {apt.customer_name}
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

// ─── Billing Widget ───────────────────────────────────────
// Only renders when there's something actionable to show (low or exhausted).
// Healthy balance = subtle inline strip, not a banner.

function BillingWidget() {
  const { resolvedTheme } = useTheme()
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: getBusinessBilling,
    refetchInterval: 60_000,
  })

  if (isLoading) return null
  if (!data) return null

  const secs = data.seconds_remaining
  const mins = Math.floor(Math.abs(secs) / 60)
  const hours = Math.floor(mins / 60)
  const isExhausted = secs <= 0
  const isLow = secs > 0 && secs <= 1800
  const isHealthy = secs > 1800

  const balanceLabel = isExhausted
    ? "0m"
    : hours > 0
    ? `${hours}h ${mins % 60}m`
    : `${mins}m`

  const FULL_SECS = 5 * 60 * 60
  const pct = isExhausted ? 0 : Math.min(100, (secs / FULL_SECS) * 100)

  // Healthy state: unobtrusive strip inside the stat grid area
  if (isHealthy) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 12,
        background: resolvedTheme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
        border: `1px solid ${resolvedTheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
      }}>
        <Zap style={{ width: 13, height: 13, color: "#10B981", flexShrink: 0 }} strokeWidth={2} />
        <span style={{ fontSize: 12, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
          Call minutes
        </span>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: resolvedTheme === "dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: "#10B981", transition: "width 0.6s ease" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", flexShrink: 0 }}>
          {balanceLabel} left
        </span>
        {data.allow_overage && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", flexShrink: 0, letterSpacing: "0.02em" }}>
            OVERAGE ON
          </span>
        )}
      </div>
    )
  }

  // Low / exhausted: attention-worthy card
  const accent = isExhausted ? "#E5484D" : "#F59E0B"
  const accentBg = isExhausted ? "rgba(229,72,77,0.08)" : "rgba(245,158,11,0.08)"
  const accentBorder = isExhausted ? "rgba(229,72,77,0.2)" : "rgba(245,158,11,0.2)"

  const title = isExhausted
    ? data.allow_overage ? "Calls continuing on overage" : "Calls paused"
    : "Low call balance"

  const description = isExhausted
    ? data.allow_overage
      ? "Your call minutes are used up. Overage is active so calls continue, but you will be charged extra."
      : "Your call minutes are exhausted. New calls are blocked until you top up."
    : `You have about ${balanceLabel} of call time remaining. Top up soon to avoid interruptions.`

  return (
    <div
      className="animate-fade-up"
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        border: `1px solid ${accentBorder}`,
        background: resolvedTheme === "dark" ? "var(--card)" : accentBg,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: accentBg, border: `1px solid ${accentBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 1,
      }}>
        <Zap style={{ width: 15, height: 15, color: accent }} strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: accent, letterSpacing: "-0.01em" }}>{title}</span>
          {data.allow_overage && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", flexShrink: 0, letterSpacing: "0.02em" }}>
              OVERAGE ON
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 10 }}>{description}</p>
        <div style={{ height: 4, borderRadius: 2, background: resolvedTheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: accent, transition: "width 0.6s ease" }} />
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
            icon={PhoneCall}
            iconColor="#6366F1"
            cardBg="#EEF2FF"
            sparkData={callSparkData}
            sparkColor="#6366F1"
          />
          <StatCard
            value={appointments}
            label="Appointments"
            sublabel="booked today"
            icon={CalendarDays}
            iconColor="#10B981"
            cardBg="#ECFDF5"
            sparkData={apptSparkData}
            sparkColor="#10B981"
          />
          <StatCard
            value={leads}
            label="Leads Captured"
            sublabel="new leads today"
            icon={Users}
            iconColor="#D97706"
            cardBg="#FFFBEB"
            sparkData={leadSparkData}
            sparkColor="#F59E0B"
          />
          <StatCard
            value={avgCallDisplay}
            label="Avg Call Length"
            sublabel="per call today"
            icon={Clock}
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
        <div className="overview-bottom-grid">
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
