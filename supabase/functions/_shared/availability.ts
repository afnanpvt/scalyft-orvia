// Busy-time lookup used by both check-availability and book-appointment so
// the two can never disagree: Orvia's own appointments + the owner's Google Calendar.

import { getBusy } from "./gcal.ts";
import type { Range } from "./slots.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface BusyResult {
  busy: Range[];
  calendarChecked: boolean; // true only if Google Calendar was actually read
  calendarId: string | null;
}

export async function getBusyRanges(
  supabase: Supa,
  businessId: string,
  settings: { calendar_id?: string; slot_duration_default?: number },
  from: Date,
  to: Date,
): Promise<BusyResult> {
  const { data: appts } = await supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end")
    .eq("business_id", businessId)
    .gte("scheduled_start", new Date(from.getTime() - 24 * 3600_000).toISOString())
    .lte("scheduled_start", to.toISOString())
    .in("status", ["confirmed", "rescheduled"]);

  const fallbackMin = settings.slot_duration_default ?? 60;
  const busy: Range[] = (appts ?? []).map((a: { scheduled_start: string; scheduled_end: string | null }) => ({
    start: new Date(a.scheduled_start),
    end: a.scheduled_end
      ? new Date(a.scheduled_end)
      : new Date(new Date(a.scheduled_start).getTime() + fallbackMin * 60000),
  }));

  const calendarId = settings.calendar_id ?? null;
  let calendarChecked = false;
  if (calendarId) {
    const g = await getBusy(calendarId, from, to);
    if (g) {
      busy.push(...g);
      calendarChecked = true;
    }
  }
  return { busy, calendarChecked, calendarId };
}
