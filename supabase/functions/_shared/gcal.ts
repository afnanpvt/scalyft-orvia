// Google Calendar via service account (no per-user OAuth).
// Setup per customer: they share their calendar with the service account's
// client_email ("Make changes to events") and we store the calendar id in
// businesses.settings.calendar_id. Env: GOOGLE_CALENDAR_SERVICE_ACCOUNT = base64(JSON key).

import type { Range } from "./slots.ts";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; exp: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT");
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as ServiceAccount;
  } catch (e) {
    console.error("GOOGLE_CALENDAR_SERVICE_ACCOUNT is not valid base64 JSON", e);
    return null;
  }
}

export function calendarConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export function serviceAccountEmail(): string | null {
  return loadServiceAccount()?.client_email ?? null;
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const sa = loadServiceAccount();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${b64url(sig)}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!r.ok) {
    console.error("google token error", r.status, await r.text());
    return null;
  }
  const j = await r.json() as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Busy ranges on the calendar. Returns null (not []) when the calendar can't be read,
 *  so callers can tell "free" from "unknown". */
export async function getBusy(calendarId: string, timeMin: Date, timeMax: Date): Promise<Range[] | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      }),
    });
    if (!r.ok) {
      console.error("gcal freebusy error", r.status, await r.text());
      return null;
    }
    const j = await r.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
    const cal = j.calendars?.[calendarId];
    if (!cal || cal.errors?.length) {
      console.error("gcal freebusy calendar error", JSON.stringify(cal?.errors));
      return null;
    }
    return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch (e) {
    console.error("gcal freebusy exception", e);
    return null;
  }
}

export interface NewEvent {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timezone: string;
}

export async function createEvent(calendarId: string, ev: NewEvent): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: ev.summary,
          description: ev.description,
          location: ev.location,
          start: { dateTime: ev.start.toISOString(), timeZone: ev.timezone },
          end: { dateTime: ev.end.toISOString(), timeZone: ev.timezone },
        }),
      },
    );
    if (!r.ok) {
      console.error("gcal create event error", r.status, await r.text());
      return null;
    }
    return ((await r.json()) as { id: string }).id;
  } catch (e) {
    console.error("gcal create event exception", e);
    return null;
  }
}
