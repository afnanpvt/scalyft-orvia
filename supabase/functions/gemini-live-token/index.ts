import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

// Mints a single-use Gemini Live ephemeral token for the dashboard demo call.
// The real GEMINI_API_KEY never leaves the server; the browser gets a token
// that expires fast and can only open one session.
//
// Callers are either signed-in users, or visitors of the public voice demo
// presenting the project's public anon key. The gateway has already verified
// the JWT signature; visitors are told apart by its `role` claim and must
// clear three checks, since anyone can send the anon key:
//   1. a Cloudflare Turnstile token (when TURNSTILE_SECRET_KEY is set),
//   2. a per-visitor rate limit, and
//   3. an optional daily cap across all visitors,
// the last two set by an admin (Admin > Demo Data) and kept in Postgres
// (claim_demo_token), so they survive cold starts.
// Visitor tokens also live only a few minutes: enough for a demo call.

const LIVE_MODEL = Deno.env.get("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview";

const VISITOR_WINDOW_SECS = 600; // the per-visitor limit counts tokens in this window
const VISITOR_SESSION_MS = 4 * 60 * 1000; // the page ends a demo call at 3 minutes
const SIGNED_IN_SESSION_MS = 15 * 60 * 1000;

// Comma-separated origins allowed to call from a browser, e.g.
// "https://app.orvia.ai,http://localhost:5173". Unset allows any origin;
// CORS only steers browsers, the checks above are what stop abuse.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.length === 0 ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-turnstile-token",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// True when Cloudflare accepts the widget token. With no secret configured
// (local development) the check is skipped, and says so in the logs.
async function turnstileOk(token: string | null, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY not set: skipping the captcha check");
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch (e) {
    console.error("turnstile verify failed", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "GET") return json(req, { error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Missing Supabase credentials" }, 500);
  if (!geminiKey) return json(req, { error: "GEMINI_API_KEY not configured" }, 503);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const visitor = jwtRole(jwt) === "anon";
  if (visitor) {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!(await turnstileOk(req.headers.get("x-turnstile-token"), ip))) {
      return json(req, { error: "Could not verify you are human. Reload the page and try again." }, 403);
    }
    const { data: verdict, error } = await supabase.rpc("claim_demo_token", {
      p_ip_hash: await sha256Hex(ip),
      p_window_secs: VISITOR_WINDOW_SECS,
    });
    if (error) {
      console.error("claim_demo_token failed", error);
      return json(req, { error: "The demo is unavailable right now" }, 503);
    }
    if (verdict === "ip_limit") return json(req, { error: "That's a lot of demo calls. Try again in a few minutes." }, 429);
    if (verdict === "daily_cap") return json(req, { error: "The live demo is busy today. Book a call and we'll show you." }, 429);
  } else {
    const { data: auth } = await supabase.auth.getUser(jwt);
    if (!auth.user) return json(req, { error: "Not authenticated" }, 401);
  }

  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + (visitor ? VISITOR_SESSION_MS : SIGNED_IN_SESSION_MS)).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      },
    });
    return json(req, { token: token.name, model: LIVE_MODEL });
  } catch (e) {
    console.error("gemini-live-token failed", e);
    return json(req, { error: "Could not mint Gemini token" }, 502);
  }
});
