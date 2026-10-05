import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

// Mints a single-use Gemini Live ephemeral token for the dashboard demo call.
// The real GEMINI_API_KEY never leaves the server; the browser gets a token
// that expires fast and can only open one session.
//
// Callers are either signed-in users, or guests presenting the project's
// public anon key (guest mode has no account). The gateway has already
// verified the JWT signature; guests are told apart by its `role` claim and
// throttled per IP, since anyone can send the anon key.

const LIVE_MODEL = Deno.env.get("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview";

const GUEST_LIMIT = 8; // tokens per IP per window
const GUEST_WINDOW_MS = 60_000;
const guestHits = new Map<string, number[]>();

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

function jwtRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function guestAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (guestHits.get(ip) ?? []).filter((t) => now - t < GUEST_WINDOW_MS);
  if (hits.length >= GUEST_LIMIT) {
    guestHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  guestHits.set(ip, hits);
  if (guestHits.size > 5000) guestHits.clear(); // keep the isolate's memory bounded
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);
  if (!geminiKey) return json({ error: "GEMINI_API_KEY not configured" }, 503);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (jwtRole(jwt) === "anon") {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!guestAllowed(ip)) return json({ error: "Too many requests, try again in a minute" }, 429);
  } else {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: auth } = await supabase.auth.getUser(jwt);
    if (!auth.user) return json({ error: "Not authenticated" }, 401);
  }

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
