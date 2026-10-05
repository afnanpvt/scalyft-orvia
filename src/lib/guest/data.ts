import type { Appointment, Business, Call, Lead, OperationalEvent, CallQueueItem, TranscriptTurn } from "@/lib/types"
import { NICHE_PRESETS } from "@/lib/niche-presets"
import type { Niche } from "@/lib/vapi/niche-profiles"
import { getGuestNiche } from "@/lib/guest/session"
import { readBookings, type SpikeBooking } from "@/lib/gemini/spike-calendar"

// Everything a guest sees. The guest has no tenant, so this stands in for the
// Supabase tables: a generic business of the chosen type with a week of
// believable history, plus whatever the guest does during their own calls.
// It lives in localStorage and is never sent anywhere.

const DAY = 86_400_000
const STORAGE_PREFIX = "orvia.guest.data.v2." // v2: lighter seed; old seeds are ignored

// The dashboard shows every time in the visitor's own time zone, so a guest's
// business runs on it too. Opening hours, "tomorrow morning" and the times in
// the Appointments list then all agree.
function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } catch { return "UTC" }
}

// ─── Business ────────────────────────────────────────────

export function guestBusiness(niche: Niche): Business {
  const preset = NICHE_PRESETS.find(p => p.id === niche) ?? NICHE_PRESETS[0]
  const india = preset.settings.demo_region === "in"
  const now = new Date().toISOString()
  return {
    id: `guest-${niche}`,
    name: preset.businessName,
    slug: `guest-${niche}`,
    phone_display: india ? "+91 80 4000 1000" : "+1 (555) 010-0100",
    vapi_phone_id: "guest",
    vapi_assistant_id: null,
    timezone: browserTimezone(),
    // "simulated" so the guest's bookings never depend on a real calendar.
    settings: { ...preset.settings, scheduling_mode: "simulated" },
    status: "active",
    seconds_remaining: 300 * 60,
    allow_overage: true,
    owner_phone: null,
    created_at: now,
    updated_at: now,
  }
}

// ─── Seeded history ──────────────────────────────────────

interface Store {
  seededOn: string // local YYYY-MM-DD the timestamps were generated against
  calls: Call[]
  appointments: Appointment[]
  leads: Lead[]
}

const NAMES = {
  in: ["Ananya Rao", "Rohan Mehta", "Kavya Nair", "Vikram Singh", "Sneha Patil", "Arjun Reddy", "Divya Menon", "Karthik Iyer", "Meera Joshi", "Aditya Kulkarni", "Pooja Shetty", "Suresh Gowda"],
  us: ["Emily Carter", "Marcus Johnson", "Sofia Ramirez", "Daniel Kim", "Olivia Brooks", "Tyler Nguyen", "Hannah Patel", "Jordan Reyes", "Megan Foster", "Brandon Hughes", "Lauren Bell", "Chris Walker"],
}

// Small deterministic PRNG so a niche's seed is stable between visits.
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function transcriptFor(opts: {
  outcome: "appointment_booked" | "lead_captured" | "info_given" | "transferred"
  business: Business; service: string; name: string; slotText: string; faq: string
}): TranscriptTurn[] {
  const { outcome, business, service, name, slotText, faq } = opts
  const first = name.split(" ")[0]
  const hello: TranscriptTurn = { role: "assistant", content: `Thanks for calling ${business.name}, how can I help you today?` }
  if (outcome === "appointment_booked") return [
    hello,
    { role: "user", content: `Hi, I'd like to book ${service.toLowerCase()}.` },
    { role: "assistant", content: "Of course. What day works best for you?" },
    { role: "user", content: "Whenever you have something in the next few days." },
    { role: "assistant", content: `I have ${slotText} open. Does that work?` },
    { role: "user", content: `Yes, that works. It's ${name}.` },
    { role: "assistant", content: `You're all set, ${first}. ${service}, ${slotText}. We'll see you then.` },
  ]
  if (outcome === "lead_captured") return [
    hello,
    { role: "user", content: `I'm looking for ${service.toLowerCase()}, but I'm not ready to book yet.` },
    { role: "assistant", content: "No problem. Can I take your name and number so someone can call you back?" },
    { role: "user", content: `Sure, it's ${name}.` },
    { role: "assistant", content: `Thanks, ${first}. Someone will call you back within 30 minutes.` },
  ]
  if (outcome === "transferred") return [
    hello,
    { role: "user", content: `This is urgent, I need help with ${service.toLowerCase()} right now.` },
    { role: "assistant", content: "I'm sorry to hear that. Let me connect you directly with the team." },
  ]
  return [
    hello,
    { role: "user", content: "Quick question before I decide." },
    { role: "assistant", content: faq },
    { role: "user", content: "Great, thank you. That's all I needed." },
    { role: "assistant", content: "Anytime. Have a great day!" },
  ]
}

