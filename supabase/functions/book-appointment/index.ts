import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vapi tool: book_appointment
// Called mid-call when Orvia books an appointment.
// Inserts appointment row, updates call outcome, sends confirmation SMS to caller + owner.

// ── Types ──────────────────────────────────────────────────────────────────

interface AppointmentArgs {
  patient_name: string;
  patient_phone: string;
  service_type: string;
  slot: string; // ISO 8601 datetime
  notes?: string;
}

interface VapiToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
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
  const clinicId = url.searchParams.get("clinic_id");

  if (!clinicId) {
    return new Response(JSON.stringify({ error: "Missing clinic_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse Vapi tool call format
  let args: AppointmentArgs;
  let vapiCallId: string | null = null;

  try {
    const msg = rawBody.message as Record<string, unknown> | undefined;
    const toolCalls = (msg?.toolCalls ?? rawBody.toolCalls) as VapiToolCall[] | undefined;
    const tc = toolCalls?.[0];

    if (tc?.function?.arguments) {
      args = JSON.parse(tc.function.arguments) as AppointmentArgs;
    } else {
      args = rawBody as unknown as AppointmentArgs;
    }

    const call = msg?.call as Record<string, unknown> | undefined;
    vapiCallId = (call?.id as string) ?? null;
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse tool arguments" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!args.patient_name || !args.patient_phone || !args.service_type || !args.slot) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: patient_name, patient_phone, service_type, slot" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load clinic
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings, timezone, name")
    .eq("id", clinicId)
    .single();

  const timezone = clinic?.timezone ?? "America/Chicago";
  const slotDuration = clinic?.settings?.slot_duration_default ?? 60;
  const notifyPhone = clinic?.settings?.notification_phone ?? ownerPhone;
  const businessName = clinic?.name ?? "the business";

  // Find call row
  let callRowId: string | null = null;
  if (vapiCallId) {
    const { data: callRow } = await supabase
      .from("calls")
      .select("id")
      .eq("vapi_call_id", vapiCallId)
      .single();
    callRowId = callRow?.id ?? null;
  }

  // Calculate end time
  const slotStart = new Date(args.slot);
  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

  // Insert appointment
  const { data: appointment, error: aptError } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      call_id: callRowId,
      patient_name: args.patient_name,
      patient_phone: args.patient_phone,
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
    return new Response(JSON.stringify({ error: "Failed to book appointment" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Update call outcome
  if (vapiCallId) {
    await supabase
      .from("calls")
      .update({ outcome: "appointment_booked" })
      .eq("vapi_call_id", vapiCallId);
  }

  const formattedSlot = formatSlot(args.slot, timezone);

  // SMS to caller confirming booking
  if (twilioAccountSid && twilioAuthToken && twilioFrom && args.patient_phone) {
    const callerSms =
      `Confirmed! Your ${args.service_type} appointment with ${businessName} is set for ${formattedSlot}.\n` +
      `Questions? Call ${twilioFrom}.`;
    await sendSms(twilioAccountSid, twilioAuthToken, twilioFrom, args.patient_phone, callerSms);
  }

  // SMS to owner
  if (twilioAccountSid && twilioAuthToken && twilioFrom && notifyPhone) {
    const ownerSms =
      `NEW JOB BOOKED - ${businessName}\n` +
      `Name: ${args.patient_name}\n` +
      `Phone: ${args.patient_phone}\n` +
      `Service: ${args.service_type}\n` +
      `Time: ${formattedSlot}\n` +
      (args.notes ? `Notes: ${args.notes}` : "");
    await sendSms(twilioAccountSid, twilioAuthToken, twilioFrom, notifyPhone, ownerSms);
  }

  console.log("book-appointment: booked", appointment?.id, "for clinic", clinicId, "at", args.slot);

  return new Response(
    JSON.stringify({
      success: true,
      appointment_id: appointment?.id,
      message: `You're all set! ${args.service_type} confirmed for ${formattedSlot}. You'll receive a confirmation text shortly.`,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
