import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, RotateCcw, ChevronRight, List } from "lucide-react"

import { getAppointments, getAppointmentsByRange, updateAppointmentStatus } from "@/lib/api"
import type { Appointment } from "@/lib/types"
import { AppointmentDrawer } from "@/components/dashboard/appointment-drawer"
import { MonthCalendar, dayKey, startOfMonth, addMonths, type DayCell } from "@/components/dashboard/month-calendar"

const FILTERS = ["upcoming", "today", "past", "all"] as const
type Filter = (typeof FILTERS)[number]

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateGroup(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, today)) return "Today"
  if (isSameDay(date, tomorrow)) return "Tomorrow"
  if (isSameDay(date, yesterday)) return "Yesterday"
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function statusStyle(s: Appointment["status"]): { text: string; bg: string; border: string; label: string } {
  switch (s) {
    case "confirmed":   return { text: "#065F46", bg: "#D1FAE5",                border: "rgba(16,185,129,0.25)", label: "Confirmed" }
    case "rescheduled": return { text: "#92400E", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)", label: "Rescheduled" }
    case "completed":   return { text: "var(--muted-foreground)", bg: "var(--muted)", border: "var(--border)",     label: "Completed" }
    case "cancelled":   return { text: "#991B1B", bg: "rgba(229,72,77,0.1)",    border: "rgba(229,72,77,0.2)",    label: "Cancelled" }
    case "no_show":     return { text: "#991B1B", bg: "rgba(229,72,77,0.1)",    border: "rgba(229,72,77,0.2)",    label: "No-show" }
  }
}

function RowSkeleton() {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
      <div className="animate-pulse" style={{ width: 60, height: 32, background: "var(--muted)", borderRadius: 6 }} />
      <div className="animate-pulse" style={{ flex: 1, height: 32, background: "var(--muted)", borderRadius: 6 }} />
    </div>
  )
}

function AppointmentRow({ apt, onStatusChange, onOpen }: {
  apt: Appointment
  onStatusChange: (id: string, status: Appointment["status"]) => void
  onOpen: (apt: Appointment) => void
}) {
  const status = statusStyle(apt.status)
  const canMarkComplete = apt.status === "confirmed" || apt.status === "rescheduled"

  return (
    <div className="row-hover" role="button" tabIndex={0}
      onClick={() => onOpen(apt)}
      onKeyDown={e => { if (e.key === "Enter") onOpen(apt) }}
      style={{
      display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
      padding: "14px 20px", borderBottom: "1px solid var(--border)",
      opacity: apt.status === "cancelled" || apt.status === "no_show" ? 0.55 : 1,
    }}>
      <div style={{ width: 72, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {formatTime(apt.scheduled_start)}
        </p>
        {apt.scheduled_end && (
          <p style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 2 }}>
            to {formatTime(apt.scheduled_end)}
          </p>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
            {apt.customer_name}
          </p>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
            color: status.text, background: status.bg, border: `1px solid ${status.border}`,
            letterSpacing: "0.02em",
          }}>{status.label}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {apt.service_type ?? "Appointment"}
          {apt.customer_phone && (
            <>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{apt.customer_phone}</span>
            </>
          )}
        </p>
        {apt.notes && (
          <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 4, opacity: 0.85, lineHeight: 1.5 }}>
            {apt.notes}
          </p>
        )}
      </div>

      {/* Actions don't open the drawer */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        {canMarkComplete && apt.status !== "completed" && (
          <button type="button" onClick={() => onStatusChange(apt.id, "completed")}
            title="Mark completed"
            style={iconBtn}>
            <CheckCircle2 size={14} strokeWidth={1.75} />
          </button>
        )}
        {apt.status !== "cancelled" && apt.status !== "completed" && (
          <button type="button" onClick={() => onStatusChange(apt.id, "cancelled")}
            title="Cancel"
            style={iconBtn}>
            <XCircle size={14} strokeWidth={1.75} />
          </button>
        )}
        {apt.status === "cancelled" && (
          <button type="button" onClick={() => onStatusChange(apt.id, "confirmed")}
            title="Restore"
            style={iconBtn}>
            <RotateCcw size={14} strokeWidth={1.75} />
          </button>
        )}
        <ChevronRight size={16} strokeWidth={1.75} style={{ color: "var(--muted-foreground)", opacity: 0.6, marginLeft: 2 }} />
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--muted-foreground)", cursor: "pointer",
  transition: "all 0.15s",
}

// Accent per status: mostly-confirmed days read green, mostly-cancelled days
// read red, mixed days fall back to indigo.
function accentForDay(apts: Appointment[]): string {
  const active = apts.filter(a => a.status !== "cancelled" && a.status !== "no_show").length
  if (apts.length === 0) return "#6366F1"
  if (active === apts.length) return "#10B981"
  if (active === 0) return "#E5484D"
  return "#6366F1"
}

// ─── Calendar view ──────────────────────────────────────────