function seed(niche: Niche): Store {
  const business = guestBusiness(niche)
  const r = rng(niche)
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]
  const india = business.settings.demo_region === "in"
  const names = india ? NAMES.in : NAMES.us
  const services = business.settings.service_details ?? []
  const direct = services.filter(s => s.can_book_directly)
  const faq = business.settings.faq?.[0]?.answer ?? "We're open Monday to Saturday. Happy to help with anything else."
  const phone = () => india
    ? `+91 ${98 + Math.floor(r() * 2)}${String(Math.floor(r() * 1e8)).padStart(8, "0")}`
    : `+1 (512) 555-${String(Math.floor(r() * 9000) + 1000)}`

  const now = Date.now()
  const calls: Call[] = []
  const appointments: Appointment[] = []
  const leads: Lead[] = []
  let n = 0

  for (let d = 6; d >= 0; d--) {
    const count = d === 0 ? 2 : 2 + Math.floor(r() * 3) // light: a week reads as ~20 calls, not 50
    for (let k = 0; k < count; k++) {
      const day = new Date(now - d * DAY)
      day.setHours(8 + Math.floor(r() * 10), Math.floor(r() * 60), Math.floor(r() * 60), 0)
      let at = day.getTime()
      if (at > now - 20 * 60_000) at = now - (20 + k * 45) * 60_000 // today's calls stay in the past
      const roll = r()
      const outcome = roll < 0.38 ? "appointment_booked" : roll < 0.58 ? "lead_captured" : roll < 0.84 ? "info_given" : roll < 0.94 ? "missed" : "transferred"
      const callerName = pick(names)
      const svc = (outcome === "appointment_booked" ? pick(direct.length ? direct : services) : pick(services)) ?? { name: "General enquiry" }
      const id = `guest-seed-${n++}`
      const missed = outcome === "missed"
      const duration = missed ? null : 40 + Math.floor(r() * 200)
      const createdAt = new Date(at).toISOString()

      let summary = ""
      let apptId: string | null = null
      if (outcome === "appointment_booked") {
        const when = new Date(at + (1 + Math.floor(r() * 4)) * DAY)
        when.setHours(9 + Math.floor(r() * 8), r() < 0.5 ? 0 : 30, 0, 0)
        const end = new Date(when.getTime() + 45 * 60_000)
        apptId = `guest-appt-${appointments.length}`
        appointments.push({
          id: apptId, business_id: business.id, lead_id: null, call_id: id,
          customer_name: callerName, customer_phone: "", service_type: svc.name,
          scheduled_start: when.toISOString(), scheduled_end: end.toISOString(), notes: null,
          status: when.getTime() < now ? "completed" : "confirmed", google_cal_event_id: null,
          created_at: createdAt, updated_at: createdAt,
        })
        summary = `${svc.name} for ${callerName.split(" ")[0]}, booked ${when.toLocaleDateString("en-US", { weekday: "short" })} ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
      } else if (outcome === "lead_captured") {
        summary = `Asked about ${svc.name.toLowerCase()}, callback requested.`
        leads.push({
          id: `guest-lead-${leads.length}`, business_id: business.id, call_id: id, name: callerName, phone: "", email: null,
          service_needed: svc.name, urgency: r() < 0.25 ? "urgent" : "routine", notes: null,
          status: d >= 3 && r() < 0.6 ? "contacted" : "new", created_at: createdAt, updated_at: createdAt,
        })
      } else if (outcome === "transferred") {
        summary = `Urgent ${svc.name.toLowerCase()} request, transferred to the team.`
      } else if (missed) {
        summary = "Missed call, no voicemail."
      } else {
        summary = `Asked a question about ${svc.name.toLowerCase()}, answered.`
      }

      const callerPhone = phone()
      const appt = apptId ? appointments[appointments.length - 1] : null
      if (appt) appt.customer_phone = callerPhone
      const lead = outcome === "lead_captured" ? leads[leads.length - 1] : null
      if (lead) lead.phone = callerPhone

      const slotText = appt
        ? `${new Date(appt.scheduled_start).toLocaleDateString("en-US", { weekday: "long" })} at ${new Date(appt.scheduled_start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : ""
      calls.push({
        id, business_id: business.id, vapi_call_id: null, caller_phone: callerPhone, language_detected: "en",
        status: missed ? "missed" : outcome === "transferred" ? "transferred" : "completed",
        started_at: missed ? null : createdAt,
        ended_at: missed || !duration ? null : new Date(at + duration * 1000).toISOString(),
        duration_secs: duration,
        transcript: missed ? null : transcriptFor({ outcome, business, service: svc.name, name: callerName, slotText, faq }),
        summary, recording_url: null,
        extracted_data: { caller_name: callerName, service_needed: svc.name },
        outcome: outcome as Call["outcome"], cost_cents: 0, transcript_status: missed ? "pending" : "complete",
        ai_failure_reason: null, was_concurrent: false, webhook_received_at: null, created_at: createdAt,
      })
    }
  }

  // "Coming up" should never look empty: if fewer than 3 bookings are in the
  // future, move the most recent past ones forward a few days.
  const MIN_UPCOMING = 3
  const upcoming = () => appointments.filter(a => new Date(a.scheduled_start).getTime() >= now).length
  const pastFirst = appointments
    .filter(a => new Date(a.scheduled_start).getTime() < now)
    .sort((a, b) => b.scheduled_start.localeCompare(a.scheduled_start))
  for (const a of pastFirst) {
    if (upcoming() >= MIN_UPCOMING) break
    const start = new Date(a.scheduled_start)
    do { start.setDate(start.getDate() + 3) } while (start.getTime() < now)
    a.scheduled_start = start.toISOString()
    a.scheduled_end = new Date(start.getTime() + 45 * 60_000).toISOString()
    a.status = "confirmed"
  }

  calls.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { seededOn: localDate(), calls, appointments, leads }
}

// Shift every timestamp forward by whole days, so a guest returning tomorrow
// still sees "the last 7 days" and upcoming appointments.
function rebase(store: Store, days: number): Store {
  const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + days * DAY).toISOString() : iso)
  return {
    seededOn: localDate(),
    calls: store.calls.map(c => ({ ...c, created_at: shift(c.created_at)!, started_at: shift(c.started_at), ended_at: shift(c.ended_at) })),
    appointments: store.appointments.map(a => ({
      ...a, created_at: shift(a.created_at)!, updated_at: shift(a.updated_at)!,
      scheduled_start: shift(a.scheduled_start)!, scheduled_end: shift(a.scheduled_end),
      status: a.status === "confirmed" || a.status === "completed" ? (new Date(shift(a.scheduled_start)!).getTime() < Date.now() ? "completed" : "confirmed") : a.status,
    })),
    leads: store.leads.map(l => ({ ...l, created_at: shift(l.created_at)!, updated_at: shift(l.updated_at)! })),
  }
}

