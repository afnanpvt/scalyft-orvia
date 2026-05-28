import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const LOW_BALANCE_THRESHOLD_SECS = 1800; // 30 minutes

// ── Structured logger ─────────────────────────────────────────────────────
// Every log line is JSON so Supabase log search can filter by field.

function log(fields: {
  event_type: string;
  status: "ok" | "error" | "skipped";
  vapi_call_id?: string | null;
  business_id?: string | null;
  duration_ms?: number;
  error_message?: string;
  [key: string]: unknown;
}) {
  console.log(JSON.stringify({ fn: "vapi-events", ...fields }));
}

// ── Twilio SMS ────────────────────────────────────────────────────────────

async function sendTwilioSms(to: string, body: string): Promise<void> {
  const twilioSid  = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!twilioSid || !twilioAuth || !twilioFrom) return;
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: twilioFrom, To: to, Body: body }),
    }
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

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
  status?: string;
}

interface VapiBody {
  message?: VapiMessage;
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

function inferOutcome(
  vars: Record<string, unknown> | undefined,
  summary: string | undefined,
  analysis: VapiMessage["analysis"]
): string {
  const v = vars ?? {};
  if (v.booked || v.appointment_booked || v.appointmentBooked) return "appointment_booked";
  if (v.transferred) return "transferred";
  if (v.lead_captured || v.leadCaptured) return "lead_captured";

  const text = ((summary ?? "") + " " + (analysis?.summary ?? "")).toLowerCase();
  if (text.includes("appointment booked") || text.includes("booked") || text.includes("scheduled")) return "appointment_booked";
  if (text.includes("transferred") || text.includes("transfer")) return "transferred";
  if (text.includes("lead") || text.includes("callback") || text.includes("call back")) return "lead_captured";
  if (text.includes("info") || text.includes("inquir") || text.includes("hours") || text.includes("pricing")) return "info_given";

  // Default to info_given rather than null so completed calls always have an outcome
  return "info_given";
}

// Reasons the call was genuinely missed (customer never connected to AI)
const TRUE_MISSED_REASONS = new Set([
  "customer-did-not-answer",
  "no-answer",
  "voicemail",
  "customer-busy",
]);

// Reasons the AI itself failed mid-call - NOT missed calls
const AI_FAILURE_REASONS = new Set([
  "pipeline-error",
  "silence-timed-out",
  "exceeded-max-duration",
  "error",
]);

// Simple booking-intent keyword check for partial booking detection
const BOOKING_KEYWORDS = [
  "schedule",
  "book",
  "appointment",
  "available",
  "what time",
  "when can",
  "slot",
  "next week",
  "tomorrow",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

function hasBookingIntent(transcript: { role: string; content: string }[]): boolean {
  const userLines = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content.toLowerCase())
    .join(" ");
  return BOOKING_KEYWORDS.some((kw) => userLines.includes(kw));
}

// ── Webhook signature verification ────────────────────────────────────────
// VAPI signs requests with HMAC-SHA256 when a webhook secret is configured.
// If VAPI_WEBHOOK_SECRET is not set we skip verification (dev mode).

async function verifyVapiSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  if (!secret) return true; // no secret configured - skip

