import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorized, verifyVapiRequest } from "../_shared/auth.ts";
import { getBusyRanges } from "../_shared/availability.ts";
import { parseToolCall, toolResponse, json } from "../_shared/vapi.ts";
import {
  formatDayLabel, formatSlotForVoice, generateSlots, lunchRange, parseTimeOfDay,
  slotMinutesFor, zonedDateTimeToUtc, type OperatingHours,
} from "../_shared/slots.ts";

// Vapi tool: check_availability
// Real availability = business hours - lunch - Orvia appointments - Google Calendar busy time.

const NAME = "check_availability";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const raw = await req.text();
  if (!(await verifyVapiRequest(req, raw))) return unauthorized();

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const { toolCallId, args } = parseToolCall(body);
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id") ?? (args.business_id as string | undefined);
  const date = args.date as string | undefined;
  const serviceType = args.service_type as string | undefined;

  if (!businessId) return toolResponse(toolCallId, NAME, { error: "I can't pull up the schedule right now. Let me take your details instead." });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return toolResponse(toolCallId, NAME, { error: "What date would you like me to check?" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: biz } = await supabase
    .from("businesses").select("settings, timezone").eq("id", businessId).single();
  if (!biz) return toolResponse(toolCallId, NAME, { error: "Business not found" });

  const settings = biz.settings ?? {};
  const timezone = biz.timezone ?? "America/Chicago";
  const slotMinutes = slotMinutesFor(settings, serviceType);
  const buffer = settings.buffer_between_appointments ?? 15; // travel time between jobs

  const dayName = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
    .format(new Date(`${date}T12:00:00Z`)).toLowerCase();

  const dayHours: OperatingHours | undefined = settings.operating_hours?.[dayName];
  if (dayHours?.closed) {
    return toolResponse(toolCallId, NAME, { slots: [], message: "We're closed that day. Offer another day, or take a message for an emergency callback." });
  }
  const o = parseTimeOfDay(dayHours?.open ?? "08:00");
  const c = parseTimeOfDay(dayHours?.close ?? "17:00");
  const open = zonedDateTimeToUtc(date, o.hours, o.minutes, timezone);
  const close = zonedDateTimeToUtc(date, c.hours, c.minutes, timezone);

  const { busy, calendarChecked } = await getBusyRanges(supabase, businessId, settings, open, close);
  const lunch = lunchRange(date, dayHours?.lunch_break, timezone);
  if (lunch) busy.push(lunch);

  let slots = generateSlots(open, close, slotMinutes, buffer, busy);

  // Optional per-day cap on bookings
  if (settings.max_appointments_per_day) {
    const dayStart = zonedDateTimeToUtc(date, 0, 0, timezone).toISOString();
    const dayEnd = zonedDateTimeToUtc(date, 23, 59, timezone).toISOString();
    const { count } = await supabase.from("appointments").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).gte("scheduled_start", dayStart).lte("scheduled_start", dayEnd)
      .in("status", ["confirmed", "rescheduled"]);
    if ((count ?? 0) >= settings.max_appointments_per_day) slots = [];
  }

  if (slots.length === 0) {
    return toolResponse(toolCallId, NAME, { slots: [], message: "No openings that day. Offer the next day or capture a callback." });
  }

  const top = slots.slice(0, 4);
  return toolResponse(toolCallId, NAME, {
    day: formatDayLabel(top[0], timezone),
    slots_voice: top.map((s) => formatSlotForVoice(s, timezone)),
    slots_iso: top.map((s) => s.toISOString()),
    timezone,
    calendar_checked: calendarChecked,
  });
});
