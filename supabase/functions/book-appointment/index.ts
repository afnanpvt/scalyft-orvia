import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorized, verifyVapiRequest } from "../_shared/auth.ts";
import { getBusyRanges } from "../_shared/availability.ts";
import { createEvent } from "../_shared/gcal.ts";
import { callLink, notifyOwner, ownerTarget, sendSms } from "../_shared/notify.ts";
import { json, parseToolCall, runInBackground, toolResponse } from "../_shared/vapi.ts";
import { formatSlotLong, overlaps, slotMinutesFor } from "../_shared/slots.ts";

// Vapi tool: book_appointment
// Re-checks the slot (Orvia DB + Google Calendar), creates the calendar event,
// stores the appointment, texts the caller a confirmation and the owner the job details.

const NAME = "book_appointment";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase credentials" }, 500);

  const raw = await req.text();
  if (!(await verifyVapiRequest(req, raw))) return unauthorized();

  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  if (!businessId) return json({ error: "Missing business_id" }, 400);

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { toolCallId, args, vapiCallId, callerPhone } = parseToolCall(body);
  const customerName = args.customer_name as string | undefined;
  const customerPhone = (args.customer_phone as string | undefined) ?? callerPhone ?? undefined;
  const serviceType = args.service_type as string | undefined;
  const slot = args.slot as string | undefined;
  const address = (args.address as string | undefined) ?? null;
  const zip = (args.zip as string | undefined) ?? null;
  const urgency = (args.urgency as string | undefined) ?? "routine";
  const notes = (args.notes as string | undefined) ?? null;

  if (!customerName || !customerPhone || !serviceType || !slot) {
    return toolResponse(toolCallId, NAME, { error: "Need name, phone, service, and time to book." });
  }
  const slotStart = new Date(slot);
  if (isNaN(slotStart.getTime())) return toolResponse(toolCallId, NAME, { error: "That time didn't come through. Ask for the time again." });
  if (slotStart.getTime() < Date.now()) return toolResponse(toolCallId, NAME, { error: "That time has already passed. Offer a later slot." });

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: business } = await supabase
    .from("businesses")
    .select("settings, timezone, name, owner_phone, notification_email")
    .eq("id", businessId).single();
  if (!business) return toolResponse(toolCallId, NAME, { error: "Couldn't confirm that slot. Offer to take a callback instead." });

  const settings = business.settings ?? {};
  const timezone = business.timezone ?? "America/Chicago";
  const slotMinutes = slotMinutesFor(settings, serviceType);
  const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);

  let callRowId: string | null = null;
  if (vapiCallId) {
    const { data: callRow } = await supabase.from("calls").select("id").eq("vapi_call_id", vapiCallId).maybeSingle();
    callRowId = callRow?.id ?? null;
    if (callRowId) {
      const { data: existing } = await supabase.from("appointments").select("id, scheduled_start")
        .eq("call_id", callRowId).maybeSingle();
      if (existing) {
        return toolResponse(toolCallId, NAME, {
          success: true, appointment_id: existing.id,
          message: `Already booked for ${formatSlotLong(existing.scheduled_start, timezone)}.`,
        });
      }
    }
  }

  // Conflict re-check: the slot may have been taken since check_availability.
  const { busy } = await getBusyRanges(supabase, businessId, settings, slotStart, slotEnd);
  if (overlaps(slotStart, slotEnd, busy)) {
    return toolResponse(toolCallId, NAME, { error: "That slot was just taken. Call check_availability again and offer another time." });
  }

  // Calendar event first (so a calendar failure is visible, but never blocks the booking)
  let calEventId: string | null = null;
  if (settings.calendar_id) {
    calEventId = await createEvent(settings.calendar_id, {
      summary: `${serviceType} - ${customerName}`,
      description: [
        `Customer: ${customerName}`, `Phone: ${customerPhone}`,
        address && `Address: ${address}`, `Urgency: ${urgency}`, notes && `Notes: ${notes}`,
        "Booked by Orvia AI receptionist",
      ].filter(Boolean).join("\n"),
      location: address ?? undefined,
      start: slotStart, end: slotEnd, timezone,
    });
    if (!calEventId) {
      await supabase.from("operational_events").insert({
        business_id: businessId, call_id: callRowId, event_type: "partial_booking", severity: "warning",
        payload: { reason: "calendar_event_failed", customer: customerName, slot },
      });
    }
  }

  const { data: appointment, error: aptError } = await supabase
    .from("appointments")
    .insert({
      business_id: businessId, call_id: callRowId,
      customer_name: customerName, customer_phone: customerPhone,
      service_type: serviceType, address, zip, urgency,
      scheduled_start: slotStart.toISOString(), scheduled_end: slotEnd.toISOString(),
      notes, status: "confirmed", google_cal_event_id: calEventId,
    })
    .select("id").single();

  if (aptError) {
    console.error("book-appointment insert error:", aptError.message);
    return toolResponse(toolCallId, NAME, { error: "Couldn't confirm that slot. Offer another time or a callback." });
  }

  if (vapiCallId) {
    await supabase.from("calls").upsert(
      { vapi_call_id: vapiCallId, business_id: businessId, outcome: "appointment_booked" },
      { onConflict: "vapi_call_id" },
    );
  }

  const when = formatSlotLong(slotStart, timezone);

  // Notifications run after the tool response is sent.
  runInBackground((async () => {
    await sendSms(
      customerPhone,
      `Confirmed: ${serviceType} with ${business.name} on ${when}${address ? ` at ${address}` : ""}. ` +
      `Reply STOP to opt out.`,
    );
    const sent = await notifyOwner(ownerTarget(business), {
      tag: urgency === "emergency" ? "EMERGENCY JOB BOOKED" : "NEW JOB BOOKED",
      businessName: business.name, name: customerName, phone: customerPhone,
      address: [address, zip].filter(Boolean).join(" ") || null,
      issue: serviceType, urgency, when, notes, link: callLink(callRowId),
    });
    if (sent && callRowId) {
      await supabase.from("calls").update({ owner_notified_at: new Date().toISOString() }).eq("id", callRowId);
    }
  })());

  return toolResponse(toolCallId, NAME, {
    success: true, appointment_id: appointment?.id,
    calendar_synced: !!calEventId,
    message: `Booked: ${serviceType} on ${when}.`,
  });
});
