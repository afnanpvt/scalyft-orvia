import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Handles Vapi call lifecycle webhooks.
//
// Events handled:
//   call.started        → INSERT call row (in_progress)
//   status-update       → mark missed if endedReason is a no-answer variant
//   end-of-call-report  → UPSERT with full data (transcript, summary, cost, recording, outcome)
//
// Vapi sends ALL events to the same serverUrl. We read message.type to route.

// ── Types ──────────────────────────────────────────────────────────────────

interface VapiMessage {
  type: string;
  call?: {
    id?: string;
    phoneNumberId?: string;
    customer?: { number?: string };
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
    costs?: { type: string; cost: number }[];
    cost?: number;
  };
  // end-of-call-report fields
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  stereoRecordingUrl?: string;
  durationSeconds?: number;
  cost?: number;
  costBreakdown?: unknown;
  extractedVariables?: Record<string, unknown>;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  // status-update fields
  status?: string;
}

interface VapiBody {
  message?: VapiMessage;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Parse Vapi transcript string into [{role, content, timestamp}] array.
// Format: "AI: hello\nUser: hi\nAI: how can I help"
function parseTranscript(raw: string | undefined): { role: string; content: string }[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(AI|User|Assistant|Bot):\s*(.+)$/i);
      if (!match) return null;
      const speaker = match[1].toLowerCase();
      return {
        role: speaker === "user" ? "user" : "assistant",
        content: match[2].trim(),
      };
    })
    .filter(Boolean) as { role: string; content: string }[];
}

// Infer outcome from extracted vars or summary text.
// Note: capture-lead and book-appointment edge functions also set outcome directly,
// but this is the fallback for end-of-call-report when no tool call happened.
function inferOutcome(
  vars: Record<string, unknown> | undefined,
  summary: string | undefined,
  analysis: VapiMessage["analysis"]
): string | null {
  const v = vars ?? {};
  // "booked" wins over "lead_captured" — VAPI's analysis often sets both when an appointment was made
  if (v.booked || v.appointment_booked || v.appointmentBooked) return "appointment_booked";
  if (v.transferred) return "transferred";
  if (v.lead_captured || v.leadCaptured) return "lead_captured";

  const text = ((summary ?? "") + " " + (analysis?.summary ?? "")).toLowerCase();
  if (text.includes("appointment booked") || text.includes("booked") || text.includes("scheduled")) return "appointment_booked";
  if (text.includes("transferred") || text.includes("transfer")) return "transferred";
  if (text.includes("lead") || text.includes("callback") || text.includes("call back")) return "lead_captured";
  if (text.includes("info") || text.includes("inquir") || text.includes("hours") || text.includes("pricing")) return "info_given";

  return null;
}

const MISSED_REASONS = new Set([
  "customer-did-not-answer",
  "no-answer",
  "voicemail",
  "customer-busy",
  "exceeded-max-duration",
  "pipeline-error",
  "silence-timed-out",
]);

