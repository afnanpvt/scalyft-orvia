import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Spike: bridge for Gemini Live tool calls. The browser can't call the Vapi
// tool endpoints directly (no CORS, and they expect Vapi's auth), so it calls
// this instead. We authenticate the dashboard user, work out their business,
// and forward a Vapi-shaped request to the existing tool function.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(jwt);
  if (!auth.user) return json({ error: "Not authenticated" }, 401);

  const { data: userRow } = await supabase.from("users").select("business_id").eq("id", auth.user.id).single();
  if (!userRow?.business_id) return json({ error: "No business associated with this account" }, 400);

  let body: { tool?: string; args?: Record<string, unknown>; call_id?: string; tool_call_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const path = body.tool ? TOOL_PATHS[body.tool] : undefined;
  if (!path || !body.call_id) return json({ error: "Unknown tool or missing call_id" }, 400);

  const toolCallId = body.tool_call_id ?? crypto.randomUUID();
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");

  const resp = await fetch(`${supabaseUrl}/functions/v1/${path}?business_id=${userRow.business_id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(secret ? { "x-vapi-secret": secret } : {}),
    },
    body: JSON.stringify({
      message: {
        call: { id: body.call_id },
        toolCallList: [{ id: toolCallId, name: body.tool, arguments: body.args ?? {} }],
      },
    }),
  });

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