let memoryStores = new Map<Niche, Store>()

function load(niche: Niche): Store {
  const key = STORAGE_PREFIX + niche
  let store: Store | null = null
  try {
    const raw = localStorage.getItem(key)
    if (raw) store = JSON.parse(raw) as Store
  } catch { /* corrupt or unavailable: reseed */ }
  store ??= memoryStores.get(niche) ?? null
  if (!store) {
    store = seed(niche)
    save(niche, store)
  } else if (store.seededOn !== localDate()) {
    const days = Math.round((new Date(localDate()).getTime() - new Date(store.seededOn).getTime()) / DAY)
    store = rebase(store, Math.max(days, 0))
    save(niche, store)
  }
  return store
}

function save(niche: Niche, store: Store) {
  memoryStores.set(niche, store)
  try { localStorage.setItem(STORAGE_PREFIX + niche, JSON.stringify(store)) } catch { /* storage full or unavailable */ }
}

export function resetGuestData(niche: Niche) {
  memoryStores = new Map()
  try { localStorage.removeItem(STORAGE_PREFIX + niche) } catch { /* ignore */ }
}

// ─── Records created by the guest's own calls ────────────

export function recordGuestCall(input: {
  transcript: TranscriptTurn[]
  durationSecs: number
  booking: SpikeBooking | null
}) {
  const niche = getGuestNiche()
  if (!niche || input.transcript.length === 0) return
  const store = load(niche)
  const business = guestBusiness(niche)
  const now = new Date()
  const callerLine = input.transcript.find(t => t.role === "user")?.content ?? ""
  const caller = input.booking?.name ?? null
  const summary = input.booking
    ? `${input.booking.service} for ${input.booking.name.split(" ")[0]}, booked ${new Date(input.booking.start).toLocaleDateString("en-US", { weekday: "short" })} ${new Date(input.booking.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone })}.`
    : callerLine ? `${callerLine.slice(0, 70)}${callerLine.length > 70 ? "…" : ""}` : "Hung up after the greeting."
  const call: Call = {
    id: `guest-call-${crypto.randomUUID()}`, business_id: business.id, vapi_call_id: null, caller_phone: null, language_detected: "en",
    status: "completed", started_at: new Date(now.getTime() - input.durationSecs * 1000).toISOString(), ended_at: now.toISOString(),
    duration_secs: input.durationSecs, transcript: input.transcript, summary, recording_url: null,
    extracted_data: { source: "web", ...(caller ? { caller_name: caller } : {}) },
    outcome: input.booking ? "appointment_booked" : input.durationSecs < 20 ? null : "info_given",
    cost_cents: 0, transcript_status: "complete", ai_failure_reason: null, was_concurrent: false,
    webhook_received_at: null, created_at: new Date(now.getTime() - input.durationSecs * 1000).toISOString(),
  }
  save(niche, { ...store, calls: [call, ...store.calls] })
}

