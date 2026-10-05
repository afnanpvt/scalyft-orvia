import { useState } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import type { Business } from "@/lib/types"
import { addDays, formatTime, isoDate, zonedToUtc } from "@/lib/gemini/time"
import { bookingAt, clearBookings, daySlots, slotMinutes, useSpikeBookings, type SpikeBooking } from "@/lib/gemini/spike-calendar"

// The Gemini spike's simulated calendar: the next 7 days in the clinic's
// timezone. Each day shows how much is open and any bookings; click a day to
// see every slot. Updates the moment a simulated call books, and highlights
// the newest booking.

export function SpikeCalendar({ business, highlightId }: { business: Business; highlightId?: string | null }) {
  const bookings = useSpikeBookings(business.id)
  const [expanded, setExpanded] = useState<string | null>(null)
  const tz = business.timezone || "America/Chicago"
  const { duration } = slotMinutes(business)
  const now = Date.now()
  const today = isoDate(new Date(), tz)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const upcoming = bookings.filter(b => new Date(b.end).getTime() > now).length

  return (
    <div className="ios-card" style={{ padding: "16px 18px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <CalendarDays size={16} strokeWidth={1.75} style={{ color: "var(--foreground)", marginTop: 2, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Calendar</p>
            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>
              {upcoming} booked by simulated calls. Click a day to see every slot.
            </p>
          </div>
        </div>
        <button type="button" disabled={!bookings.length} onClick={() => clearBookings(business.id)}
          style={{
            fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 8, flexShrink: 0,
            border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)",
            cursor: bookings.length ? "pointer" : "not-allowed", opacity: bookings.length ? 1 : 0.5,
          }}>
          Clear
        </button>
      </div>

      <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(116px, 1fr))", gap: 10, minWidth: 7 * 116 + 6 * 10 }}>
          {days.map(dateIso => {
            const noon = zonedToUtc(`${dateIso}T12:00`, tz)
            const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(noon)
            const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(noon)
            const isToday = dateIso === today
            const slots = daySlots(business, dateIso)
            const taken = (d: Date) => bookingAt(d, bookings, duration)
            const dayBookings = bookings
              .filter(b => isoDate(new Date(b.start), tz) === dateIso)
              .sort((a, b) => a.start.localeCompare(b.start))
            const openCount = slots.filter(d => d.getTime() > now && !taken(d)).length
            const openRatio = slots.length ? openCount / slots.length : 0
            const isOpen = expanded === dateIso

            return (
              <div key={dateIso} style={{ minWidth: 0 }}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : dateIso)} aria-expanded={isOpen}
                  style={{
                    width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: slots.length ? "pointer" : "default",
                    fontFamily: "inherit", color: "inherit",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: isToday ? "#059669" : "var(--foreground)", letterSpacing: "-0.01em" }}>
                      {isToday ? "Today" : weekday}
                      <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}> · {date}</span>
                    </p>
                    {slots.length > 0 && (
                      <ChevronDown size={12} strokeWidth={1.75} style={{
                        color: "var(--muted-foreground)", transition: "transform 0.25s var(--ease-out-strong)",
                        transform: isOpen ? "rotate(180deg)" : "none",
                      }} />
                    )}
                  </div>
                  {slots.length === 0 ? (
                    <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6 }}>Closed</p>
                  ) : (
                    <>
                      <div style={{ height: 3, borderRadius: 3, background: "var(--muted)", margin: "8px 0 5px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round(openRatio * 100)}%`, background: "#10B981", opacity: 0.55, borderRadius: 3, transition: "width 0.5s var(--ease-out-strong)" }} />
                      </div>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        {openCount === 0 ? "Fully booked" : `${openCount} open`}
                      </p>
                    </>
                  )}
                </button>

                {/* Bookings, always visible */}
                {dayBookings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {dayBookings.map(b => <BookingChip key={b.id} booking={b} tz={tz} fresh={b.id === highlightId} />)}
                  </div>
                )}

                {/* Every slot, on demand */}
                {isOpen && (
                  <div className="animate-fade-up" style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", marginTop: 8 }}>
                    {slots.map(d => {
                      const b = taken(d)
                      const past = d.getTime() <= now
                      if (b) return null
                      return (
                        <span key={d.toISOString()} style={{
                          fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "var(--muted)",
                          color: "var(--muted-foreground)", opacity: past ? 0.4 : 1, fontVariantNumeric: "tabular-nums",
                        }}>
                          {formatTime(d, tz)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BookingChip({ booking, tz, fresh }: { booking: SpikeBooking; tz: string; fresh: boolean }) {
  return (
    <div title={`${booking.name} · ${booking.service} · ${booking.phone}`} className={fresh ? "animate-fade-up" : undefined}
      style={{
        fontSize: 11.5, lineHeight: 1.3, padding: "5px 8px", borderRadius: 8, minWidth: 0,
        background: "#D1FAE5", color: "#065F46",
        border: `1px solid ${fresh ? "#10B981" : "rgba(16,185,129,0.25)"}`,
        boxShadow: fresh ? "0 0 0 3px rgba(16,185,129,0.18)" : undefined,
      }}>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatTime(new Date(booking.start), tz)}</span>
      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{booking.name}</span>
    </div>
  )
}
