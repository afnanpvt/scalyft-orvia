import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorized, verifyVapiRequest } from "../_shared/auth.ts";
import { callLink, notifyOwner, ownerTarget } from "../_shared/notify.ts";
import { json, parseToolCall, runInBackground, toolResponse } from "../_shared/vapi.ts";

// Vapi tool: capture_lead  (callback request / emergency / couldn't book)
// Stores the lead and texts the owner immediately - including after hours,
// which is the whole point of the product.

const NAME = "capture_lead";
const URGENCIES = new Set(["emergency", "urgent", "routine", "inquiry"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const raw = await req.text();
  if (!(await verifyVapiRequest(req, raw))) return unauthorized();

  const businessId = new URL(req.url).searchParams.get("business_id");
  if (!businessId) return json({ error: "Missing business_id" }, 400);

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { toolCallId, args, vapiCallId, callerPhone } = parseToolCall(body);
  const name = args.name as string | undefined;
  const service = args.service_needed as string | undefined;
  const urgencyRaw = (args.urgency as string | undefined) ?? "routine";
  const urgency = URGENCIES.has(urgencyRaw) ? urgencyRaw : "routine";
  const address = (args.address as string | undefined) ?? null;
  const zip = (args.zip as string | undefined) ?? null;
  const notes = (args.notes as string | undefined) ?? null;
  const phone = (args.phone as string | undefined) ?? callerPhone ?? "unknown";

  if (!name || !service) return toolResponse(toolCallId, NAME, { error: "Need at least a name and what the problem is." });

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: business } = await supabase
    .from("businesses").select("settings, name, owner_phone, notification_email").eq("id", businessId).single();
  if (!business) return toolResponse(toolCallId, NAME, { error: "Couldn't save that. Tell the caller the owner will call back." });

  let callRowId: string | null = null;
  if (vapiCallId) {
    const { data: callRow } = await supabase.from("calls").select("id, outcome").eq("vapi_call_id", vapiCallId).maybeSingle();
    callRowId = callRow?.id ?? null;
    if (callRowId) {
      const { data: existing } = await supabase.from("leads").select("id").eq("call_id", callRowId).maybeSingle();
      if (existing) {
        return toolResponse(toolCallId, NAME, { success: true, lead_id: existing.id, message: "Saved. The owner will call back shortly." });
      }
    }
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      business_id: businessId, call_id: callRowId, name, phone,
      address, zip, service_needed: service, urgency, notes, status: "new",
    })
    .select("id").single();

  if (error) {
    console.error("capture-lead insert error:", error.message);
    return toolResponse(toolCallId, NAME, { error: "Couldn't save that. Tell the caller the owner will call back." });
  }

  if (vapiCallId) {
    const { data: existing } = await supabase.from("calls").select("outcome").eq("vapi_call_id", vapiCallId).maybeSingle();
    if (existing?.outcome !== "appointment_booked") {
      await supabase.from("calls").upsert(
        { vapi_call_id: vapiCallId, business_id: businessId, outcome: "lead_captured" },
        { onConflict: "vapi_call_id" },
      );
    }
  }

  runInBackground((async () => {
    const sent = await notifyOwner(ownerTarget(business), {
      tag: urgency === "emergency" ? "EMERGENCY" : urgency === "urgent" ? "URGENT" : "New lead",
      businessName: business.name, name, phone,
      address: [address, zip].filter(Boolean).join(" ") || null,
      issue: service, urgency, notes, link: callLink(callRowId),
    });
    if (sent && callRowId) {
      await supabase.from("calls").update({ owner_notified_at: new Date().toISOString() }).eq("id", callRowId);
    }
  })());

  return toolResponse(toolCallId, NAME, {
    success: true, lead_id: lead?.id,
    message: urgency === "emergency"
      ? "Saved and the owner has been alerted right now."
      : "Saved. The owner will call back shortly.",
  });
});
