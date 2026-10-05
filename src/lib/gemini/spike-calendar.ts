import { useSyncExternalStore } from "react"
import type { Business } from "@/lib/types"
import { formatDay, formatTime, isoDate, wallClock, zonedToUtc } from "@/lib/gemini/time"

// Spike-only calendar. With simulated tools the assistant's
// check_availability / book_appointment calls are answered here, in the
// browser, instead of hitting Supabase and Google Calendar. Bookings persist
// in localStorage per business, so a second call sees the first call's
// bookings and can't double-book a slot. Shapes match the real tool
// responses so the assistant behaves the same either way.

export interface SpikeBooking {
  id: string
  name: string
  phone: string
  service: string
  start: string // ISO instant
  end: string
  createdAt: string
}

// ─── Store ───────────────────────────────────────────────

const PREFIX = "orvia.geminiSpike.bookings."
const EMPTY: SpikeBooking[] = []
const memory = new Map<string, string>() // used when localStorage is unavailable
const listeners = new Set<() => void>()
let cache: { key: string; raw: string | null; list: SpikeBooking[] } | null = null

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return memory.get(key) ?? null }
}

export function readBookings(businessId: string): SpikeBooking[] {
  const key = PREFIX + businessId
  const raw = readRaw(key)
  if (cache && cache.key === key && cache.raw === raw) return cache.list
  let list: SpikeBooking[] = []
  try { list = raw ? (JSON.parse(raw) as SpikeBooking[]) : [] } catch { /* corrupt: start empty */ }
  cache = { key, raw, list }
  return list
}

function writeBookings(businessId: string, list: SpikeBooking[]) {
  const key = PREFIX + businessId
  const raw = JSON.stringify(list)
  try { localStorage.setItem(key, raw) } catch { memory.set(key, raw) }
  listeners.forEach(l => l())
}

export function clearBookings(businessId: string) {
  writeBookings(businessId, [])
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Other tabs booking into the same calendar.
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith(PREFIX)) cb() }
  window.addEventListener("storage", onStorage)
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage) }
}

export function useSpikeBookings(businessId: string | undefined): SpikeBooking[] {
  return useSyncExternalStore(subscribe, () => (businessId ? readBookings(businessId) : EMPTY))
}

// ─── Opening hours and slots ─────────────────────────────