// ── Handler ────────────────────────────────────────────────────────────────

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

  let body: VapiBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const msg = body.message;
  if (!msg?.type) {
    return new Response(JSON.stringify({ ok: true, skipped: "no message type" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const vapiCallId = msg.call?.id;
  const phoneNumberId = msg.call?.phoneNumberId;
  const callerPhone = msg.call?.customer?.number ?? null;

  // ── 1. call.started ─────────────────────────────────────────────────────
  if (msg.type === "call.started" || msg.type === "call-start") {
    if (!vapiCallId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no call id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up clinic by phoneNumberId
    let clinicId: string | null = null;
    if (phoneNumberId) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      clinicId = clinic?.id ?? null;
    }

    if (!clinicId) {
      console.error("call.started: no clinic found for phoneNumberId:", phoneNumberId);
      return new Response(JSON.stringify({ ok: true, skipped: "no clinic" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("calls").upsert(
      {
        vapi_call_id: vapiCallId,
        clinic_id: clinicId,
        caller_phone: callerPhone,
        status: "in_progress",
        started_at: msg.call?.startedAt ?? new Date().toISOString(),
      },
      { onConflict: "vapi_call_id", ignoreDuplicates: true }
    );

    if (error) {
      console.error("call.started insert error:", error.message);
    } else {
      console.log("call.started: inserted", vapiCallId, "clinic:", clinicId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 2. status-update (missed/failed) ────────────────────────────────────
  if (msg.type === "status-update") {
    const endedReason = msg.call?.endedReason ?? "";
    const isMissed = MISSED_REASONS.has(endedReason) || msg.status === "ended" && !vapiCallId;

    if (!vapiCallId || !isMissed) {
      return new Response(JSON.stringify({ ok: true, skipped: "not a missed event" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to find and update — if not found, try to upsert as missed
    let clinicId: string | null = null;
    if (phoneNumberId) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      clinicId = clinic?.id ?? null;
    }

    const missedData: Record<string, unknown> = {
      vapi_call_id: vapiCallId,
      status: "missed",
      outcome: "missed",
      ended_at: msg.call?.endedAt ?? new Date().toISOString(),
    };
    if (clinicId) missedData.clinic_id = clinicId;
    if (callerPhone) missedData.caller_phone = callerPhone;
    if (msg.call?.startedAt) missedData.started_at = msg.call.startedAt;

    const { error } = await supabase
      .from("calls")
      .upsert(missedData, { onConflict: "vapi_call_id" });

    if (error) {
      console.error("status-update missed upsert error:", error.message);
    } else {
      console.log("status-update: marked missed", vapiCallId, "reason:", endedReason);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 3. end-of-call-report ───────────────────────────────────────────────
  if (msg.type === "end-of-call-report") {
    if (!vapiCallId) {
      return new Response(JSON.stringify({ error: "Missing call.id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const transcriptTurns = parseTranscript(msg.transcript);
    const costRaw = msg.cost ?? msg.call?.cost ?? 0;
    const costCents = costRaw ? Math.round(costRaw * 100) : 0;
    const durationRaw = msg.durationSeconds;
    const durationSecs = typeof durationRaw === "number" ? Math.round(durationRaw) : null;
    const summary = msg.summary ?? msg.analysis?.summary ?? null;
    const extractedVars = msg.extractedVariables ?? msg.analysis?.structuredData ?? {};

    // Don't overwrite outcome if capture-lead/book-appointment already set it
    const { data: existing } = await supabase
      .from("calls")
      .select("outcome, clinic_id")
      .eq("vapi_call_id", vapiCallId)
      .single();

    const outcome = existing?.outcome ?? inferOutcome(extractedVars, summary, msg.analysis);

    // Look up clinic if row doesn't exist yet
    let clinicId = existing?.clinic_id ?? null;
    if (!clinicId && phoneNumberId) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      clinicId = clinic?.id ?? null;
    }

    const updateData: Record<string, unknown> = {
      vapi_call_id: vapiCallId,
      status: "completed",
      summary,
      recording_url: msg.recordingUrl ?? msg.stereoRecordingUrl ?? null,
      duration_secs: durationSecs,
      cost_cents: costCents,
      outcome,
      extracted_data: extractedVars,
      ended_at: msg.call?.endedAt ?? new Date().toISOString(),
    };

    if (clinicId) updateData.clinic_id = clinicId;
    if (callerPhone) updateData.caller_phone = callerPhone;
    if (msg.call?.startedAt) updateData.started_at = msg.call.startedAt;
    if (transcriptTurns.length > 0) updateData.transcript = transcriptTurns;

    const { error } = await supabase
      .from("calls")
      .upsert(updateData, { onConflict: "vapi_call_id" });

    if (error) {
      console.error("end-of-call-report upsert error:", error.message, "vapi_call_id:", vapiCallId);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("end-of-call-report: upserted", vapiCallId, "outcome:", outcome, "cost:", costCents, "cents");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // All other event types — ack and ignore
  return new Response(JSON.stringify({ ok: true, skipped: msg.type }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