  const signature = req.headers.get("x-vapi-signature") ?? req.headers.get("vapi-signature");
  if (!signature) {
    log({ event_type: "signature_missing", status: "error" });
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expected || signature === `sha256=${expected}`;
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const handlerStart = Date.now();

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log({ event_type: "missing_credentials", status: "error" });
    return new Response(
      JSON.stringify({ error: "Missing Supabase credentials" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Read body once so we can verify signature and then parse JSON
  const rawBody = await req.text();

  const signatureOk = await verifyVapiSignature(req, rawBody);
  if (!signatureOk) {
    log({ event_type: "signature_invalid", status: "error" });
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: VapiBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    log({ event_type: "invalid_json", status: "error" });
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

  const receivedAt = new Date().toISOString();
  const vapiCallId = msg.call?.id ?? null;
  const phoneNumberId = msg.call?.phoneNumberId ?? null;
  const callerPhone = msg.call?.customer?.number ?? null;

  // ── 1. call.started ───────────────────────────────────────────────────────
  if (msg.type === "call.started" || msg.type === "call-start") {
    if (!vapiCallId) {
      log({ event_type: "call.started", status: "skipped", reason: "no call id" });
      return new Response(JSON.stringify({ ok: true, skipped: "no call id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let businessId: string | null = null;
    if (phoneNumberId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      businessId = biz?.id ?? null;
    }

    if (!businessId) {
      log({ event_type: "call.started", status: "skipped", vapi_call_id: vapiCallId, reason: "no business found" });
      return new Response(JSON.stringify({ ok: true, skipped: "no business" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Concurrent call detection: is another call already in_progress?
    const { data: inProgressCalls } = await supabase
      .from("calls")
      .select("id")
      .eq("business_id", businessId)
      .eq("status", "in_progress")
      .limit(1);

    const wasConcurrent = (inProgressCalls?.length ?? 0) > 0;

    const { error } = await supabase.from("calls").upsert(
      {
        vapi_call_id: vapiCallId,
        business_id: businessId,
        caller_phone: callerPhone,
        status: "in_progress",
        transcript_status: "pending",
        was_concurrent: wasConcurrent,
        webhook_received_at: receivedAt,
        started_at: msg.call?.startedAt ?? receivedAt,
      },
      { onConflict: "vapi_call_id", ignoreDuplicates: true }
    );

    if (error) {
      log({ event_type: "call.started", status: "error", vapi_call_id: vapiCallId, business_id: businessId, error_message: error.message, duration_ms: Date.now() - handlerStart });
    } else {
      log({ event_type: "call.started", status: "ok", vapi_call_id: vapiCallId, business_id: businessId, was_concurrent: wasConcurrent, duration_ms: Date.now() - handlerStart });

      // Record concurrent event for dashboard visibility
      if (wasConcurrent) {
        await supabase.from("operational_events").insert({
          business_id: businessId,
          event_type: "concurrent_call",
          severity: "info",
          payload: { vapi_call_id: vapiCallId, caller_phone: callerPhone },
        }).catch(() => {/* non-fatal */});
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 2. status-update ──────────────────────────────────────────────────────
  if (msg.type === "status-update") {
    const endedReason = msg.call?.endedReason ?? "";

    const isTrulyMissed = TRUE_MISSED_REASONS.has(endedReason);
    const isAiFailure   = AI_FAILURE_REASONS.has(endedReason);

    if (!vapiCallId || (!isTrulyMissed && !isAiFailure)) {
      log({ event_type: "status-update", status: "skipped", vapi_call_id: vapiCallId, ended_reason: endedReason });
      return new Response(JSON.stringify({ ok: true, skipped: "not a terminal miss/failure" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let businessId: string | null = null;
    if (phoneNumberId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      businessId = biz?.id ?? null;
    }

    // Also try to get it from the existing call row
    if (!businessId && vapiCallId) {
      const { data: existing } = await supabase
        .from("calls")
        .select("business_id")
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle();
      businessId = existing?.business_id ?? null;
    }

    if (isTrulyMissed) {
      // Real missed call: customer never reached the AI
      const missedData: Record<string, unknown> = {
        vapi_call_id: vapiCallId,
        status: "missed",
        outcome: "missed",
        transcript_status: "failed",
        webhook_received_at: receivedAt,
        ended_at: msg.call?.endedAt ?? receivedAt,
      };
      if (businessId) missedData.business_id = businessId;
      if (callerPhone) missedData.caller_phone = callerPhone;
      if (msg.call?.startedAt) missedData.started_at = msg.call.startedAt;

      const { error } = await supabase
        .from("calls")
        .upsert(missedData, { onConflict: "vapi_call_id" });

      if (error) {
        log({ event_type: "status-update.missed", status: "error", vapi_call_id: vapiCallId, error_message: error.message, duration_ms: Date.now() - handlerStart });
      } else {
        log({ event_type: "status-update.missed", status: "ok", vapi_call_id: vapiCallId, business_id: businessId, ended_reason: endedReason, duration_ms: Date.now() - handlerStart });

        // Add to callback queue
        if (businessId) {
          const { data: callRow } = await supabase
            .from("calls")
            .select("id, caller_phone")
            .eq("vapi_call_id", vapiCallId)
            .maybeSingle();

          if (callRow) {
            await supabase.from("call_queue").insert({
              business_id: businessId,
              call_id: callRow.id,
              queue_type: "missed_callback",
              priority: 5,
              caller_phone: callRow.caller_phone ?? callerPhone,
              status: "pending",
            }).catch(() => {/* non-fatal */});
          }
        }
      }
    } else {
      // AI failure: call was answered by AI but it crashed/timed out
      const failureData: Record<string, unknown> = {
        vapi_call_id: vapiCallId,
        status: "failed",
        transcript_status: "failed",
        ai_failure_reason: endedReason,
        webhook_received_at: receivedAt,
        ended_at: msg.call?.endedAt ?? receivedAt,
      };
      if (businessId) failureData.business_id = businessId;
      if (callerPhone) failureData.caller_phone = callerPhone;
      if (msg.call?.startedAt) failureData.started_at = msg.call.startedAt;

      const { error } = await supabase
        .from("calls")
        .upsert(failureData, { onConflict: "vapi_call_id" });

      if (error) {
        log({ event_type: "status-update.ai_failure", status: "error", vapi_call_id: vapiCallId, error_message: error.message, duration_ms: Date.now() - handlerStart });
      } else {
        log({ event_type: "status-update.ai_failure", status: "ok", vapi_call_id: vapiCallId, business_id: businessId, ended_reason: endedReason, duration_ms: Date.now() - handlerStart });

        // Record operational event so dashboard surfaces it
        if (businessId) {
          const { data: callRow } = await supabase
            .from("calls")
            .select("id")
            .eq("vapi_call_id", vapiCallId)
            .maybeSingle();

          await supabase.from("operational_events").insert({
            business_id: businessId,
            call_id: callRow?.id ?? null,
            event_type: "ai_failure",
            severity: "warning",
            payload: { ended_reason: endedReason, caller_phone: callerPhone, vapi_call_id: vapiCallId },
          }).catch(() => {/* non-fatal */});
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 3. end-of-call-report ─────────────────────────────────────────────────
  if (msg.type === "end-of-call-report") {
    if (!vapiCallId) {
      log({ event_type: "end-of-call-report", status: "error", error_message: "missing call.id" });
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
      .select("outcome, business_id, id")
      .eq("vapi_call_id", vapiCallId)
      .maybeSingle();

    const outcome = existing?.outcome ?? inferOutcome(extractedVars, summary, msg.analysis);

    let businessId = existing?.business_id ?? null;
    if (!businessId && phoneNumberId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("vapi_phone_id", phoneNumberId)
        .eq("status", "active")
        .single();
      businessId = biz?.id ?? null;
    }

    const updateData: Record<string, unknown> = {
      vapi_call_id: vapiCallId,
      status: "completed",
      transcript_status: transcriptTurns.length > 0 ? "complete" : "failed",
      summary,
      recording_url: msg.recordingUrl ?? msg.stereoRecordingUrl ?? null,
      duration_secs: durationSecs,
      cost_cents: costCents,
      outcome,
      extracted_data: extractedVars,
      webhook_received_at: receivedAt,
      ended_at: msg.call?.endedAt ?? receivedAt,
    };

    if (businessId) updateData.business_id = businessId;
    if (callerPhone) updateData.caller_phone = callerPhone;
    if (msg.call?.startedAt) updateData.started_at = msg.call.startedAt;
    if (transcriptTurns.length > 0) updateData.transcript = transcriptTurns;

    const { error } = await supabase
      .from("calls")
      .upsert(updateData, { onConflict: "vapi_call_id" });

    if (error) {
      log({ event_type: "end-of-call-report", status: "error", vapi_call_id: vapiCallId, error_message: error.message, duration_ms: Date.now() - handlerStart });
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    log({ event_type: "end-of-call-report", status: "ok", vapi_call_id: vapiCallId, business_id: businessId, outcome, cost_cents: costCents, duration_secs: durationSecs, duration_ms: Date.now() - handlerStart });

    // ── Partial booking detection ──────────────────────────────────────────
    // Heuristic: user expressed booking intent in transcript but no appointment was created
    if (businessId && outcome !== "appointment_booked" && transcriptTurns.length > 0) {
      const bookingIntent = hasBookingIntent(transcriptTurns);

      if (bookingIntent) {
        // Check if an appointment was actually created for this call
        const { data: callRow } = await supabase
          .from("calls")
          .select("id")
          .eq("vapi_call_id", vapiCallId)
          .maybeSingle();

        if (callRow?.id) {
          const { data: appt } = await supabase
            .from("appointments")
            .select("id")
            .eq("call_id", callRow.id)
            .maybeSingle();

          if (!appt) {
            // Booking intent detected but no appointment created - add to queue
            const callerName = (extractedVars?.caller_name as string) ?? null;
            const serviceNeeded = (extractedVars?.service_requested as string) ?? null;

            await Promise.allSettled([
              supabase.from("call_queue").insert({
                business_id: businessId,
                call_id: callRow.id,
                queue_type: "partial_booking",
                priority: 3,
                caller_phone: callerPhone,
                caller_name: callerName,
                service_needed: serviceNeeded,
                status: "pending",
              }),
              supabase.from("operational_events").insert({
                business_id: businessId,
                call_id: callRow.id,
                event_type: "partial_booking",
                severity: "warning",
                payload: { caller_phone: callerPhone, caller_name: callerName, service_needed: serviceNeeded },
              }),
            ]);

            log({ event_type: "partial_booking_detected", status: "ok", vapi_call_id: vapiCallId, business_id: businessId });
          }
        }
      }
    }

    // ── Billing deduction ──────────────────────────────────────────────────
    if (businessId && durationSecs && durationSecs > 0) {
      const { data: newBalance, error: deductErr } = await supabase.rpc("deduct_call_seconds", {
        p_business_id: businessId,
        p_seconds: durationSecs,
      });

      if (deductErr) {
        log({ event_type: "billing_deduction", status: "error", business_id: businessId, error_message: deductErr.message });
      } else {
        const balanceBefore = (newBalance as number) + durationSecs;
        log({ event_type: "billing_deduction", status: "ok", business_id: businessId, deducted_secs: durationSecs, new_balance: newBalance });

        const crossedLow  = balanceBefore > LOW_BALANCE_THRESHOLD_SECS && (newBalance as number) <= LOW_BALANCE_THRESHOLD_SECS;
        const crossedZero = balanceBefore > 0 && (newBalance as number) <= 0;

        if (crossedLow || crossedZero) {
          const { data: biz } = await supabase
            .from("businesses")
            .select("name, owner_phone, allow_overage")
            .eq("id", businessId)
            .single();

          if (biz?.owner_phone) {
            const minLeft = Math.max(0, Math.floor((newBalance as number) / 60));
            const smsText = crossedZero
              ? biz.allow_overage
                ? `Orvia alert: ${biz.name} has run out of call minutes (overage active, calls continuing). Top up to avoid interruption.`
                : `Orvia alert: ${biz.name} has run out of call minutes. New calls will be blocked until you top up.`
              : `Orvia: ${biz.name} is running low - about ${minLeft} minutes of call time remaining. Top up soon to keep calls going.`;

            const smsPromise = sendTwilioSms(biz.owner_phone, smsText);
            try {
              EdgeRuntime.waitUntil(smsPromise);
            } catch {
              smsPromise.catch(() => {});
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // All other event types - ack and ignore
  log({ event_type: msg.type, status: "skipped", vapi_call_id: vapiCallId });
  return new Response(JSON.stringify({ ok: true, skipped: msg.type }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
