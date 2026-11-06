import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

// Backend for the on-phone call agent (the "assistant" Android build).
//
// The agent runs in a background service, often with the app closed, so it
// cannot use the owner's login session. Instead the signed-in app links the
// phone once (action "register") and gets a device token: an HMAC over the
// user and business ids. With it the phone can only
//   * "gemini_token": mint a short-lived Gemini Live token, and
//   * "save":         write the calls it answered into the owner's calls,
// both scoped to the business named in the token. Every use re-checks that the
// user still belongs to that business, so removing the user revokes the phone.
//
// verify_jwt is off: "register" verifies the user's JWT itself, the other
// actions use the device token instead of a JWT.

const SUMMARY_MODEL = Deno.env.get("GEMINI_SUMMARY_MODEL") ?? "gemini-flash-latest";
const MAX_TURNS = 400;
const MAX_TURN_CHARS = 4000;
const MAX_NOTES = 50;

type Turn = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): string {
  return atob(text.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function issueToken(secret: string, userId: string, businessId: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, u: userId, b: businessId, iat: Date.now() })));
  return `${payload}.${await hmac(secret, `device-agent.${payload}`)}`;
}

async function readToken(secret: string, token: string | null): Promise<{ u: string; b: string } | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(secret, `device-agent.${payload}`))) return null;
  try {
    const claims = JSON.parse(b64urlDecode(payload)) as { v?: number; u?: string; b?: string };
    return claims.v === 1 && claims.u && claims.b ? { u: claims.u, b: claims.b } : null;
  } catch {
    return null;
  }
}

function cleanTurns(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TURNS).flatMap((t) => {
    const role = (t as { role?: unknown })?.role;
    const content = String((t as { content?: unknown })?.content ?? "").trim().slice(0, MAX_TURN_CHARS);
    if (!content || (role !== "user" && role !== "assistant")) return [];
    return [{ role, content } as Turn];
  });
}

function cleanNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_NOTES).map((n) => String(n ?? "").trim().slice(0, 1000)).filter(Boolean);
}

function cleanPhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, "");
  return digits.length >= 3 && digits.length <= 20 ? digits : null;
}

function toIso(ms: unknown): string | null {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Analysis = { summary?: string; caller_name?: string; reason?: string; urgency?: string; callback?: string };

// One short English summary for the dashboard, whatever language the call was in.
async function analyse(geminiKey: string | undefined, turns: Turn[], notes: string[]): Promise<Analysis> {
  if (!geminiKey || turns.length === 0) return {};
  const transcript = turns.map((t) => `${t.role === "user" ? "Caller" : "Assistant"}: ${t.content}`).join("\n");
  const prompt = `This is a phone call that an AI assistant answered for the phone's owner.
Reply with only a JSON object with these keys, all in English:
"summary": one or two sentences for the owner: who called, why, and anything they asked for,
"caller_name": the caller's name if they said it, else "",
"reason": a few words on why they called, else "",
"urgency": "emergency", "urgent", "routine" or "inquiry",
"callback": a callback number or time if they gave one, else "".

Notes the assistant saved: ${notes.length ? notes.join(" | ") : "none"}

Transcript:
${transcript}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
    );
    if (!res.ok) {
      console.error("summary failed", res.status, await res.text());
      return {};
    }
    const out = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text) as Analysis;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (e) {
    console.error("summary error", e);
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);
  const secret = Deno.env.get("DEVICE_AGENT_SECRET") ?? serviceRoleKey;
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: { action?: string; call?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.action === "register") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: "Not authenticated" }, 401);
    const { data: userRow } = await db.from("users").select("business_id").eq("id", auth.user.id).single();
    if (!userRow?.business_id) return json({ error: "No business associated with this account" }, 400);
    return json({ token: await issueToken(secret, auth.user.id, userRow.business_id) });
  }

  const claims = await readToken(secret, req.headers.get("x-orvia-device-token"));
  if (!claims) return json({ error: "Phone not linked. Open Orvia Assistant and link it again." }, 401);
  const { data: owner } = await db.from("users").select("business_id").eq("id", claims.u).maybeSingle();
  if (owner?.business_id !== claims.b) return json({ error: "This phone's link was revoked. Link it again." }, 401);

  if (body.action === "gemini_token") {
    if (!geminiKey) return json({ error: "GEMINI_API_KEY not configured" }, 503);
    try {
      const client = new GoogleGenAI({ apiKey: geminiKey });
      const token = await client.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        },
      });
      return json({ token: token.name, model: Deno.env.get("GEMINI_LIVE_MODEL") ?? "" });
    } catch (e) {
      console.error("device-agent gemini token failed", e);
      return json({ error: "Could not mint Gemini token" }, 502);
    }
  }

  if (body.action === "save") {
    const call = body.call ?? {};
    const id = String(call.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid call id" }, 400);
    const turns = cleanTurns(call.turns);
    const notes = cleanNotes(call.notes);
    const startedAt = toIso(call.started_at);
    const endedAt = toIso(call.ended_at);
    const durationSecs = startedAt && endedAt
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
      : null;
    const analysis = await analyse(geminiKey, turns, notes);
    const summary = analysis.summary?.trim() ||
      (notes.length ? notes.join(". ") : turns.length ? "The agent answered this call." : "The caller hung up before speaking.");
    const urgency = ["emergency", "urgent", "routine", "inquiry"].includes(analysis.urgency ?? "") ? analysis.urgency : undefined;

    const row = {
      business_id: claims.b,
      vapi_call_id: `device-${id}`,
      // No number means a hidden caller; a NULL here would be tagged as a web test call.
      caller_phone: cleanPhone(call.caller_number) ?? "Private number",
      status: "completed",
      started_at: startedAt,
      ended_at: endedAt,
      duration_secs: durationSecs,
      transcript: turns,
      transcript_status: turns.length > 0 ? "complete" : "failed",
      summary,
      outcome: notes.length > 0 || analysis.reason ? "lead_captured" : "info_given",
      extracted_data: {
        source: "phone_agent",
        notes,
        ...(analysis.caller_name ? { caller_name: analysis.caller_name } : {}),
        ...(analysis.reason ? { reason: analysis.reason } : {}),
        ...(analysis.callback ? { callback: analysis.callback } : {}),
        ...(urgency ? { urgency } : {}),
      },
      webhook_received_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("calls").upsert(row, { onConflict: "vapi_call_id" }).select("id").single();
    if (error) {
      console.error("device-agent save failed", error);
      return json({ error: "Could not save the call" }, 500);
    }
    return json({ ok: true, id: data?.id });
  }

  return json({ error: "Unknown action" }, 400);
});
