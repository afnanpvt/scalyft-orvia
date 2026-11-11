import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStripeSignature } from "../_shared/stripe.ts";
import { PLANS, type PlanName } from "../_shared/quota.ts";
import { json } from "../_shared/vapi.ts";

// Stripe -> businesses. Verified with STRIPE_WEBHOOK_SECRET (fail-closed).
// Handles: checkout.session.completed, customer.subscription.{created,updated,deleted}, invoice.payment_failed.
// Deploy with --no-verify-jwt (Stripe has no Supabase JWT).

type Obj = Record<string, unknown>;

function statusFor(s: string): "trialing" | "active" | "past_due" | "canceled" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 500);

  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret))) {
    return json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(raw) as { type: string; data: { object: Obj } };
  const o = event.data.object;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  async function businessFor(): Promise<string | null> {
    const meta = (o.metadata ?? {}) as Record<string, string>;
    if (meta.business_id) return meta.business_id;
    if (o.client_reference_id) return o.client_reference_id as string;
    const cust = (o.customer as string) ?? null;
    if (cust) {
      const { data } = await supabase.from("businesses").select("id").eq("stripe_customer_id", cust).maybeSingle();
      return data?.id ?? null;
    }
    return null;
  }

  const businessId = await businessFor();
  if (!businessId) return json({ ok: true, skipped: "no business" });

  switch (event.type) {
    case "checkout.session.completed": {
      await supabase.from("businesses").update({
        stripe_customer_id: o.customer as string,
        stripe_subscription_id: o.subscription as string,
      }).eq("id", businessId);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const meta = (o.metadata ?? {}) as Record<string, string>;
      const plan = (meta.plan as PlanName) in PLANS ? (meta.plan as PlanName) : null;
      const status = statusFor(o.status as string);
      const update: Obj = {
        stripe_customer_id: o.customer as string,
        stripe_subscription_id: o.id as string,
        billing_status: status,
        period_start: new Date((o.current_period_start as number) * 1000).toISOString(),
        period_end: new Date((o.current_period_end as number) * 1000).toISOString(),
      };
      if (plan) {
        // Trial period is capped at 50 calls regardless of the chosen plan.
        const effective = status === "trialing" ? "trial" : plan;
        update.plan = effective;
        update.calls_included = PLANS[effective].calls;
      }
      await supabase.from("businesses").update(update).eq("id", businessId);
      break;
    }
    case "customer.subscription.deleted": {
      await supabase.from("businesses").update({ billing_status: "canceled" }).eq("id", businessId);
      break;
    }
    case "invoice.payment_failed": {
      await supabase.from("businesses").update({ billing_status: "past_due" }).eq("id", businessId);
      break;
    }
  }
  return json({ ok: true });
});