function AppointmentsCalendarView({ onOpen, onStatusChange }: {
  onOpen: (apt: Appointment) => void
  onStatusChange: (id: string, status: Appointment["status"]) => void
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(() => dayKey(new Date()))
  const todayKey = dayKey(new Date())

  const rangeStart = monthCursor
  const rangeEnd = addMonths(monthCursor, 1)
  const { data: monthApts = [], isLoading } = useQuery({
    queryKey: ["appointments-by-month", dayKey(rangeStart)],
    queryFn: () => getAppointmentsByRange(rangeStart, rangeEnd),
  })

  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const a of monthApts) {
      const key = dayKey(new Date(a.scheduled_start))
      if (!map[key]) map[key] = []
      map[key].push(a)
    }
    return map
  }, [monthApts])

  const dayData = useMemo(() => {
    const map: Record<string, DayCell> = {}
    for (const [key, apts] of Object.entries(byDay)) {
      map[key] = { count: apts.length, accent: accentForDay(apts) }
    }
    return map
  }, [byDay])

  const selectedApts = (selectedDay ? byDay[selectedDay] : undefined) ?? []
  const selectedLabel = selectedDay
    ? new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null

  return (
    <div className="apt-calendar-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      <div className="ios-card" style={{ padding: 18 }}>
        <MonthCalendar
          monthCursor={monthCursor}
          onMonthChange={d => { setMonthCursor(d); setSelectedDay(null) }}
          data={dayData}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          todayKey={todayKey}
          emptyLabel={isLoading ? undefined : "No appointments this month"}
        />
      </div>

      <div className="ios-card" style={{ padding: 0, overflow: "hidden", minHeight: 200 }}>
        {!selectedDay ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted-foreground)" }}>
            <p style={{ fontSize: 13 }}>Pick a day on the calendar to see its appointments.</p>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 20px", background: "var(--muted)", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--foreground)" }}>{selectedLabel}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
                {selectedApts.length} appointment{selectedApts.length === 1 ? "" : "s"}
              </span>
            </div>
            {selectedApts.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--muted-foreground)" }}>
                <p style={{ fontSize: 13 }}>Nothing booked on this day.</p>
              </div>
            ) : (
              [...selectedApts]
                .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
                .map(apt => <AppointmentRow key={apt.id} apt={apt} onStatusChange={onStatusChange} onOpen={onOpen} />)
            )}
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 760px) {
          .apt-calendar-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

export default function AppointmentsPage() {
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [view, setView] = useState<"list" | "calendar">("list")
  const [openApt, setOpenApt] = useState<Appointment | null>(null)
  const { open: openId } = useSearch({ from: "/_dashboard/appointments" })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const range = filter === "past" ? "past" : filter === "all" ? "all" : "upcoming"
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", range],
    queryFn: () => getAppointments({ range }),
  })

  const filtered = useMemo(() => {
    if (!appointments) return []
    if (filter !== "today") return appointments
    const today = new Date()
    return appointments.filter(a => isSameDay(new Date(a.scheduled_start), today))
  }, [appointments, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of filtered) {
      const key = formatDateGroup(new Date(a.scheduled_start))
      const list = map.get(key) ?? []
      list.push(a); map.set(key, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  // Deep link from Overview: open that appointment once the list has it.
  useEffect(() => {
    if (!openId || !appointments) return
    const match = appointments.find(a => a.id === openId)
    if (match) setOpenApt(match)
  }, [openId, appointments])

  function closeDrawer() {
    setOpenApt(null)
    if (openId) navigate({ to: "/appointments", search: {}, replace: true })
  }

  async function onStatusChange(id: string, status: Appointment["status"]) {
    await updateAppointmentStatus(id, status)
    await queryClient.invalidateQueries({ queryKey: ["appointments"] })
    await queryClient.invalidateQueries({ queryKey: ["briefing"] })
  }

  const todayCount = appointments?.filter(a => isSameDay(new Date(a.scheduled_start), new Date())).length ?? 0

  return (
    <div className="pb-12">
      <div className="mb-6" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)" }}>
            Appointments
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
            {view === "calendar"
              ? `${todayCount} today`
              : filter === "today" ? `${filtered.length} today` : `${filtered.length} ${filter} · ${todayCount} today`}
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
        <AppointmentsCalendarView onOpen={setOpenApt} onStatusChange={onStatusChange} />
      ) : (
      <>
      <div style={{
        display: "flex", gap: 4, padding: 3,
        background: "var(--muted)", borderRadius: 10, width: "fit-content", marginBottom: 18,
      }}>
        {FILTERS.map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              fontSize: 12.5, fontWeight: filter === f ? 600 : 500,
              color: filter === f ? "var(--foreground)" : "var(--muted-foreground)",
              background: filter === f ? "var(--background)" : "transparent",
              cursor: "pointer", textTransform: "capitalize",
              boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s",
            }}>
            {f}
          </button>
        ))}
      </div>

      <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
        {isLoading ? (
          <>
            <RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <CalendarIcon size={28} style={{ color: "var(--muted-foreground)", opacity: 0.4, margin: "0 auto 12px" }} strokeWidth={1.5} />
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
              {filter === "today" ? "Nothing on the books today." : `No ${filter} appointments.`}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", opacity: 0.7, marginTop: 4 }}>
              Bookings made through Orvia show up here.
            </p>
          </div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day}>
              <div style={{
                padding: "10px 20px 8px", background: "var(--muted)",
                borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Clock size={11} strokeWidth={1.75} style={{ color: "var(--muted-foreground)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                  {day}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.6 }}>· {items.length}</span>
              </div>
              {items.map(apt => (
                <AppointmentRow key={apt.id} apt={apt} onStatusChange={onStatusChange} onOpen={setOpenApt} />
              ))}
            </div>
          ))
        )}
      </div>
      </>
      )}
      <AppointmentDrawer appointment={openApt} onClose={closeDrawer} />
    </div>
  )
}
