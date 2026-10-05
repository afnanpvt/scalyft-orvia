import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Spike: bridge for Gemini Live tool calls. The browser can't call the Vapi
// tool endpoints directly (no CORS, and they expect Vapi's auth), so it calls
// this instead and we forward a Vapi-shaped request to the existing tool function.
//
// Fast path: the browser sends the demo-call-token it already holds for the
// call (x-orvia-demo-token). We forward it untouched and the tool function
// verifies its HMAC and business scope, so no auth or DB lookups happen here.
// Slow path (no token, e.g. VAPI_WEBHOOK_SECRET unset): resolve the user's
// business and forward with the webhook secret.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-orvia-demo-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOOL_PATHS: Record<string, string> = {
  capture_lead: "capture-lead",
  check_availability: "check-availability",
  book_appointment: "book-appointment",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function vapiBody(callId: string, toolCallId: string, tool: string, args: Record<string, unknown>) {
  return JSON.stringify({
    message: {
      call: { id: callId },
      toolCallList: [{ id: toolCallId, name: tool, arguments: args }],
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  let body: { tool?: string; args?: Record<string, unknown>; call_id?: string; tool_call_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Gemini calls send no end-of-call report (that's a Vapi webhook), so the
  // call row the booking tools created stays "in_progress" and the dashboard
  // shows "On call" forever. The browser calls this when the call ends.
  // The business is resolved from the signed-in user here, not from the demo
  // token, whose signature isn't checked in this function.
  if (body.tool === "finish") {
    if (!body.call_id) return json({ error: "Missing call_id" }, 400);
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth } = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    if (!auth.user) return json({ error: "Not authenticated" }, 401);
    const { data: userRow } = await db.from("users").select("business_id").eq("id", auth.user.id).single();
    if (!userRow?.business_id) return json({ error: "No business associated with this account" }, 400);
    const secs = Number((body.args as { duration_secs?: unknown } | undefined)?.duration_secs);
    const { error } = await db
      .from("calls")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        ...(Number.isFinite(secs) && secs >= 0 ? { duration_secs: Math.round(secs) } : {}),
      })
      .eq("vapi_call_id", body.call_id)
      .eq("business_id", userRow.business_id)
      .eq("status", "in_progress");
    return json({ ok: !error });
  }

  // The gateway has already verified the user's JWT (verify_jwt is on).
  const demoToken = req.headers.get("x-orvia-demo-token");
  let businessId: string | null = demoToken ? demoToken.split(".")[0] || null : null;
  let authHeaders: Record<string, string>;

  if (demoToken && businessId) {
    authHeaders = { "x-orvia-demo-token": demoToken };
  } else {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await supabase.auth.getUser(jwt);
    if (!auth.user) return json({ error: "Not authenticated" }, 401);
    const { data: userRow } = await supabase.from("users").select("business_id").eq("id", auth.user.id).single();
    if (!userRow?.business_id) return json({ error: "No business associated with this account" }, 400);
    businessId = userRow.business_id;
    const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
    authHeaders = secret ? { "x-vapi-secret": secret } : {};
  }

  const forward = (path: string, payload: string) =>
    fetch(`${supabaseUrl}/functions/v1/${path}?business_id=${businessId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, ...authHeaders },
      body: payload,
    });

  // Called at the start of a call so the first real lookup doesn't pay for
  // cold starts. Both tools return early on missing arguments, before any DB work.
  if (body.tool === "warmup") {
    await Promise.allSettled([
      forward("check-availability", vapiBody("warmup", "warmup", "check_availability", {})).then((r) => r.text()),
      forward("book-appointment", vapiBody("warmup", "warmup", "book_appointment", {})).then((r) => r.text()),
    ]);
    return json({ ok: true });
  }

  const path = body.tool ? TOOL_PATHS[body.tool] : undefined;
  if (!path || !body.call_id) return json({ error: "Unknown tool or missing call_id" }, 400);

  const resp = await forward(path, vapiBody(body.call_id, body.tool_call_id ?? crypto.randomUUID(), body.tool!, body.args ?? {}));
  if (resp.status === 401) return json({ error: "Tool auth failed" }, 401);
  if (!resp.ok) return json({ error: `Tool failed (${resp.status})` }, 502);

  // Tool functions answer { results: [{ toolCallId, name, result }] } where
  // `result` is a JSON string.
  try {
    const out = await resp.json() as { results?: Array<{ result?: unknown }> };
    const raw = out.results?.[0]?.result;
    let result: unknown = raw;
    if (typeof raw === "string") {
      try { result = JSON.parse(raw); } catch { result = raw; }
    }
    return json({ result: result ?? out });
  } catch {
    return json({ error: "Bad tool response" }, 502);
  }
});
