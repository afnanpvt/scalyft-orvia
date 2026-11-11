// Owner / caller notifications: Twilio SMS + Resend email. All best-effort.

export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const auth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !auth || !from || !to) return false;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${auth}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });
    if (!r.ok) console.error("twilio sms failed", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("twilio sms error", e);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM_EMAIL");
  if (!key || !from || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!r.ok) console.error("resend failed", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("resend error", e);
    return false;
  }
}

export interface OwnerTarget {
  phone: string | null;
  email: string | null;
}

/** Per-business only. Deliberately NO global fallback number (it would leak across tenants). */
export function ownerTarget(b: {
  settings?: Record<string, unknown> | null;
  owner_phone?: string | null;
  notification_email?: string | null;
}): OwnerTarget {
  return {
    phone: (b.settings?.notification_phone as string | undefined) ?? b.owner_phone ?? null,
    email: b.notification_email ?? null,
  };
}

export function callLink(callId: string | null): string {
  const base = Deno.env.get("APP_URL");
  return base && callId ? `${base.replace(/\/$/, "")}/calls/${callId}` : "";
}

export interface JobSummary {
  tag: string; // "NEW JOB BOOKED" | "EMERGENCY" | "New lead" | "Missed call" ...
  businessName: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  issue?: string | null;
  urgency?: string | null;
  when?: string | null;
  notes?: string | null;
  link?: string;
}

export function formatJobSms(j: JobSummary): string {
  return [
    `${j.tag} - ${j.businessName}`,
    j.name && `Name: ${j.name}`,
    j.phone && `Phone: ${j.phone}`,
    j.address && `Address: ${j.address}`,
    j.issue && `Issue: ${j.issue}`,
    j.urgency && j.urgency !== "routine" && `Urgency: ${j.urgency.toUpperCase()}`,
    j.when && `Time: ${j.when}`,
    j.notes && `Notes: ${j.notes}`,
    j.link && `Transcript: ${j.link}`,
  ].filter(Boolean).join("\n");
}

/** SMS (+ email when configured) to the owner. Returns true if any channel delivered. */
export async function notifyOwner(
  target: OwnerTarget,
  j: JobSummary,
): Promise<boolean> {
  const text = formatJobSms(j);
  const results = await Promise.all([
    target.phone ? sendSms(target.phone, text) : Promise.resolve(false),
    target.email ? sendEmail(target.email, `${j.tag} - ${j.businessName}`, text) : Promise.resolve(false),
  ]);
  return results.some(Boolean);
}
