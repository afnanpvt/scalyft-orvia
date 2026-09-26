import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeVapiRequest, unauthorized } from "../_shared/vapi-auth.ts";

// Vapi tool: capture_lead
// Inserts a lead row, updates call outcome, sends SMS to owner (fire-and-forget).

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
  name?: string;
  arguments?: Record<string, unknown>;
  function?: { name: string; arguments: string | Record<string, unknown> };
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

function vapiResponse(toolCallId: string | null, result: unknown, status = 200): Response {
  const body = toolCallId
    ? { results: [{ toolCallId, name: "capture_lead", result: typeof result === "string" ? result : JSON.stringify(result) }] }
    : (result as object);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

  let args: LeadArgs = {} as LeadArgs;
  let toolCallId: string | null = null;
  let vapiCallId: string | null = null;
  let callerPhone: string | null = null;

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
        args = fnArgs as unknown as LeadArgs;
      } else if (typeof fnArgs === "string") {
        args = JSON.parse(fnArgs) as LeadArgs;
      } else if (tc.arguments && typeof tc.arguments === "object") {
        args = tc.arguments as unknown as LeadArgs;
      }
    } else {
      args = rawBody as unknown as LeadArgs;
    }

    const call = msg?.call as Record<string, unknown> | undefined;
    vapiCallId = (call?.id as string) ?? null;
    callerPhone = ((call as Record<string, unknown> | undefined)?.customer as Record<string, unknown> | undefined)?.number as string ?? null;
  } catch (_e) {
    return vapiResponse(toolCallId, { error: "Failed to parse tool arguments" }, 200);
  }

  console.log("capture-lead called:", { toolCallId, name: args.name, service: args.service_needed, urgency: args.urgency });

  if (!args.name || !args.service_needed || !args.urgency) {
    return vapiResponse(toolCallId, { error: "Need name, service, and urgency to save the lead." }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load business for timezone + notification phone
  const { data: business } = await supabase
    .from("businesses")
    .select("settings, timezone, name")
    .eq("id", businessId)
    .single();

  const timezone = business?.timezone ?? "America/Chicago";
  const notifyPhone = business?.settings?.notification_phone ?? ownerPhone;
  const businessName = business?.name ?? "the business";

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

  // Idempotency: if this call already has a lead, return success
  if (callRowId) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("call_id", callRowId)
      .maybeSingle();

    if (existing) {
      console.log("capture-lead: idempotent return, lead already exists for call", vapiCallId);
      return vapiResponse(toolCallId, {
        success: true,
        lead_id: existing.id,
        message: "Got it. Someone will call you back shortly.",
      });
    }
  }

  // Insert lead
  const phone = args.phone ?? callerPhone ?? "unknown";
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
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
    return vapiResponse(toolCallId, { error: "Couldn't save the lead, please try again." }, 200);
  }

  // Set call outcome (don't overwrite if already booked)
  if (vapiCallId) {
    const { data: existing } = await supabase
      .from("calls")
      .select("outcome")
      .eq("vapi_call_id", vapiCallId)
      .maybeSingle();

    if (existing?.outcome !== "appointment_booked") {
      await supabase
        .from("calls")
        .upsert(
          { vapi_call_id: vapiCallId, business_id: businessId, outcome: "lead_captured" },
          { onConflict: "vapi_call_id" }
        );
    }
  }

  // Fire-and-forget SMS — does not block Vapi tool response
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

    const smsPromise = sendSms(twilioAccountSid!, twilioAuthToken!, twilioFrom!, notifyPhone, smsBody);
    try {
      EdgeRuntime.waitUntil(smsPromise);
    } catch {
      smsPromise.catch(() => {});
    }
  }

  console.log("capture-lead: saved lead", lead?.id, "for business", businessId, "urgency:", args.urgency);

  return vapiResponse(toolCallId, {
    success: true,
    lead_id: lead?.id,
    message: "Got it. Someone will call you back shortly.",
  });
});
