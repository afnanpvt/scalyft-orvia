import { useMemo, useState } from "react"
import { callerPhoneLabel } from "@/lib/caller-label"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Phone, ChevronLeft, ChevronRight, PhoneIncoming, PhoneOff, PhoneMissed, PhoneForwarded, Clock, ArrowRight, Calendar as CalendarIcon, List } from "lucide-react"

import { getCalls, getCallsByRange } from "@/lib/api"
import type { Call } from "@/lib/types"
import { MonthCalendar, dayKey, startOfMonth, addMonths, type DayCell } from "@/components/dashboard/month-calendar"

// ─── Helpers ──────────────────────────────────────────────

function formatDateGroup(dateString: string | null): string {
  if (!dateString) return "Unknown"
  const d = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function formatTime(dateString: string | null): string {
  if (!dateString) return ""
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatDuration(secs: number | null): string {
  if (secs == null || secs === 0) return ""
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function getCallerLabel(call: Call): string {
  const extracted = (call.extracted_data ?? {}) as Record<string, unknown>
  const name = extracted.caller_name as string | null
  if (name) return name
  return callerPhoneLabel(call)
}

function getCallerInitial(call: Call): string {
  const extracted = (call.extracted_data ?? {}) as Record<string, unknown>
  const name = extracted.caller_name as string | null
  if (name) return name.charAt(0).toUpperCase()
  return "#"
}

// ─── Outcome config ───────────────────────────────────────

const OUTCOME: Record<string, {
  label: string
  bg: string
  color: string
  border: string
  dotColor: string
  icon: React.ElementType
}> = {
  appointment_booked: { label: "Booked",   bg: "#D1FAE5", color: "#065F46", border: "rgba(16,185,129,0.3)",  dotColor: "#10B981", icon: PhoneIncoming },
  lead_captured:      { label: "Lead",     bg: "#EEF2FF", color: "#4338CA", border: "rgba(99,102,241,0.3)",  dotColor: "#6366F1", icon: PhoneIncoming },
  info_given:         { label: "Info",     bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)", dotColor: "var(--muted-foreground)", icon: PhoneIncoming },
  transferred:        { label: "Transfer", bg: "#FEF3C7", color: "#92400E", border: "rgba(245,158,11,0.3)",  dotColor: "#F59E0B", icon: PhoneForwarded },
  missed:             { label: "Missed",   bg: "#FEE2E2", color: "#991B1B", border: "rgba(229,72,77,0.3)",   dotColor: "#E5484D", icon: PhoneMissed },
  failed:             { label: "Failed",   bg: "#FEE2E2", color: "#991B1B", border: "rgba(229,72,77,0.3)",   dotColor: "#E5484D", icon: PhoneOff },
}

function getOutcome(outcome: string | null) {
  return OUTCOME[outcome ?? ""] ?? {
    label: "Unknown",
    bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)",
    dotColor: "var(--muted-foreground)", icon: PhoneIncoming,
  }
}

// ─── Group calls by date ───────────────────────────────────

function groupByDate(calls: Call[]): { label: string; calls: Call[]; totalSecs: number }[] {
  const groups: Record<string, Call[]> = {}
  for (const call of calls) {
    const key = formatDateGroup(call.started_at ?? call.created_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(call)
  }
  return Object.entries(groups).map(([label, calls]) => ({
    label,
    calls,
    totalSecs: calls.reduce((sum, c) => sum + (c.duration_secs ?? 0), 0),
  }))
}

function formatMinutes(secs: number): string {
  const mins = Math.round(secs / 60)
  if (mins < 1) return "<1 min"
  return `${mins} min${mins === 1 ? "" : "s"}`
}

// ─── Skeleton ─────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="skeleton" style={{ height: 13, width: 120, borderRadius: 4, marginBottom: 7 }} />
        <div className="skeleton" style={{ height: 11, width: "65%", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div className="skeleton" style={{ height: 11, width: 40, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: 60, height: 22, borderRadius: 999 }} />
      </div>
    </div>
  )
}

// ─── Call Row ─────────────────────────────────────────────

function CallRow({ call }: { call: Call }) {
  const o = getOutcome(call.outcome ?? null)
  const duration = formatDuration(call.duration_secs)
  const time = formatTime(call.started_at ?? call.created_at)
  const callerLabel = getCallerLabel(call)
  const initial = getCallerInitial(call)
  const hasName = !!(call.extracted_data as Record<string, unknown>)?.caller_name

  return (
    <Link
      to="/calls/$id"
      params={{ id: call.id }}
      className="row-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "13px 20px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
        transition: "background 0.1s ease",
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: o.bg,
        border: `1.5px solid ${o.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: o.color,
          fontFamily: "Geist, sans-serif",
        }}>
          {initial}
        </span>
        {/* Outcome dot - bottom right of avatar */}
        <span style={{
          position: "absolute", bottom: -1, right: -1,
          width: 12, height: 12, borderRadius: "50%",
          background: o.dotColor,
          border: "2px solid var(--card)",
        }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 600,
            color: "var(--foreground)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: "-0.02em",
          }}>
            {callerLabel}
          </span>
          {hasName && call.caller_phone && (
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.5, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {call.caller_phone}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 12, color: "var(--muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.4, letterSpacing: "-0.005em",
        }}>
          {call.summary ?? "No summary"}
        </p>
      </div>

      {/* Right meta */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {duration && (
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
              {duration}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.5 }}>{time}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: "2px 9px", borderRadius: 999,
            background: o.bg, color: o.color,
            border: `1px solid ${o.border}`,
            whiteSpace: "nowrap", letterSpacing: "0.01em",
          }}>
            {o.label}
          </span>
          <ArrowRight style={{ width: 11, height: 11, color: "var(--muted-foreground)", opacity: 0.4 }} strokeWidth={1.5} />
        </div>
      </div>
    </Link>
  )
}

// ─── Date group divider ────────────────────────────────────

function DateDivider({ label, count, totalSecs }: { label: string; count: number; totalSecs: number }) {
  return (
    <div style={{
      padding: "8px 20px 6px",
      background: "var(--muted)",
      borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: "var(--muted-foreground)",
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
        {count} call{count === 1 ? "" : "s"}{totalSecs > 0 ? ` · ${formatMinutes(totalSecs)}` : ""}
      </span>
    </div>
  )
}

// ─── Calendar view ──────────────────────────────────────────

function CallsCalendarView() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(() => dayKey(new Date()))
  const todayKey = dayKey(new Date())

  const rangeStart = monthCursor
  const rangeEnd = addMonths(monthCursor, 1)
  const { data: monthCalls = [], isLoading } = useQuery({
    queryKey: ["calls-by-month", dayKey(rangeStart)],
    queryFn: () => getCallsByRange(rangeStart, rangeEnd),
  })

  const dayData = useMemo(() => {
    const map: Record<string, DayCell> = {}
    for (const call of monthCalls) {
      const key = dayKey(new Date(call.started_at ?? call.created_at))
      if (!map[key]) map[key] = { count: 0, accent: "#6366F1" }
      map[key].count += 1
    }
    return map
  }, [monthCalls])

  const selectedCalls = useMemo(() => {
    if (!selectedDay) return []
    return monthCalls
      .filter(c => dayKey(new Date(c.started_at ?? c.created_at)) === selectedDay)
      .sort((a, b) => new Date(b.started_at ?? b.created_at).getTime() - new Date(a.started_at ?? a.created_at).getTime())
  }, [monthCalls, selectedDay])

  const selectedTotalSecs = selectedCalls.reduce((s, c) => s + (c.duration_secs ?? 0), 0)
  const selectedLabel = selectedDay
    ? new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null

  return (
    <div className="calls-calendar-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      <div className="ios-card" style={{ padding: 18 }}>
        <MonthCalendar
          monthCursor={monthCursor}
          onMonthChange={d => { setMonthCursor(d); setSelectedDay(null) }}
          data={dayData}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          todayKey={todayKey}
          emptyLabel={isLoading ? undefined : "No calls this month"}
        />
      </div>

      <div className="ios-card" style={{ padding: 0, overflow: "hidden", minHeight: 200 }}>
        {!selectedDay ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted-foreground)" }}>
            <p style={{ fontSize: 13 }}>Pick a day on the calendar to see its calls.</p>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 20px", background: "var(--muted)", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--foreground)" }}>{selectedLabel}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
                {selectedCalls.length} call{selectedCalls.length === 1 ? "" : "s"}
                {selectedTotalSecs > 0 ? ` · ${formatMinutes(selectedTotalSecs)}` : ""}
              </span>
            </div>
            {selectedCalls.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--muted-foreground)" }}>
                <p style={{ fontSize: 13 }}>No calls on this day.</p>
              </div>
            ) : (
              selectedCalls.map(call => <CallRow key={call.id} call={call} />)
            )}
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 760px) {
          .calls-calendar-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function CallsPage() {
  const [page, setPage] = useState(1)
  const [view, setView] = useState<"list" | "calendar">("list")
  const pageSize = 20

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calls", page],
    queryFn: () => getCalls(page, pageSize),
    enabled: view === "list",
  })

  const calls = data?.calls ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)
  const groups = groupByDate(calls)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div className="animate-fade-up animate-fade-up-1" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)", fontFamily: "Geist, sans-serif" }}>
              Calls
            </h1>
            {view === "list" && !isLoading && total > 0 && (
              <span style={{
                fontSize: 11.5, fontWeight: 700, color: "var(--primary-foreground)",
                background: "var(--foreground)", padding: "2px 9px", borderRadius: 999,
                fontFamily: "Geist Mono, monospace", fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.02em",
              }}>
                {total}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4, letterSpacing: "-0.01em" }}>
            Every call handled by Orvia
          </p>
        </div>

        <div style={{ display: "flex", gap: 4, padding: 3, background: "var(--muted)", borderRadius: 10 }}>
          {([["list", "List", List], ["calendar", "Calendar", CalendarIcon]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setView(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8, border: "none",
                fontSize: 12.5, fontWeight: view === key ? 600 : 500,
                color: view === key ? "var(--foreground)" : "var(--muted-foreground)",
                background: view === key ? "var(--background)" : "transparent",
                cursor: "pointer",
                boxShadow: view === key ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
              }}>
              <Icon size={13} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <CallsCalendarView />
      ) : (
        <>
      {isError && (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#E5484D", fontWeight: 500 }}>Could not load calls</p>
          <button onClick={() => refetch()} style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
            Try again
          </button>
        </div>
      )}

      {/* List */}
      <div className="ios-card animate-fade-up animate-fade-up-2" style={{ padding: 0, overflow: "hidden" }}>
        {isLoading ? (
          <>{Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}</>
        ) : calls.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" }}>
              <Phone style={{ width: 22, height: 22, color: "var(--muted-foreground)" }} strokeWidth={1.5} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>No calls yet</p>
              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6, maxWidth: 220 }}>
                Calls will appear here as soon as someone dials your Orvia number.
              </p>
            </div>
          </div>
        ) : (
          groups.map(({ label, calls: groupCalls, totalSecs }) => (
            <div key={label}>
              <DateDivider label={label} count={groupCalls.length} totalSecs={totalSecs} />
              {groupCalls.map((call) => <CallRow key={call.id} call={call} />)}
            </div>
          ))
        )}

        {/* Pagination */}
        {!isLoading && total > pageSize && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", borderTop: "1px solid var(--border)",
            background: "var(--muted)",
          }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page <= 1}
                aria-label="Previous page"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)", cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "0 8px", fontVariantNumeric: "tabular-nums" }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                disabled={page >= totalPages}
                aria-label="Next page"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--foreground)", cursor: page >= totalPages ? "not-allowed" : "pointer",
                  opacity: page >= totalPages ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}
