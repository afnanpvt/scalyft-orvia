import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vapi tool: capture_lead
// Called mid-call when Orvia captures a lead.
// Inserts a lead row, updates the call row outcome, sends SMS to owner.

// ── Types ──────────────────────────────────────────────────────────────────

interface LeadArgs {
  name: string;
  phone?: string;
  service_needed: string;
  urgency: "emergency" | "urgent" | "routine" | "inquiry";
  notes?: string;
}

interface VapiToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isBusinessHours(timezone: string): boolean {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);

    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12");
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const isWeekend = weekday === "Sun" || weekday === "Sat";
    return !isWeekend && hour >= 8 && hour < 20;
  } catch {
    return true;
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
  // Vapi sends: { message: { toolCalls: [{ id, function: { name, arguments } }], call: { id } } }
  // arguments is a JSON string
  let args: LeadArgs;
  let vapiCallId: string | null = null;
  let callerPhone: string | null = null;

  try {
    const msg = rawBody.message as Record<string, unknown> | undefined;
    const toolCalls = (msg?.toolCalls ?? rawBody.toolCalls) as VapiToolCall[] | undefined;
    const tc = toolCalls?.[0];

    if (tc?.function?.arguments) {
      args = JSON.parse(tc.function.arguments) as LeadArgs;
    } else {
      // Direct call format (fallback)
      args = rawBody as unknown as LeadArgs;
    }

    const call = msg?.call as Record<string, unknown> | undefined;
    vapiCallId = (call?.id as string) ?? null;
    callerPhone = ((call as Record<string, unknown> | undefined)?.customer as Record<string, unknown> | undefined)?.number as string ?? null;
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to parse tool arguments" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!args.name || !args.service_needed || !args.urgency) {
    return new Response(JSON.stringify({ error: "Missing required fields: name, service_needed, urgency" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load clinic for timezone + notification phone
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings, timezone, name")
    .eq("id", clinicId)
    .single();

  const timezone = clinic?.timezone ?? "America/Chicago";
  const notifyPhone = clinic?.settings?.notification_phone ?? ownerPhone;
  const businessName = clinic?.name ?? "the business";

  // Find the call row if we have a vapi_call_id
  let callRowId: string | null = null;
  if (vapiCallId) {
    const { data: callRow } = await supabase
      .from("calls")
      .select("id")
      .eq("vapi_call_id", vapiCallId)
      .single();
    callRowId = callRow?.id ?? null;
  }

  // Insert lead
  const phone = args.phone ?? callerPhone ?? "unknown";
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      clinic_id: clinicId,
      call_id: callRowId,
      name: args.name,
      phone,
      service_needed: args.service_needed,
      urgency: args.urgency,
      notes: args.notes ?? null,
      status: "new",
    })
    .select("id")
    .single();

  if (leadError) {
    console.error("capture-lead insert error:", leadError.message);
    return new Response(JSON.stringify({ error: "Failed to save lead" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Update call outcome to lead_captured
  if (vapiCallId) {
    await supabase
      .from("calls")
      .update({ outcome: "lead_captured" })
      .eq("vapi_call_id", vapiCallId);
  }

  // SMS owner - always for emergency/urgent, only during hours for routine/inquiry
  const shouldNotify =
    twilioAccountSid &&
    twilioAuthToken &&
    twilioFrom &&
    notifyPhone &&
    (args.urgency === "emergency" || args.urgency === "urgent" || isBusinessHours(timezone));

  if (shouldNotify) {
    const urgencyTag =
      args.urgency === "emergency"
        ? "EMERGENCY"
        : args.urgency === "urgent"
          ? "URGENT"
          : "New Lead";

    const smsBody =
      `${urgencyTag} - ${businessName}\n` +
      `Name: ${args.name}\n` +
      `Phone: ${phone}\n` +
      `Service: ${args.service_needed}\n` +
      (args.notes ? `Notes: ${args.notes}\n` : "") +
      `Reply or call back within 30 min.`;

    await sendSms(twilioAccountSid!, twilioAuthToken!, twilioFrom!, notifyPhone, smsBody);
  }

  console.log("capture-lead: saved lead", lead?.id, "for clinic", clinicId, "urgency:", args.urgency);

  return new Response(
    JSON.stringify({
      success: true,
      lead_id: lead?.id,
      message: "Got it. Someone will call you back shortly.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
