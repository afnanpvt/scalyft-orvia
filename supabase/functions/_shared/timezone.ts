// Timezone helpers shared by check-availability (slot generation) and
// book-appointment (slot parsing). Everything is anchored to the business's
// timezone, never the runtime's (Deno Deploy runs in UTC).

// Compute the UTC offset (in minutes) for a given timezone at a given moment.
// Positive for east of UTC (e.g. +120 for CEST), negative for west (e.g. -300 for CDT).
export function tzOffsetMinutes(date: Date, timezone: string): number {
  // Format the same instant in the target TZ and in UTC, then diff.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    parseInt(parts.year),
    parseInt(parts.month) - 1,
    parseInt(parts.day),
    parseInt(parts.hour === "24" ? "0" : parts.hour),
    parseInt(parts.minute),
    parseInt(parts.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

// Build a real UTC Date for a wall-clock time in the given timezone on the given calendar date.
// `dateStr` is YYYY-MM-DD (interpreted in the business's local calendar).
export function zonedDateTimeToUtc(dateStr: string, hours: number, minutes: number, timezone: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n));
  // First guess: treat the wall-clock as if it were UTC
  const guess = Date.UTC(y, m - 1, d, hours, minutes, 0);
  // Then correct by the TZ offset at that instant
  const offset = tzOffsetMinutes(new Date(guess), timezone);
  const first = guess - offset * 60000;
  // On DST-change days the offset at the guess can differ from the offset at
  // the real instant (e.g. 7:00 AM Chicago on spring-forward day). Re-check once.
  const settled = tzOffsetMinutes(new Date(first), timezone);
  return new Date(settled === offset ? first : guess - settled * 60000);
}

// "2026-10-05T10:00", "2026-10-05T10:00:00", "2026-10-05 10:00:00.000": a
// wall-clock time with no Z or ±HH:MM offset.
const WALL_CLOCK_SLOT = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

// Parse a booking slot from an AI tool call. Slots copied from
// check-availability's `slots_iso` carry a Z and pass through unchanged, but a
// model composing the time itself often omits the offset, and `new Date()`
// would read that as UTC. Treat offset-less times as business-local wall clock.
// Seconds are dropped (slots are minute-aligned). Returns an Invalid Date if
// the slot can't be parsed.
export function parseSlot(slot: string, timezone: string): Date {
  const s = String(slot).trim();
  const wall = s.match(WALL_CLOCK_SLOT);
  if (!wall) return new Date(s);
  return zonedDateTimeToUtc(wall[1], parseInt(wall[2]), parseInt(wall[3]), timezone);
}
