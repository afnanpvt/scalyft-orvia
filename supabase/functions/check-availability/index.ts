import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Returns available appointment slots for a given date.
// Called by Vapi tool mid-call via n8n webhook proxy or directly.
//
// Request body: { clinic_id: string, date: string (YYYY-MM-DD), service_type?: string }
// Response: { slots: string[] } - ISO 8601 datetimes of free slots

interface RequestBody {
  clinic_id?: string;
  date?: string;
  service_type?: string;
  // Vapi also passes these when tool args are spread directly
  toolCallId?: string;
}

interface OperatingHours {
  open?: string;
  close?: string;
  lunch_break?: string | null;
  closed?: boolean;
}

function parseTime(timeStr: string, baseDate: Date): Date {
  // Parses "9am", "9:30am", "14:00" etc. relative to baseDate
  const t = timeStr.trim().toLowerCase();
  let hours = 0;
  let minutes = 0;

  const ampm = t.match(/^(\d+)(?::(\d+))?\s*(am|pm)$/);
  if (ampm) {
    hours = parseInt(ampm[1]);
    minutes = parseInt(ampm[2] ?? "0");
    if (ampm[3] === "pm" && hours !== 12) hours += 12;
    if (ampm[3] === "am" && hours === 12) hours = 0;
  } else {
    const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      hours = parseInt(hhmm[1]);
      minutes = parseInt(hhmm[2]);
    }
  }

  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function generateSlots(
  open: Date,
  close: Date,
  slotDuration: number,
  bufferMinutes: number,
  bookedRanges: Array<{ start: Date; end: Date }>
): Date[] {
  const slots: Date[] = [];
  const now = new Date();
  let cursor = new Date(open);

  while (cursor < close) {
    const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);
    if (slotEnd > close) break;

    // Skip past slots
    if (cursor <= now) {
      cursor = new Date(cursor.getTime() + slotDuration * 60000);
      continue;
    }

    // Check no overlap with booked appointments
    const overlaps = bookedRanges.some(
      (b) => cursor < b.end && slotEnd > b.start
    );

    if (!overlaps) {
      slots.push(new Date(cursor));
    }

    cursor = new Date(cursor.getTime() + (slotDuration + bufferMinutes) * 60000);
  }

  return slots;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase credentials" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // clinic_id can come from the request body OR the query string
  // (assistant-request embeds clinic_id as ?clinic_id= in the tool server URL)
  const url = new URL(req.url);
  const clinic_id = body.clinic_id ?? url.searchParams.get("clinic_id") ?? undefined;
  const { date } = body;

  if (!clinic_id || !date) {
    return new Response(
      JSON.stringify({ error: "Missing clinic_id or date" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(
      JSON.stringify({ error: "date must be YYYY-MM-DD" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load clinic settings for hours and slot config
  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .select("settings, timezone")
    .eq("id", clinic_id)
    .single();

  if (clinicErr || !clinic) {
    return new Response(
      JSON.stringify({ error: "Clinic not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const settings = clinic.settings ?? {};
  const timezone = clinic.timezone ?? "Asia/Kolkata";
  const slotDuration = settings.slot_duration_default ?? 30;
  const buffer = settings.buffer_between_appointments ?? 5;

  // Determine open/close for the requested date
  const requestedDate = new Date(`${date}T00:00:00`);
  const dayName = requestedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

  let openTime: Date | null = null;
  let closeTime: Date | null = null;

  if (settings.operating_hours?.[dayName]) {
    const dayHours: OperatingHours = settings.operating_hours[dayName];
    if (dayHours.closed) {
      return new Response(
        JSON.stringify({ slots: [], message: "Clinic is closed on this day" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (dayHours.open && dayHours.close) {
      openTime = parseTime(dayHours.open, requestedDate);
      closeTime = parseTime(dayHours.close, requestedDate);
    }
  } else if (settings.hours) {
    // Fallback: parse simple "10am-7pm Mon-Sat" format
    const match = settings.hours.match(/(\d+(?::\d+)?(?:am|pm)?)\s*[-–]\s*(\d+(?::\d+)?(?:am|pm)?)/i);
    if (match) {
      openTime = parseTime(match[1], requestedDate);
      closeTime = parseTime(match[2], requestedDate);
    }
    // Check if day is in range (e.g., Mon-Sat = not Sunday)
    if (dayName === "sunday" && settings.hours.toLowerCase().includes("mon-sat")) {
      return new Response(
        JSON.stringify({ slots: [], message: "Clinic is closed on Sundays" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Default hours if none configured
  if (!openTime || !closeTime) {
    openTime = parseTime("10:00", requestedDate);
    closeTime = parseTime("19:00", requestedDate);
  }

  // Load existing appointments for the day
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end")
    .eq("clinic_id", clinic_id)
    .gte("scheduled_start", dayStart)
    .lte("scheduled_start", dayEnd)
    .in("status", ["confirmed", "rescheduled"]);

  const bookedRanges = (appointments ?? []).map((a) => ({
    start: new Date(a.scheduled_start),
    end: a.scheduled_end
      ? new Date(a.scheduled_end)
      : new Date(new Date(a.scheduled_start).getTime() + slotDuration * 60000),
  }));

  const availableSlots = generateSlots(openTime, closeTime, slotDuration, buffer, bookedRanges);

  // Return ISO strings with timezone offset hint
  const slotStrings = availableSlots.map((s) => s.toISOString());

  return new Response(
    JSON.stringify({
      slots: slotStrings,
      timezone,
      slot_duration_minutes: slotDuration,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
