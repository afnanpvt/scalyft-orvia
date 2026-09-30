import { ChevronLeft, ChevronRight } from "lucide-react"

// Month grid used by Calls and Appointments for their Calendar view. Pure
// display + selection — callers own fetching data for the visible month and
// pass per-day aggregates in. Keys are local "YYYY-MM-DD" strings.

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]

export interface DayCell {
  count: number
  // Small colored dot(s) under the count — e.g. outcome mix for calls,
  // booked/pending mix for appointments. Optional.
  accent?: string
}

export function MonthCalendar({
  monthCursor, onMonthChange, data, selectedDay, onSelectDay, todayKey, emptyLabel,
}: {
  monthCursor: Date
  onMonthChange: (d: Date) => void
  data: Record<string, DayCell>
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
  todayKey: string
  emptyLabel?: string
}) {
  const first = startOfMonth(monthCursor)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const daysInPrevMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 0).getDate()

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, daysInPrevMonth - i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d), inMonth: true })
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
  }

  const maxCount = Math.max(1, ...Object.values(data).map(c => c.count))

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {monthLabel(monthCursor)}
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(addMonths(monthCursor, -1))}
            style={navBtnStyle}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(addMonths(monthCursor, 1))}
            style={navBtnStyle}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", padding: "2px 0" }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map(({ date, inMonth }) => {
          const key = dayKey(date)
          const cell = data[key]
          const isToday = key === todayKey
          const isSelected = key === selectedDay
          const intensity = cell ? Math.min(1, cell.count / maxCount) : 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : key)}
              disabled={!inMonth}
              style={{
                aspectRatio: "1", borderRadius: 9, position: "relative",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                border: isSelected ? "1.5px solid var(--foreground)" : isToday ? "1.5px solid var(--muted-foreground)" : "1px solid transparent",
                background: !inMonth ? "transparent" : cell && cell.count > 0 ? `color-mix(in srgb, ${cell.accent ?? "#6366F1"} ${8 + intensity * 22}%, var(--card))` : "var(--card)",
                cursor: inMonth ? "pointer" : "default",
                opacity: inMonth ? 1 : 0,
                fontFamily: "inherit",
              }}
            >
              <span style={{
                fontSize: 11.5, fontWeight: isToday ? 700 : 500,
                color: isSelected ? "var(--foreground)" : "var(--muted-foreground)",
              }}>
                {date.getDate()}
              </span>
              {cell && cell.count > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: cell.accent ?? "#6366F1" }}>
                  {cell.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {emptyLabel && Object.values(data).every(c => c.count === 0) && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", marginTop: 14 }}>{emptyLabel}</p>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--foreground)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
}