// ─── Reads (mirror src/lib/api.ts) ───────────────────────

function nicheOrThrow(): Niche {
  const n = getGuestNiche()
  if (!n) throw new Error("Not in guest mode")
  return n
}

// Bookings the guest made on their own calls, shaped like appointments.
function spikeAppointments(business: Business): Appointment[] {
  return readBookings(business.id).map(b => ({
    id: `guest-booking-${b.id}`, business_id: business.id, lead_id: null, call_id: null,
    customer_name: b.name, customer_phone: b.phone, service_type: b.service,
    scheduled_start: b.start, scheduled_end: b.end, notes: null,
    status: new Date(b.end).getTime() < Date.now() ? "completed" as const : "confirmed" as const,
    google_cal_event_id: null, created_at: b.createdAt, updated_at: b.createdAt,
  }))
}

function everything() {
  const niche = nicheOrThrow()
  const store = load(niche)
  const business = guestBusiness(niche)
  const appointments = [...store.appointments, ...spikeAppointments(business)]
  return { niche, store, business, calls: store.calls, appointments, leads: store.leads }
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const ts = (iso: string) => new Date(iso).getTime()

export const guestApi = {
  getBusiness: (): Business => guestBusiness(nicheOrThrow()),

  getBilling: () => {
    const b = guestBusiness(nicheOrThrow())
    return { seconds_remaining: b.seconds_remaining, allow_overage: b.allow_overage, owner_phone: null, status: b.status, vapi_phone_id: b.vapi_phone_id }
  },

  getOverviewStats() {
    const { calls, leads, appointments } = everything()
    const t = startOfToday()
    return {
      callsToday: calls.filter(c => ts(c.created_at) >= t).length,
      leadsToday: leads.filter(l => ts(l.created_at) >= t).length,
      appointmentsToday: appointments.filter(a => ts(a.created_at) >= t).length,
    }
  },

  getRecentCalls: (limit = 5): Call[] => everything().calls.slice(0, limit),

  getCalls(page = 1, pageSize = 20) {
    const { calls } = everything()
    return { calls: calls.slice((page - 1) * pageSize, page * pageSize), total: calls.length }
  },

  getCallById: (id: string): Call | null => everything().calls.find(c => c.id === id) ?? null,

  getLeads(page = 1, pageSize = 20, status?: string) {
    let { leads } = everything()
    if (status && status !== "all") leads = leads.filter(l => l.status === status)
    leads = [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { leads: leads.slice((page - 1) * pageSize, page * pageSize), total: leads.length }
  },

  getLeadByCallId: (callId: string): Lead | null => everything().leads.find(l => l.call_id === callId) ?? null,

  getAppointmentByCallId: (callId: string): Appointment | null => everything().appointments.find(a => a.call_id === callId) ?? null,

  getAppointments(opts?: { range?: "upcoming" | "past" | "all"; status?: Appointment["status"] }): Appointment[] {
    const now = Date.now()
    let list = everything().appointments
    const range = opts?.range ?? "all"
    if (range === "upcoming") list = list.filter(a => ts(a.scheduled_start) >= now)
    if (range === "past") list = list.filter(a => ts(a.scheduled_start) < now)
    if (opts?.status) list = list.filter(a => a.status === opts.status)
    return [...list].sort((a, b) => (range === "past" ? ts(b.scheduled_start) - ts(a.scheduled_start) : ts(a.scheduled_start) - ts(b.scheduled_start))).slice(0, 100)
  },

  updateAppointmentStatus(id: string, status: Appointment["status"]) {
    const niche = nicheOrThrow()
    const store = load(niche)
    save(niche, { ...store, appointments: store.appointments.map(a => (a.id === id ? { ...a, status, updated_at: new Date().toISOString() } : a)) })
    return { error: null }
  },

  getWeeklyCallStats() {
    const { calls, leads, appointments } = everything()
    const out: { date: string; calls: number; leads: number; appointments: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - i); start.setHours(0, 0, 0, 0)
      const s = start.getTime(), e = s + DAY
      const inDay = (iso: string) => ts(iso) >= s && ts(iso) < e
      out.push({
        date: start.toLocaleDateString("en-US", { weekday: "short" }),
        calls: calls.filter(c => inDay(c.created_at)).length,
        leads: leads.filter(l => inDay(l.created_at)).length,
        appointments: appointments.filter(a => inDay(a.created_at)).length,
      })
    }
    return out
  },

  getOutcomeBreakdown() {
    const counts: Record<string, number> = {}
    for (const c of everything().calls) counts[c.outcome ?? "unknown"] = (counts[c.outcome ?? "unknown"] ?? 0) + 1
    return Object.entries(counts).map(([outcome, count]) => ({ outcome: outcome.replace(/_/g, " "), count }))
  },

  getFollowUpQueue: (): Lead[] => {
    const cutoff = Date.now() - 72 * 3_600_000
    return everything().leads.filter(l => ts(l.created_at) >= cutoff && l.status === "new")
  },

  getMissedCallQueue: (): Call[] => {
    const cutoff = Date.now() - 48 * 3_600_000
    return everything().calls.filter(c => c.status === "missed" && ts(c.created_at) >= cutoff)
  },

  getMissedCallHeatmap() {
    const counts: Record<number, number> = {}
    for (const c of everything().calls.filter(c => c.status === "missed")) {
      const h = new Date(c.created_at).getHours()
      counts[h] = (counts[h] ?? 0) + 1
    }
    return Object.entries(counts).map(([hour, count]) => ({ hour: Number(hour), count })).sort((a, b) => b.count - a.count).slice(0, 6)
  },

  getBriefing() {
    const { calls, leads, appointments } = everything()
    const t = startOfToday()
    const now = Date.now()
    const phoneCounts: Record<string, number> = {}
    const recent = calls.slice(0, 10)
    for (const c of recent) if (c.caller_phone) phoneCounts[c.caller_phone] = (phoneCounts[c.caller_phone] ?? 0) + 1
    const durations = recent.filter(c => ts(c.created_at) >= t && c.duration_secs != null).map(c => c.duration_secs as number)
    return {
      callsToday: calls.filter(c => ts(c.created_at) >= t).length,
      leadsToday: leads.filter(l => ts(l.created_at) >= t).length,
      appointmentsToday: appointments.filter(a => ts(a.created_at) >= t).length,
      upcomingAppointments: appointments
        .filter(a => ts(a.scheduled_start) >= now && (a.status === "confirmed" || a.status === "rescheduled"))
        .sort((a, b) => ts(a.scheduled_start) - ts(b.scheduled_start)).slice(0, 20),
      exceptionCalls: calls.filter(c => (c.status === "transferred" || c.status === "failed") && ts(c.created_at) >= t).slice(0, 5),
      recentCalls: recent.map(c => ({ ...c, is_repeat_caller: c.caller_phone ? (phoneCounts[c.caller_phone] ?? 0) > 1 : false })),
      avgCallSecs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      businessStatus: "active" as string | null,
      businessHasPhone: true,
      secondsRemaining: 300 * 60,
      allowOverage: true,
      hasCredits: true,
    }
  },

  getMonthCallStats() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const rows = everything().calls.filter(c => ts(c.created_at) >= monthStart)
    return { calls: rows.length, secs: rows.reduce((s, c) => s + (c.duration_secs ?? 0), 0) }
  },

  getUnresolvedOperationalEvents: (): OperationalEvent[] => [],
  getPendingCallQueue: (): CallQueueItem[] => [],
  noop: () => ({ error: null as string | null }),

  search(q: string) {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const { calls, appointments, leads } = everything()
    const has = (...xs: (string | null | undefined)[]) => xs.some(x => x?.toLowerCase().includes(term))
    return [
      ...calls.filter(c => has(c.caller_phone, c.summary)).slice(0, 8).map(c => ({
        kind: "call" as const, id: c.id, title: c.caller_phone ?? "Test call", subtitle: c.summary ?? c.outcome ?? "Call", href: `/calls/${c.id}`,
      })),
      ...appointments.filter(a => has(a.customer_name, a.customer_phone, a.service_type)).slice(0, 8).map(a => ({
        kind: "appointment" as const, id: a.id, title: a.customer_name,
        subtitle: `${a.service_type ?? "Appointment"} · ${new Date(a.scheduled_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
        href: "/appointments",
      })),
      ...leads.filter(l => has(l.name, l.phone, l.service_needed)).slice(0, 8).map(l => ({
        kind: "lead" as const, id: l.id, title: l.name ?? l.phone, subtitle: `${l.service_needed ?? "Lead"} · ${l.status}`, href: "/leads",
      })),
    ]
  },
}
