import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by the dashboard (authenticated fetch) when the owner clicks
// "Connect Google Calendar". Returns the Google consent URL to navigate to.
// The redirect back to Google always uses this project's own
// google-oauth-callback function as redirect_uri — never a value supplied
// by the caller — so there's nothing here for a forged request to redirect.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return atob(padded);
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase credentials" }, 500);
  }
  if (!googleClientId) {
    return json({ error: "Google Calendar isn't configured yet — GOOGLE_CLIENT_ID secret is missing." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  try {
    const payload = JSON.parse(base64UrlDecode(jwt.split(".")[1]));
    userId = payload.sub ?? null;
  } catch {
    // fall through to 401 below
  }
  if (!userId) {
    return json({ error: "Not authenticated" }, 401);
  }

  const url = new URL(req.url);
  const origin = url.searchParams.get("origin");
  if (!origin) {
    return json({ error: "Missing origin" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRow } = await supabase.from("users").select("business_id").eq("id", userId).single();
  if (!userRow?.business_id) {
    return json({ error: "No business associated with this account" }, 400);
  }

  const token = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from("google_oauth_states")
    .insert({ state: token, business_id: userRow.business_id });

  if (insertError) {
    console.error("google-oauth-start: failed to store state", insertError.message);
    return json({ error: "Could not start Google connection" }, 500);
  }

  const state = base64UrlEncode(JSON.stringify({ token, origin }));
  const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events openid email");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return json({ url: authUrl.toString() });
});
