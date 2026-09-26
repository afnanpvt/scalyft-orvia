import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeVapiRequest, unauthorized } from "../_shared/vapi-auth.ts";
import { getValidGoogleAccessToken, createGoogleCalendarEvent } from "../_shared/google-calendar.ts";

// Vapi tool: book_appointment
// Inserts appointment row, updates call outcome, sends confirmation SMS (fire-and-forget).

// ── Types ──────────────────────────────────────────────────────────────────

interface AppointmentArgs {
  customer_name: string;
  customer_phone: string;
  service_type: string;
  slot: string; // ISO 8601 datetime
  notes?: string;
}

interface VapiToolCall {
  id: string;
  name?: string;
  arguments?: Record<string, unknown>;
  function?: { name: string; arguments: string | Record<string, unknown> };
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

function vapiResponse(toolCallId: string | null, result: unknown, status = 200): Response {
  const body = toolCallId
    ? { results: [{ toolCallId, name: "book_appointment", result: typeof result === "string" ? result : JSON.stringify(result) }] }
    : (result as object);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatSlot(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

async function sendSms(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Twilio SMS error:", resp.status, text);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
  const ownerPhone = Deno.env.get("OWNER_PHONE");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id") ?? url.searchParams.get("clinic_id");

  if (!businessId) {
    return new Response(JSON.stringify({ error: "Missing business_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawText = await req.text();
  if (!(await authorizeVapiRequest(req, rawText, businessId)).ok) return unauthorized();

  let rawBody: Record<string, unknown>;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse Vapi tool call format
  let args: AppointmentArgs = {} as AppointmentArgs;
  let toolCallId: string | null = null;
  let vapiCallId: string | null = null;

  try {
    const msg = rawBody.message as Record<string, unknown> | undefined;
    const list =
      (msg?.toolCallList as VapiToolCall[] | undefined) ??
      (msg?.toolCalls as VapiToolCall[] | undefined) ??
      (rawBody.toolCallList as VapiToolCall[] | undefined) ??
      (rawBody.toolCalls as VapiToolCall[] | undefined);

    const tc = list?.[0];

    if (tc) {
      toolCallId = tc.id ?? null;
      const fnArgs = tc.function?.arguments;
      if (fnArgs && typeof fnArgs === "object") {
        args = fnArgs as unknown as AppointmentArgs;
      } else if (typeof fnArgs === "string") {
        args = JSON.parse(fnArgs) as AppointmentArgs;
      } else if (tc.arguments && typeof tc.arguments === "object") {
        args = tc.arguments as unknown as AppointmentArgs;
      }
    } else {
      args = rawBody as unknown as AppointmentArgs;
    }

    const call = msg?.call as Record<string, unknown> | undefined;
    vapiCallId = (call?.id as string) ?? null;
  } catch {
    return vapiResponse(toolCallId, { error: "Failed to parse tool arguments" });
  }

  // Support legacy patient_name/patient_phone field names from older prompts
  const customerName = (args.customer_name ?? (args as unknown as Record<string, string>).patient_name) as string | undefined;
  const customerPhone = (args.customer_phone ?? (args as unknown as Record<string, string>).patient_phone) as string | undefined;

  console.log("book-appointment called:", { toolCallId, customer_name: customerName, slot: args.slot });

  if (!customerName || !customerPhone || !args.service_type || !args.slot) {
    return vapiResponse(toolCallId, { error: "Need name, phone, service, and time to book." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load business
  const { data: business } = await supabase
    .from("businesses")
    .select("settings, timezone, name")
    .eq("id", businessId)
    .single();

  const timezone = business?.timezone ?? "America/Chicago";
  const slotDuration = business?.settings?.slot_duration_default ?? 60;
  const notifyPhone = business?.settings?.notification_phone ?? ownerPhone;
  const businessName = business?.name ?? "the business";
  // "simulated" = demo mode: bookings still land in the dashboard, but nothing
  // is written to the owner's real calendar.
  const schedulingMode = business?.settings?.scheduling_mode ?? "live";

  // Find call row
  let callRowId: string | null = null;
  if (vapiCallId) {
    const { data: callRow } = await supabase
      .from("calls")
      .select("id")
      .eq("vapi_call_id", vapiCallId)
      .single();
    callRowId = callRow?.id ?? null;

    // Browser demo calls have no phone number, so vapi-events can't attribute
    // them to a business and never creates the row. Create it here so the
    // appointment links to the call and the demo can find it.
    if (!callRowId) {
      const { data: created } = await supabase
        .from("calls")
        .upsert(
          { vapi_call_id: vapiCallId, business_id: businessId, status: "in_progress", started_at: new Date().toISOString() },
          { onConflict: "vapi_call_id" }
        )
        .select("id")
        .single();
      callRowId = created?.id ?? null;
    }
  }

  // Idempotency: if this call already has an appointment, return success
  if (callRowId) {
    const { data: existing } = await supabase
      .from("appointments")
      .select("id")
      .eq("call_id", callRowId)
      .maybeSingle();

    if (existing) {
      console.log("book-appointment: idempotent return, appointment already exists for call", vapiCallId);
      const formattedSlot = formatSlot(args.slot, timezone);
      return vapiResponse(toolCallId, {
        success: true,
        appointment_id: existing.id,
        message: `Already booked! ${args.service_type} for ${formattedSlot}.`,
      });
    }
  }

  // Calculate end time
  const slotStart = new Date(args.slot);
  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

  // Insert appointment
  const { data: appointment, error: aptError } = await supabase
    .from("appointments")
    .insert({
      business_id: businessId,
      call_id: callRowId,
      customer_name: customerName,
      customer_phone: customerPhone,
      service_type: args.service_type,
      scheduled_start: slotStart.toISOString(),
      scheduled_end: slotEnd.toISOString(),
      notes: args.notes ?? null,
      status: "confirmed",
    })
    .select("id")
    .single();

  if (aptError) {
    console.error("book-appointment insert error:", aptError.message);
    return vapiResponse(toolCallId, { error: "Couldn't confirm that slot, please try a different time." });
  }

  // Set call outcome
  if (vapiCallId) {
    await supabase
      .from("calls")
      .upsert(
        { vapi_call_id: vapiCallId, business_id: businessId, outcome: "appointment_booked" },
        { onConflict: "vapi_call_id" }
      );
  }

  const formattedSlot = formatSlot(args.slot, timezone);

  // Google Calendar sync — best-effort, awaited (it's one fast API call and
  // the demo needs google_cal_event_id back immediately for the synced badge).
  let googleCalEventId: string | null = null;
  try {
    const googleToken = schedulingMode === "live" ? await getValidGoogleAccessToken(supabase, businessId) : null;
    if (googleToken) {
      googleCalEventId = await createGoogleCalendarEvent(googleToken, {
        summary: `${args.service_type} — ${customerName}`,
        description: `Booked by ${businessName}'s AI receptionist.\nCustomer: ${customerName}\nPhone: ${customerPhone}${args.notes ? `\nNotes: ${args.notes}` : ""}`,
        start: slotStart,
        end: slotEnd,
        timezone,
      });
      if (googleCalEventId) {
        await supabase
          .from("appointments")
          .update({ google_cal_event_id: googleCalEventId })
          .eq("id", appointment.id);
      }
    }
  } catch (e) {
    console.error("google calendar sync threw:", e);
  }

  // Fire-and-forget SMS — does not block Vapi tool response
  if (twilioAccountSid && twilioAuthToken && twilioFrom) {
    const smsPromises: Promise<void>[] = [];

    if (customerPhone) {
      const callerMsg =
        `Confirmed! Your ${args.service_type} appointment with ${businessName} is set for ${formattedSlot}.\n` +
        `Questions? Call ${twilioFrom}.`;
      smsPromises.push(sendSms(twilioAccountSid, twilioAuthToken, twilioFrom, customerPhone, callerMsg));
    }

    if (notifyPhone) {
      const ownerMsg =
        `NEW JOB BOOKED - ${businessName}\n` +
        `Name: ${customerName}\n` +
        `Phone: ${customerPhone}\n` +
        `Service: ${args.service_type}\n` +
        `Time: ${formattedSlot}\n` +
        (args.notes ? `Notes: ${args.notes}` : "");
      smsPromises.push(sendSms(twilioAccountSid, twilioAuthToken, twilioFrom, notifyPhone, ownerMsg));
    }

    if (smsPromises.length > 0) {
      try {
        EdgeRuntime.waitUntil(Promise.allSettled(smsPromises));
      } catch {
        // EdgeRuntime.waitUntil not available — SMS will fire anyway
        Promise.allSettled(smsPromises).catch(() => {});
      }
    }
  }

  console.log("book-appointment: booked", appointment?.id, "for business", businessId, "at", args.slot);

  return vapiResponse(toolCallId, {
    success: true,
    appointment_id: appointment?.id,
    message: `Booked! ${args.service_type} for ${formattedSlot}.`,
  });
});
