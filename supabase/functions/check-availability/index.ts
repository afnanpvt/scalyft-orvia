import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vapi tool: check_availability
// Vapi sends: { message: { toolCallList: [{ id, name, arguments: {...} }] } }
// Returns:    { results: [{ toolCallId, name, result }] }

interface OperatingHours {
  open?: string;
  close?: string;
  lunch_break?: string | null;
  closed?: boolean;
}

function parseTimeOfDay(timeStr: string): { hours: number; minutes: number } {
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
  return { hours, minutes };
}

// Compute the UTC offset (in minutes) for a given timezone at a given moment.
// Positive for east of UTC (e.g. +120 for CEST), negative for west (e.g. -300 for CDT).
function tzOffsetMinutes(date: Date, timezone: string): number {
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
// `dateStr` is YYYY-MM-DD (interpreted in the clinic's local calendar).
function zonedDateTimeToUtc(dateStr: string, hours: number, minutes: number, timezone: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n));
  // First guess: treat the wall-clock as if it were UTC
  const guess = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
  // Then correct by the TZ offset at that instant
  const offset = tzOffsetMinutes(guess, timezone);
  return new Date(guess.getTime() - offset * 60000);
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

    if (cursor <= now) {
      cursor = new Date(cursor.getTime() + slotDuration * 60000);
      continue;
    }

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

// Format a Date into a short, voice-friendly time slot like "10:00 AM" in clinic timezone.
function formatSlotForVoice(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

// Format a Date as "Monday May 26" in clinic timezone.
function formatDayLabel(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

interface VapiToolCall {
  id: string;
  name?: string;
  arguments?: Record<string, unknown>;
  function?: { name: string; arguments: string | Record<string, unknown> };
}

function extractArgs(body: Record<string, unknown>): {
  toolCallId: string | null;
  args: Record<string, unknown>;
} {
  const msg = body.message as Record<string, unknown> | undefined;
  const list =
    (msg?.toolCallList as VapiToolCall[] | undefined) ??
    (msg?.toolCalls as VapiToolCall[] | undefined) ??
    (body.toolCallList as VapiToolCall[] | undefined) ??
    (body.toolCalls as VapiToolCall[] | undefined);

  const tc = list?.[0];

  if (tc) {
    // VAPI sends args nested at function.arguments (object or JSON string)
    // or at the top level as `arguments`
    const fnArgs = tc.function?.arguments;
    if (fnArgs && typeof fnArgs === "object") {
      return { toolCallId: tc.id, args: fnArgs as Record<string, unknown> };
    }
    if (typeof fnArgs === "string") {
      try {
        return { toolCallId: tc.id, args: JSON.parse(fnArgs) };
      } catch {
        return { toolCallId: tc.id, args: {} };
      }
    }
    if (tc.arguments && typeof tc.arguments === "object") {
      return { toolCallId: tc.id, args: tc.arguments };
    }
    return { toolCallId: tc.id, args: {} };
  }

  // Direct invocation (manual testing)
  return { toolCallId: null, args: body };
}

function vapiResponse(toolCallId: string | null, result: unknown): Response {
  const body = toolCallId
    ? { results: [{ toolCallId, name: "check_availability", result: typeof result === "string" ? result : JSON.stringify(result) }] }
    : (result as object);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("check-availability RAW BODY:", JSON.stringify(rawBody).slice(0, 2000));

  const { toolCallId, args } = extractArgs(rawBody);

  const url = new URL(req.url);
  const business_id = (args.business_id as string | undefined) ?? url.searchParams.get("business_id") ?? undefined;
  const date = args.date as string | undefined;
  const service_type = args.service_type as string | undefined;

  console.log("check-availability PARSED:", { toolCallId, business_id, date, service_type, argsKeys: Object.keys(args) });

  if (!business_id) {
    return vapiResponse(toolCallId, { error: "I'm having trouble identifying the clinic. Let me take your details instead." });
  }
  if (!date) {
    return vapiResponse(toolCallId, { error: "What date would you like me to check?" });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return vapiResponse(toolCallId, { error: "Please use a valid date." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: clinic, error: clinicErr } = await supabase
    .from("businesses")
    .select("settings, timezone")
    .eq("id", business_id)
    .single();

  if (clinicErr || !clinic) {
    return vapiResponse(toolCallId, { error: "Clinic not found" });
  }

  const settings = clinic.settings ?? {};
  const timezone = clinic.timezone ?? "America/Chicago";
  const slotDuration = settings.slot_duration_default ?? 60;
  const buffer = settings.buffer_between_appointments ?? 5;

  // Day-of-week in the clinic's timezone (NOT in UTC)
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .toLowerCase();

  let openTime: Date | null = null;
  let closeTime: Date | null = null;

  if (settings.operating_hours?.[dayName]) {
    const dayHours: OperatingHours = settings.operating_hours[dayName];
    if (dayHours.closed) {
      return vapiResponse(toolCallId, { slots: [], message: "We're closed on that day." });
    }
    if (dayHours.open && dayHours.close) {
      const o = parseTimeOfDay(dayHours.open);
      const c = parseTimeOfDay(dayHours.close);
      openTime = zonedDateTimeToUtc(date, o.hours, o.minutes, timezone);
      closeTime = zonedDateTimeToUtc(date, c.hours, c.minutes, timezone);
    }
  } else if (settings.hours) {
    const match = settings.hours.match(/(\d+(?::\d+)?(?:am|pm)?)\s*[-–]\s*(\d+(?::\d+)?(?:am|pm)?)/i);
    if (match) {
      const o = parseTimeOfDay(match[1]);
      const c = parseTimeOfDay(match[2]);
      openTime = zonedDateTimeToUtc(date, o.hours, o.minutes, timezone);
      closeTime = zonedDateTimeToUtc(date, c.hours, c.minutes, timezone);
    }
    if (dayName === "sunday" && settings.hours.toLowerCase().includes("mon-sat")) {
      return vapiResponse(toolCallId, { slots: [], message: "We're closed on Sundays." });
    }
  }

  if (!openTime || !closeTime) {
    openTime = zonedDateTimeToUtc(date, 10, 0, timezone);
    closeTime = zonedDateTimeToUtc(date, 19, 0, timezone);
  }

  // Search appointments using TZ-aware day bounds
  const dayStartUtc = zonedDateTimeToUtc(date, 0, 0, timezone).toISOString();
  const dayEndUtc = zonedDateTimeToUtc(date, 23, 59, timezone).toISOString();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end")
    .eq("business_id", business_id)
    .gte("scheduled_start", dayStartUtc)
    .lte("scheduled_start", dayEndUtc)
    .in("status", ["confirmed", "rescheduled"]);

  const bookedRanges = (appointments ?? []).map((a) => ({
    start: new Date(a.scheduled_start),
    end: a.scheduled_end
      ? new Date(a.scheduled_end)
      : new Date(new Date(a.scheduled_start).getTime() + slotDuration * 60000),
  }));

  const availableSlots = generateSlots(openTime, closeTime, slotDuration, buffer, bookedRanges);

  if (availableSlots.length === 0) {
    return vapiResponse(toolCallId, { slots: [], message: "No openings on that date." });
  }

  // Limit to first 4 slots so the LLM has clean options to offer
  const top = availableSlots.slice(0, 4);
  const voiceFriendly = top.map((s) => formatSlotForVoice(s, timezone));
  const iso = top.map((s) => s.toISOString());
  const dayLabel = formatDayLabel(top[0], timezone);

  return vapiResponse(toolCallId, {
    day: dayLabel,
    slots_voice: voiceFriendly,
    slots_iso: iso,
    timezone,
  });
});
