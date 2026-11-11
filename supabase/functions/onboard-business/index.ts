import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin } from "../_shared/auth.ts";
import { forwardingText } from "../_shared/forwarding.ts";
import { serviceAccountEmail } from "../_shared/gcal.ts";
import { PLANS } from "../_shared/quota.ts";
import { ALL_PARTY_CONSENT_STATES, TRADES, tradeOf } from "../_shared/trades.ts";
import { json } from "../_shared/vapi.ts";

// One call = one live customer (the ~15-minute onboarding).
//   POST /functions/v1/onboard-business   headers: x-admin-secret
// Body:
// {
//   name, trade: "hvac"|"plumbing"|"electrical", owner_name, owner_email, owner_phone,
//   timezone?, address?, city?, state? (2-letter, for recording-consent note),
//   service_area_zips: string[], calendar_id?,
//   transfer_number?, notification_email?,
//   hours?: {monday:{open,close,closed?}...},
//   area_code?  -> buy a free Vapi US number in this area code
//   twilio_number? -> import an existing Twilio number instead (needs TWILIO_ACCOUNT_SID/AUTH_TOKEN)
//   activate?: boolean (default true if a number was provisioned)
// }
// Returns the dashboard login, Orvia number, calendar-share step, forwarding instructions and warnings.

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function tempPassword(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return "Ov-" + Array.from(a).map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
}

const DEFAULT_HOURS = {
  monday: { open: "08:00", close: "17:00" }, tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" }, thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "08:00", close: "17:00", closed: true }, sunday: { open: "08:00", close: "17:00", closed: true },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!verifyAdmin(req)) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b = await req.json().catch(() => null) as Record<string, any> | null;
  if (!b?.name || !b.owner_email || !b.owner_phone || !Array.isArray(b.service_area_zips)) {
    return json({ error: "name, owner_email, owner_phone, service_area_zips[] are required" }, 400);
  }

  const warnings: string[] = [];
  const trade = tradeOf(b.trade);
  const tpl = TRADES[trade];
  const timezone = b.timezone ?? "America/Chicago";

  if (b.state && ALL_PARTY_CONSENT_STATES.has(String(b.state).toUpperCase())) {
    warnings.push(`${b.state} is an all-party recording-consent state. The greeting discloses recording on every call (recording_disclosure stays ON) - do not turn it off.`);
  }
  if (!b.calendar_id) {
    warnings.push("No calendar_id: bookings are stored in Orvia only and availability ignores the owner's own calendar.");
  }

  const settings = {
    business_owner: b.owner_name ?? null,
    address: b.address ?? null,
    city: b.city ?? null,
    receptionist_name: "Orvia",
    tone: "friendly, no-nonsense, efficient",
    language_preference: "english",
    trade,
    operating_hours: b.hours ?? DEFAULT_HOURS,
    service_details: b.service_details ?? tpl.services,
    faq: b.faq ?? tpl.faq,
    service_area_zips: b.service_area_zips,
    transfer_number: b.transfer_number ?? b.owner_phone,
    notification_phone: b.owner_phone,
    after_hours_policy: "transfer_then_capture",
    recording_disclosure: true,
    slot_duration_default: 90,
    buffer_between_appointments: 15,
    calendar_id: b.calendar_id ?? undefined,
    calendar_provider: b.calendar_id ? "google" : undefined,
    special_instructions: b.special_instructions ?? [],
  };

  const now = new Date();
  const { data: biz, error: bizErr } = await admin.from("businesses").insert({
    name: b.name,
    slug: `${slugify(b.name)}-${Math.random().toString(36).slice(2, 6)}`,
    timezone,
    trade,
    vertical: b.vertical ?? "home_services",
    region: ["us", "in", "uk"].includes(b.region) ? b.region : "us",
    status: "onboarding",
    owner_phone: b.owner_phone,
    notification_email: b.notification_email ?? b.owner_email,
    settings,
    plan: "trial",
    calls_included: PLANS.trial.calls,
    billing_status: "trialing",
    period_start: now.toISOString(),
    period_end: new Date(now.getTime() + 14 * 86400_000).toISOString(),
  }).select("id, slug").single();
  if (bizErr || !biz) return json({ error: `business insert failed: ${bizErr?.message}` }, 500);

  // Dashboard login (must change password on first sign-in)
  const password = tempPassword();
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: b.owner_email, password, email_confirm: true,
  });
  if (userErr || !created.user) {
    await admin.from("businesses").delete().eq("id", biz.id);
    return json({ error: `user create failed: ${userErr?.message}` }, 500);
  }
  await admin.from("users").insert({
    id: created.user.id, business_id: biz.id, email: b.owner_email,
    full_name: b.owner_name ?? null, role: "owner", must_change_password: true,
  });

  // US phone number via Vapi (free Vapi number by area code, or imported Twilio number)
  let orviaNumber: string | null = null;
  const vapiKey = Deno.env.get("VAPI_API_KEY");
  if (vapiKey && (b.area_code || b.twilio_number)) {
    const server = {
      url: `${supabaseUrl}/functions/v1/assistant-request`,
      ...(Deno.env.get("VAPI_WEBHOOK_SECRET") ? { secret: Deno.env.get("VAPI_WEBHOOK_SECRET") } : {}),
    };
    const payload = b.twilio_number
      ? {
        provider: "twilio", number: b.twilio_number, name: b.name,
        twilioAccountSid: Deno.env.get("TWILIO_ACCOUNT_SID"), twilioAuthToken: Deno.env.get("TWILIO_AUTH_TOKEN"), server,
      }
      : { provider: "vapi", numberDesiredAreaCode: String(b.area_code), name: b.name, server };
    const r = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const pj = await r.json().catch(() => ({})) as Record<string, any>;
    if (r.ok && pj.id) {
      orviaNumber = pj.number ?? pj.sipUri ?? null;
      await admin.from("businesses").update({
        vapi_phone_id: pj.id, phone_display: orviaNumber,
        status: b.activate === false ? "onboarding" : "active",
      }).eq("id", biz.id);
    } else {
      warnings.push(`Vapi number provisioning failed (${r.status}): ${JSON.stringify(pj).slice(0, 300)}. Business is saved with status "onboarding"; attach a number then set status active.`);
    }
  } else {
    warnings.push("No number provisioned (pass area_code or twilio_number, and set VAPI_API_KEY). Business stays in 'onboarding'.");
  }

  const saEmail = serviceAccountEmail();
  return json({
    business_id: biz.id,
    dashboard: { email: b.owner_email, temporary_password: password, must_change_on_first_login: true },
    orvia_number: orviaNumber,
    calendar_step: b.calendar_id
      ? saEmail ? `Customer must share calendar ${b.calendar_id} with ${saEmail} (permission: "Make changes to events").` : "GOOGLE_CALENDAR_SERVICE_ACCOUNT is not set on the server."
      : null,
    forwarding_instructions: orviaNumber ? forwardingText(orviaNumber) : null,
    checkout: "POST /functions/v1/create-checkout with {plan, business_id} + x-admin-secret to get the 14-day-trial card link.",
    test_call: orviaNumber ? `Call ${orviaNumber} now, book a slot, confirm the owner text arrives and the event is on the calendar.` : null,
    warnings,
  });
});
