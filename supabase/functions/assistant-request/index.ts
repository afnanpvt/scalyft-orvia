import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorized, verifyVapiRequest } from "../_shared/auth.ts";
import { buildAssistantConfig, type BusinessRow } from "../_shared/assistant.ts";
import { checkQuota, type QuotaInput } from "../_shared/quota.ts";
import { json } from "../_shared/vapi.ts";

// Vapi "assistant-request": called on every inbound call. We look up the business by
// the dialed Vapi number, enforce plan limits, and return a freshly built assistant.

function pausedAssistant(name: string) {
  return {
    assistant: {
      firstMessage: `Thanks for calling ${name}. We can't take your call right now. Please try again later or call back during business hours.`,
      endCallAfterSpoken: true,
      model: { provider: "openai", model: "gpt-4o-mini", messages: [{ role: "system", content: "Say the first message and end the call." }] },
      voice: { provider: "vapi", voiceId: "Lily" },
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const raw = await req.text();
  if (!(await verifyVapiRequest(req, raw))) return unauthorized();

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const msg = body.message as Record<string, unknown> | undefined;
  const callObj = (msg?.call ?? body.call) as Record<string, unknown> | undefined;
  const phoneNumberId = (msg?.phoneNumberId as string) ?? (callObj?.phoneNumberId as string) ?? (body.phoneNumberId as string);
  if (!phoneNumberId) return json({ error: "Missing phoneNumberId" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: biz, error } = await supabase
    .from("businesses").select("*").eq("vapi_phone_id", phoneNumberId).eq("status", "active").single();
  if (error || !biz) {
    console.error("business lookup failed:", error?.message ?? "not found", phoneNumberId);
    return json({ error: "Business not found for this phone number" }, 404);
  }

  // ── Plan / hard-cap gate ──────────────────────────────────────────────────
  const { data: used } = await supabase.rpc("calls_used_in_period", { p_business_id: biz.id });
  const quota = checkQuota(biz as QuotaInput, (used as number) ?? 0);
  if (!quota.allowed) {
    console.log(JSON.stringify({ fn: "assistant-request", event: "quota_block", business_id: biz.id, ...quota }));
    return json(pausedAssistant(biz.name));
  }

  const config = buildAssistantConfig(biz as BusinessRow, {
    supabaseUrl,
    webhookSecret: Deno.env.get("VAPI_WEBHOOK_SECRET"),
  });
  return json({ assistant: config });
});
