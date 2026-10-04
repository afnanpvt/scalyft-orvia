import { CalendarDays } from "lucide-react"
import type { Business } from "@/lib/types"
import { addDays, formatTime, isoDate, zonedToUtc } from "@/lib/gemini/time"
import { bookingAt, clearBookings, daySlots, slotMinutes, useSpikeBookings, type SpikeBooking } from "@/lib/gemini/spike-calendar"

// The Gemini spike's simulated calendar: the next 7 days in the clinic's
// timezone, every slot shown as open or booked. Updates the moment a
// simulated call books, and highlights the newest booking.

type Item = { start: Date; booking?: SpikeBooking }

function dayItems(business: Business, dateIso: string, bookings: SpikeBooking[], tz: string): Item[] {
  const { duration } = slotMinutes(business)
  const items: Item[] = daySlots(business, dateIso).map(start => ({ start, booking: bookingAt(start, bookings, duration) }))
  // Bookings that don't line up with any slot (outside hours) still show.
  const shown = new Set(items.map(i => i.booking?.id).filter(Boolean))
  for (const b of bookings) {
    if (!shown.has(b.id) && isoDate(new Date(b.start), tz) === dateIso) items.push({ start: new Date(b.start), booking: b })
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function SpikeCalendar({ business, highlightId }: { business: Business; highlightId?: string | null }) {
  const bookings = useSpikeBookings(business.id)
  const tz = business.timezone || "America/Chicago"
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
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Spike calendar</p>
            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>
              {upcoming} upcoming · bookings from simulated calls, saved in this browser
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(112px, 1fr))", gap: 8, minWidth: 7 * 112 + 6 * 8 }}>
          {days.map(dateIso => {
            const noon = zonedToUtc(`${dateIso}T12:00`, tz)
            const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(noon)
            const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(noon)
            const items = dayItems(business, dateIso, bookings, tz)
            const isToday = dateIso === today
            return (
              <div key={dateIso} style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: isToday ? "#059669" : "var(--muted-foreground)", letterSpacing: "0.02em", marginBottom: 6 }}>
                  {isToday ? "Today" : weekday} · {date}
                </p>
                {items.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", padding: "6px 0" }}>Closed</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {items.map(({ start, booking }) => {
                      const past = start.getTime() <= now
                      const fresh = !!booking && booking.id === highlightId
                      return (
                        <div key={start.toISOString()} title={booking ? `${booking.name} · ${booking.service} · ${booking.phone}` : undefined}
                          className={fresh ? "animate-fade-up" : undefined}
                          style={{
                            fontSize: 11.5, lineHeight: 1.25, padding: "5px 7px", borderRadius: 8, minWidth: 0,
                            background: booking ? "#D1FAE5" : "var(--muted)",
                            color: booking ? "#065F46" : "var(--muted-foreground)",
                            border: `1px solid ${fresh ? "#10B981" : booking ? "rgba(16,185,129,0.25)" : "transparent"}`,
                            boxShadow: fresh ? "0 0 0 3px rgba(16,185,129,0.18)" : undefined,
                            opacity: past && !booking ? 0.45 : 1,
                          }}>
                          <span style={{ fontWeight: booking ? 600 : 500, fontVariantNumeric: "tabular-nums" }}>{formatTime(start, tz)}</span>
                          {booking && (
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {booking.name}
                            </span>
                          )}
                        </div>
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
