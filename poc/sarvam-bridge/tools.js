// Mock booking tools for the voice test. Same names and arguments as Orvia's real
// check_availability / book_appointment (see src/lib/vapi/build-assistant-config.ts),
// so pointing the assistant at the real Supabase functions is a URL + auth swap.
// State is in memory: restart the bridge and the bookings are gone.

const TZ = "+05:30"; // IST
const OPEN_MIN = 10 * 60;
const CLOSE_MIN = 19 * 60;
const LUNCH = [13 * 60, 14 * 60];
const STEP = 30;

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const pad = (n) => String(n).padStart(2, "0");

function voiceLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

function istNowMinutes(now) {
  const t = new Date(now.getTime() + 330 * 60000);
  return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

// "2026-10-08T17:00:00+05:30" -> { date, min }. Reads the clock digits as written.
function parseSlot(slot) {
  const m = /(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(slot || ""));
  return m ? { date: m[1], min: Number(m[2]) * 60 + Number(m[3]) } : null;
}

function openSlots(date, bookings, now = new Date()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : null;
  if (!d) return { error: "date must be YYYY-MM-DD" };
  const [y, mo, da] = d.split("-").map(Number);
  if (new Date(Date.UTC(y, mo - 1, da)).getUTCDay() === 0) return { slots: [], slots_voice: [], message: "We're closed on Sundays." };
  const today = istNowMinutes(now);
  if (d < today.date) return { slots: [], slots_voice: [], message: "That date has already passed." };

  const taken = new Set(bookings.filter((b) => parseSlot(b.slot)?.date === d).map((b) => parseSlot(b.slot).min));
  const out = [];
  for (let min = OPEN_MIN; min + STEP <= CLOSE_MIN; min += STEP) {
    if (min >= LUNCH[0] && min < LUNCH[1]) continue;
    if (d === today.date && min < today.min + 60) continue; // need an hour of notice
    if (taken.has(min)) continue;
    if (hash(`${d}-${min}`) % 100 < 35) continue; // the clinic already has patients
    out.push(min);
  }
  // Spread the offer across the day instead of returning four back-to-back slots.
  const pick = out.length <= 4 ? out : [out[0], out[Math.floor(out.length / 3)], out[Math.floor((2 * out.length) / 3)], out[out.length - 1]];
  return {
    slots: pick.map((m) => `${d}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00${TZ}`),
    slots_voice: pick.map(voiceLabel),
    message: pick.length ? undefined : "No openings on that date.",
  };
}

function book(args, bookings, callId, now = new Date()) {
  const name = args.customer_name ?? args.patient_name;
  const phone = args.customer_phone ?? args.patient_phone;
  if (!name || !phone || !args.service_type || !args.slot) {
    return { error: "Need name, phone, service, and time to book." };
  }
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) {
    return { error: "That phone number looks incomplete. Ask the caller to say all ten digits again, then book." };
  }
  const want = parseSlot(args.slot);
  if (!want) return { error: "slot must be an ISO 8601 datetime like 2026-10-08T17:00:00+05:30" };
  const still = openSlots(want.date, bookings, now);
  const ok = (still.slots || []).some((s) => parseSlot(s).min === want.min);
  if (!ok) return { error: "That time is not available. Call check_availability and offer another slot." };
  const slot = `${want.date}T${pad(Math.floor(want.min / 60))}:${pad(want.min % 60)}:00${TZ}`;
  const booking = {
    id: `bk_${bookings.length + 1}`,
    name: String(name),
    phone: String(phone),
    service: String(args.service_type),
    slot,
    when: `${want.date} ${voiceLabel(want.min)}`,
    notes: args.notes ? String(args.notes) : "",
    callId: callId || null,
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  return { success: true, message: `Booked ${booking.service} for ${booking.name} on ${booking.when}. An SMS confirmation will be sent.`, booking };
}

module.exports = { openSlots, book, parseSlot, voiceLabel };
