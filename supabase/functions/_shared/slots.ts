// Pure scheduling helpers (no network / Deno APIs) so they can be unit tested.

export interface OperatingHours {
  open?: string;
  close?: string;
  lunch_break?: string | null;
  closed?: boolean;
}

export interface Range {
  start: Date;
  end: Date;
}

export function parseTimeOfDay(timeStr: string): { hours: number; minutes: number } {
  const t = timeStr.trim().toLowerCase();
  const ampm = t.match(/^(\d+)(?::(\d+))?\s*(am|pm)$/);
  if (ampm) {
    let hours = parseInt(ampm[1]);
    const minutes = parseInt(ampm[2] ?? "0");
    if (ampm[3] === "pm" && hours !== 12) hours += 12;
    if (ampm[3] === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return { hours: parseInt(hhmm[1]), minutes: parseInt(hhmm[2]) };
  return { hours: 0, minutes: 0 };
}

/** UTC offset in minutes of `timezone` at instant `date` (negative west of UTC). */
export function tzOffsetMinutes(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((acc, x) => {
    if (x.type !== "literal") acc[x.type] = x.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    +p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second,
  );
  return (asUtc - date.getTime()) / 60000;
}

/** Real UTC Date for wall-clock `hours:minutes` on calendar `dateStr` (YYYY-MM-DD) in `timezone`. */
export function zonedDateTimeToUtc(dateStr: string, hours: number, minutes: number, timezone: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n));
  const guess = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
  // Two passes so we land correctly across DST transitions.
  const first = new Date(guess.getTime() - tzOffsetMinutes(guess, timezone) * 60000);
  return new Date(guess.getTime() - tzOffsetMinutes(first, timezone) * 60000);
}

/** "12:00-13:00" / "12pm-1pm" -> range on the given date, or null. */
export function lunchRange(dateStr: string, lunch: string | null | undefined, timezone: string): Range | null {
  if (!lunch) return null;
  const m = lunch.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (!m) return null;
  const a = parseTimeOfDay(m[1]);
  const b = parseTimeOfDay(m[2]);
  return {
    start: zonedDateTimeToUtc(dateStr, a.hours, a.minutes, timezone),
    end: zonedDateTimeToUtc(dateStr, b.hours, b.minutes, timezone),
  };
}

export function overlaps(aStart: Date, aEnd: Date, ranges: Range[]): boolean {
  return ranges.some((r) => aStart < r.end && aEnd > r.start);
}

export function generateSlots(
  open: Date,
  close: Date,
  slotMinutes: number,
  bufferMinutes: number,
  busy: Range[],
  now: Date = new Date(),
  minLeadMinutes = 60,
): Date[] {
  const slots: Date[] = [];
  const earliest = new Date(now.getTime() + minLeadMinutes * 60000);
  const step = (slotMinutes + bufferMinutes) * 60000;
  let cursor = new Date(open);
  while (cursor < close) {
    const end = new Date(cursor.getTime() + slotMinutes * 60000);
    if (end > close) break;
    if (cursor >= earliest && !overlaps(cursor, end, busy)) slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + step);
  }
  return slots;
}

export function formatSlotForVoice(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export function formatDayLabel(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(d);
}

export function formatSlotLong(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

/** Slot length in minutes for a service name, falling back to the business default. */
export function slotMinutesFor(
  settings: { service_details?: { name: string; duration_minutes: number }[]; slot_duration_default?: number },
  serviceType?: string,
): number {
  const fallback = settings.slot_duration_default ?? 60;
  if (!serviceType || !settings.service_details?.length) return fallback;
  const q = serviceType.toLowerCase();
  const hit = settings.service_details.find(
    (s) => q.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(q),
  );
  return hit?.duration_minutes ?? fallback;
}
