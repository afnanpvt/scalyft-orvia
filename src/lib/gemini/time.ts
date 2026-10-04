// Timezone helpers for the Gemini spike. Everything is anchored to the
// clinic's timezone, not the browser's, to match the real booking functions.

// "YYYY-MM-DDTHH:mm" wall-clock time of an instant in a timezone.
export function wallClock(d: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map(x => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// Wall-clock time in a timezone → the real instant.
export function zonedToUtc(wall: string, tz: string): Date {
  const guess = new Date(`${wall}:00Z`)
  const offsetMs = new Date(`${wallClock(guess, tz)}:00Z`).getTime() - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

// Gemini often books with the clinic's local time written as an ISO string,
// with no offset or a wrong "Z" (10:00 local sent as 10:00 UTC), and
// book-appointment reads offset-less times as UTC. Snap the slot back to
// the matching one check_availability offered; failing that, read an
// offset-less time as clinic time.
export function normalizeSlot(slot: string, tz: string, offered: string[]): string {
  const wall = slot.slice(0, 16)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return slot
  const exact = offered.find(o => new Date(o).getTime() === new Date(slot).getTime())
  if (exact) return exact
  const local = offered.find(o => wallClock(new Date(o), tz) === wall)
  if (local) return local
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(slot) ? slot : zonedToUtc(wall, tz).toISOString()
}

export function formatTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d)
}

export function formatDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d)
}

// "YYYY-MM-DD" of an instant in a timezone.
export function isoDate(d: Date, tz: string): string {
  return wallClock(d, tz).slice(0, 10)
}

// The calendar day `n` days after `dateIso` ("YYYY-MM-DD").
export function addDays(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
