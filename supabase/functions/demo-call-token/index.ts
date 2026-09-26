import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mintDemoToken } from "../_shared/vapi-auth.ts";

// Called by the dashboard right before a browser test call. Returns a token
// the browser attaches to the assistant's tool/webhook requests, so Vapi's
// calls back into our functions are accepted without ever shipping the real
// webhook secret to the browser. Scoped to the caller's own business, 30 min TTL.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // verify_jwt is on, so the gateway has already validated this token;
  // getUser resolves who it belongs to.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(jwt);
  if (!auth.user) return json({ error: "Not authenticated" }, 401);

  const { data: userRow } = await supabase.from("users").select("business_id").eq("id", auth.user.id).single();
  if (!userRow?.business_id) return json({ error: "No business associated with this account" }, 400);

  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  // No secret configured means the tool endpoints aren't enforcing auth either.
  if (!secret) return json({ token: null });

  return json({ token: await mintDemoToken(secret, userRow.business_id) });
});
