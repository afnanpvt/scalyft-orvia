import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Handles Vapi call lifecycle events and updates the calls table.
// Expected payload shape from Vapi (message.type = "end-of-call-report"):
// {
//   message: {
//     type: "end-of-call-report",
//     call: { id: string, phoneNumberId?: string },
//     transcript: string,
//     summary: string,
//     recordingUrl?: string,
//     durationSeconds?: number,
//     cost?: number,
//     extractedVariables?: Record<string, unknown>
//   }
// }

interface VapiCallPayload {
  message?: {
    type?: string;
    call?: { id?: string; phoneNumberId?: string };
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    cost?: number;
    extractedVariables?: Record<string, unknown>;
  };
}

function inferOutcome(extractedVars: Record<string, unknown> | undefined, summary: string | undefined): string | null {
  if (!extractedVars && !summary) return null;

  const vars = extractedVars ?? {};

  if (vars.appointment_booked || vars.appointmentBooked) return "appointment_booked";
  if (vars.lead_captured || vars.leadCaptured) return "lead_captured";
  if (vars.transferred) return "transferred";

  // Fall back to summary keyword scan
  const text = (summary ?? "").toLowerCase();
  if (text.includes("appointment booked") || text.includes("scheduled")) return "appointment_booked";
  if (text.includes("transferred") || text.includes("transfer")) return "transferred";
  if (text.includes("lead") || text.includes("callback")) return "lead_captured";
  if (text.includes("info") || text.includes("inquir") || text.includes("hours")) return "info_given";

  return null;
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

  let body: VapiCallPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const msg = body.message;

  // Only process end-of-call reports
  if (msg?.type !== "end-of-call-report") {
    return new Response(
      JSON.stringify({ ok: true, skipped: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const vapiCallId = msg.call?.id;
  if (!vapiCallId) {
    return new Response(
      JSON.stringify({ error: "Missing call.id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const outcome = inferOutcome(msg.extractedVariables, msg.summary);
  const costCents = msg.cost ? Math.round(msg.cost * 100) : undefined;

  const updates: Record<string, unknown> = {
    status: "completed",
    summary: msg.summary ?? null,
    recording_url: msg.recordingUrl ?? null,
    duration_secs: msg.durationSeconds ?? null,
    outcome,
    extracted_data: msg.extractedVariables ?? {},
  };
  if (costCents !== undefined) updates.cost_cents = costCents;

  const { error } = await supabase
    .from("calls")
    .update(updates)
    .eq("vapi_call_id", vapiCallId);

  if (error) {
    console.error("Failed to update call:", error.message, "vapi_call_id:", vapiCallId);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log("Call updated:", vapiCallId, "outcome:", outcome);

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
