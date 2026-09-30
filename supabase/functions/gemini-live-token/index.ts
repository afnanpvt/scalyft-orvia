import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

// Spike: mints a single-use Gemini Live ephemeral token for the dashboard demo
// call. The real GEMINI_API_KEY never leaves the server; the browser gets a
// token that expires fast and can only open one session.

const LIVE_MODEL = Deno.env.get("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview";

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
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);
  if (!geminiKey) return json({ error: "GEMINI_API_KEY not configured" }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(jwt);
  if (!auth.user) return json({ error: "Not authenticated" }, 401);

  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      },
    });
    return json({ token: token.name, model: LIVE_MODEL });
  } catch (e) {
    console.error("gemini-live-token failed", e);
    return json({ error: "Could not mint Gemini token" }, 502);
  }
});
