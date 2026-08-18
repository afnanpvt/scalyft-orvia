import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Calendar as CalendarIcon, Clock, Phone, CheckCircle2, XCircle, RotateCcw } from "lucide-react"

import { getAppointments, updateAppointmentStatus } from "@/lib/api"
import type { Appointment } from "@/lib/types"

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

function AppointmentRow({ apt, onStatusChange }: {
  apt: Appointment
  onStatusChange: (id: string, status: Appointment["status"]) => void
}) {
  const status = statusStyle(apt.status)
  const canMarkComplete = apt.status === "confirmed" || apt.status === "rescheduled"

  return (
    <div className="row-hover" style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 20px", borderBottom: "1px solid var(--border)",
      opacity: apt.status === "cancelled" || apt.status === "no_show" ? 0.55 : 1,
    }}>
      <div style={{ width: 72, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {formatTime(apt.scheduled_start)}
        </p>
        {apt.scheduled_end && (
          <p style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 2 }}>
            → {formatTime(apt.scheduled_end)}
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

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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

export default function AppointmentsPage() {
  const [filter, setFilter] = useState<Filter>("upcoming")
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

  async function onStatusChange(id: string, status: Appointment["status"]) {
    await updateAppointmentStatus(id, status)
    await queryClient.invalidateQueries({ queryKey: ["appointments"] })
    await queryClient.invalidateQueries({ queryKey: ["briefing"] })
  }

  const todayCount = appointments?.filter(a => isSameDay(new Date(a.scheduled_start), new Date())).length ?? 0

  return (
    <div className="pb-12">
      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)" }}>
          Appointments
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          {filter === "today" ? `${filtered.length} today` : `${filtered.length} ${filter} · ${todayCount} today`}
        </p>
      </div>

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
                <AppointmentRow key={apt.id} apt={apt} onStatusChange={onStatusChange} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