function toHHMM(t: string): string | null {
  const s = t.trim().toLowerCase()
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (ampm) {
    let h = Number(ampm[1])
    if (ampm[3] === "pm" && h !== 12) h += 12
    if (ampm[3] === "am" && h === 12) h = 0
    return `${String(h).padStart(2, "0")}:${ampm[2] ?? "00"}`
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  return hm ? `${hm[1].padStart(2, "0")}:${hm[2]}` : null
}

// Same precedence as check-availability: per-day hours, then the free-text
// hours string, then 10 AM to 7 PM.
export function dayHours(business: Business, dateIso: string): { open: string; close: string } | "closed" {
  const tz = business.timezone || "America/Chicago"
  const dayName = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" })
    .format(zonedToUtc(`${dateIso}T12:00`, tz)).toLowerCase()
  const s = business.settings
  const oh = s.operating_hours?.[dayName]
  if (oh) {
    if (oh.closed) return "closed"
    const open = toHHMM(oh.open), close = toHHMM(oh.close)
    if (open && close) return { open, close }
  }
  if (s.hours) {
    if (dayName === "sunday" && /mon-sat/i.test(s.hours)) return "closed"
    const m = s.hours.match(/(\d+(?::\d+)?\s*(?:am|pm)?)\s*[-–]\s*(\d+(?::\d+)?\s*(?:am|pm)?)/i)
    const open = m ? toHHMM(m[1]) : null, close = m ? toHHMM(m[2]) : null
    if (open && close) return { open, close }
  }
  return { open: "10:00", close: "19:00" }
}

export function slotMinutes(business: Business) {
  return {
    duration: business.settings.slot_duration_default ?? 60,
    step: (business.settings.slot_duration_default ?? 60) + (business.settings.buffer_between_appointments ?? 5),
  }
}

// Every slot start on a day, booked or not.
export function daySlots(business: Business, dateIso: string): Date[] {
  const hours = dayHours(business, dateIso)
  if (hours === "closed") return []
  const tz = business.timezone || "America/Chicago"
  const { duration, step } = slotMinutes(business)
  const open = zonedToUtc(`${dateIso}T${hours.open}`, tz).getTime()
  const close = zonedToUtc(`${dateIso}T${hours.close}`, tz).getTime()
  const slots: Date[] = []
  for (let t = open; t + duration * 60_000 <= close; t += step * 60_000) slots.push(new Date(t))
  return slots
}

export function bookingAt(slot: Date, bookings: SpikeBooking[], durationMin: number): SpikeBooking | undefined {
  const s = slot.getTime(), e = s + durationMin * 60_000
  return bookings.find(b => s < new Date(b.end).getTime() && e > new Date(b.start).getTime())
}

function openSlots(business: Business, dateIso: string, bookings: SpikeBooking[]): Date[] {
  const now = Date.now()
  const { duration } = slotMinutes(business)
  return daySlots(business, dateIso).filter(s => s.getTime() > now && !bookingAt(s, bookings, duration))
}

// ─── Simulated tools ─────────────────────────────────────

export function simulateTool(name: string | undefined, args: Record<string, unknown>, business: Business): { result: unknown; booking?: SpikeBooking } {
  const tz = business.timezone || "America/Chicago"
  const bookings = readBookings(business.id)

  if (name === "check_availability") {
    const date = String(args.date ?? "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { result: { error: "What date would you like me to check?" } }
    if (dayHours(business, date) === "closed") return { result: { slots: [], message: "We're closed on that day." } }

    const open = openSlots(business, date, bookings)
    if (!open.length) return { result: { slots: [], message: "No openings on that date." } }

    // The caller may ask for a part of the day. Without a filter, a day's
    // first four slots are all morning, so the agent would wrongly conclude
    // the afternoon is full: spread the sample across the day instead.
    const minutes = (d: Date) => { const [h, m] = wallClock(d, tz).slice(11, 16).split(":").map(Number); return h * 60 + m }
    const part = String(args.part_of_day ?? "").toLowerCase()
    const after = /^\d{1,2}:\d{2}$/.test(String(args.after_time ?? "")) ? String(args.after_time).split(":").map(Number) : null
    const afterMin = after ? after[0] * 60 + after[1] : null
    const inPart = (d: Date) => {
      const t = minutes(d)
      if (part === "morning") return t < 12 * 60
      if (part === "afternoon") return t >= 12 * 60 && t < 17 * 60
      if (part === "evening") return t >= 17 * 60
      return true
    }
    const filtered = open.filter(d => inPart(d) && (afterMin === null || minutes(d) >= afterMin))
    const filtering = !!part || afterMin !== null

    if (filtering && !filtered.length) {
      return { result: { slots: [], message: `Nothing open in that window on ${formatDay(open[0], tz)}.`, other_openings: open.slice(0, 3).map(s => formatTime(s, tz)) } }
    }
    const pool = filtering ? filtered : open
    const pick = pool.length <= 4 ? pool : [0, 1, 2, 3].map(i => pool[Math.round((i * (pool.length - 1)) / 3)])
    return {
      result: {
        day: formatDay(pick[0], tz),
        slots_voice: pick.map(s => formatTime(s, tz)),
        slots_iso: pick.map(s => s.toISOString()),
        timezone: tz,
        open_count: pool.length,
        open_between: `${formatTime(pool[0], tz)} and ${formatTime(pool[pool.length - 1], tz)}`,
        ...(pool.length > pick.length ? { note: "A sample is listed. To check a specific time, call again with part_of_day or after_time." } : {}),
      },
    }
  }

  if (name === "book_appointment") {
    const customer = String(args.customer_name ?? "").trim()
    const phone = String(args.customer_phone ?? "").trim()
    const service = String(args.service_type ?? "").trim()
    const start = new Date(String(args.slot ?? ""))
    if (!customer || !phone || !service || !args.slot) return { result: { error: "Need name, phone, service, and time to book." } }
    if (Number.isNaN(start.getTime())) return { result: { error: "That time didn't come through. Ask the caller to confirm it." } }
    if (start.getTime() <= Date.now()) return { result: { error: "That time has already passed. Offer a later slot." } }

    const { duration } = slotMinutes(business)
    if (bookingAt(start, bookings, duration)) {
      // Someone (usually an earlier test call) already has it: offer the
      // next open slots that day instead.
      const alternatives = openSlots(business, isoDate(start, tz), bookings).slice(0, 3)
      return {
        result: {
          success: false,
          error: "That slot was just booked by another caller. Apologize, say it's taken, and offer one of these times instead.",
          slots_voice: alternatives.map(s => formatTime(s, tz)),
          slots_iso: alternatives.map(s => s.toISOString()),
        },
      }
    }

    const booking: SpikeBooking = {
      id: crypto.randomUUID(),
      name: customer,
      phone,
      service,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration * 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    }
    writeBookings(business.id, [...bookings, booking])
    return {
      result: { success: true, appointment_id: booking.id, message: `Booked! ${service} for ${formatDay(start, tz)} at ${formatTime(start, tz)}.` },
      booking,
    }
  }

  if (name === "capture_lead") {
    return { result: { success: true, message: "Saved. Someone from the team will call back within 30 minutes." } }
  }

  return { result: { error: "Unknown tool" } }
}
