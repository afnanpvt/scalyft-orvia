import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin } from "../_shared/auth.ts";
import { PRICE_ENV, stripeApi } from "../_shared/stripe.ts";
import { json } from "../_shared/vapi.ts";

// Creates a Stripe Checkout session: 14-day trial, card up front, plan chosen by caller.
// Callable by (a) a logged-in dashboard user for their own business (Authorization: Bearer <jwt>)
// or (b) Orvia admin for any business (x-admin-secret + business_id) - used during done-for-you onboarding.
// Body: { plan: "solo"|"pro"|"scale", business_id?: string }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-admin-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) return json({ error: "APP_URL not set" }, 500);

  const body = await req.json().catch(() => ({})) as { plan?: string; business_id?: string };
  const plan = body.plan ?? "";
  const priceEnv = PRICE_ENV[plan];
  const price = priceEnv ? Deno.env.get(priceEnv) : undefined;
  if (!price) return json({ error: "Unknown plan or price not configured" }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let businessId: string | null = null;
  if (verifyAdmin(req)) {
    businessId = body.business_id ?? null;
  } else {
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: row } = await admin.from("users").select("business_id").eq("id", u.user.id).single();
    businessId = row?.business_id ?? null;
  }
  if (!businessId) return json({ error: "No business" }, 400);

  const { data: biz } = await admin.from("businesses")
    .select("id, name, stripe_customer_id, notification_email").eq("id", businessId).single();
  if (!biz) return json({ error: "Business not found" }, 404);

  try {
    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      payment_method_collection: "always",
      "subscription_data[trial_period_days]": "14",
      "subscription_data[trial_settings][end_behavior][missing_payment_method]": "cancel",
      "subscription_data[metadata][business_id]": biz.id,
      "subscription_data[metadata][plan]": plan,
      client_reference_id: biz.id,
      "metadata[business_id]": biz.id,
      "metadata[plan]": plan,
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=cancelled`,
    };
    if (biz.stripe_customer_id) params.customer = biz.stripe_customer_id;
    else if (biz.notification_email) params.customer_email = biz.notification_email;

    const session = await stripeApi<{ url: string }>("checkout/sessions", params);
    return json({ url: session.url }, 200);
  } catch (e) {
    console.error("create-checkout error", e);
    return json({ error: "Could not start checkout" }, 502);
  }
});
