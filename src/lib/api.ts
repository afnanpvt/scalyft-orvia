import { supabase } from "@/lib/supabase";
import type { Call, Lead, Appointment, Business, OperationalEvent, CallQueueItem } from "@/lib/types";

// ─── Overview ────────────────────────────────────────────

export async function getOverviewStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [callsRes, leadsRes, appointmentsRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
  ]);

  return {
    callsToday: callsRes.count ?? 0,
    leadsToday: leadsRes.count ?? 0,
    appointmentsToday: appointmentsRes.count ?? 0,
  };
}

// ─── Calls ───────────────────────────────────────────────

export async function getRecentCalls(limit = 5): Promise<Call[]> {
  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Call[]) ?? [];
}

export async function getCalls(
  page = 1,
  pageSize = 20,
): Promise<{ calls: Call[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await supabase
    .from("calls")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { calls: (data as Call[]) ?? [], total: count ?? 0 };
}

export async function getCallById(id: string): Promise<Call | null> {
  const { data } = await supabase
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();
  return (data as Call) ?? null;
}

// ─── Leads ───────────────────────────────────────────────

export async function getLeads(
  page = 1,
  pageSize = 20,
  status?: string,
): Promise<{ leads: Lead[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, count } = await query;
  return { leads: (data as Lead[]) ?? [], total: count ?? 0 };
}

export async function getLeadByCallId(callId: string): Promise<Lead | null> {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();
  return (data as Lead) ?? null;
}

// ─── Appointments ────────────────────────────────────────

export async function getAppointmentByCallId(
  callId: string,
): Promise<Appointment | null> {
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();
  return (data as Appointment) ?? null;
}

export async function getAppointments(opts?: {
  range?: "upcoming" | "past" | "all";
  status?: Appointment["status"];
}): Promise<Appointment[]> {
  let query = supabase.from("appointments").select("*");

  const range = opts?.range ?? "all";
  if (range === "upcoming") {
    query = query
      .gte("scheduled_start", new Date().toISOString())
      .order("scheduled_start", { ascending: true });
  } else if (range === "past") {
    query = query
      .lt("scheduled_start", new Date().toISOString())
      .order("scheduled_start", { ascending: false });
  } else {
    query = query.order("scheduled_start", { ascending: true });
  }

  if (opts?.status) query = query.eq("status", opts.status);

  const { data } = await query.limit(100);
  return (data as Appointment[]) ?? [];
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"],
) {
  const { error } = await supabase
    .from("appointments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Charts ──────────────────────────────────────────────

export async function getWeeklyCallStats() {
  const days: {
    date: string;
    calls: number;
    leads: number;
    appointments: number;
  }[] = [];

  // Batch all 7 days × 3 queries = 21 queries in parallel
  const promises = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    promises.push(
      Promise.all([
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
      ]).then(([callsRes, leadsRes, apptsRes]) => ({
        date: d.toLocaleDateString("en-US", { weekday: "short" }),
        calls: callsRes.count ?? 0,
        leads: leadsRes.count ?? 0,
        appointments: apptsRes.count ?? 0,
      })),
    );
  }

  const results = await Promise.all(promises);
  return results;
}

export async function getOutcomeBreakdown() {
  const { data } = await supabase.from("calls").select("outcome");
  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const key = (row as { outcome: string | null }).outcome ?? "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts).map(([outcome, count]) => ({
    outcome: outcome.replace(/_/g, " "),
    count,
  }));
}

// ─── Business Settings ───────────────────────────────────

export async function getBusinessSettings(): Promise<Business | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (!userRow) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", userRow.business_id)
    .single();

  return (business as Business) ?? null;
}

// Keep old name as alias so callers that haven't been updated yet still compile
export const getClinicSettings = getBusinessSettings;

// ─── Billing ─────────────────────────────────────────────

export async function getBusinessBilling(): Promise<{
  seconds_remaining: number;
  allow_overage: boolean;
  owner_phone: string | null;
  status: string | null;
  vapi_phone_id: string | null;
} | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (!userRow) return null;

  const { data } = await supabase
    .from("businesses")
    .select("seconds_remaining, allow_overage, owner_phone, status, vapi_phone_id")
    .eq("id", userRow.business_id)
    .single();

  return data ?? null;
}

// ─── Follow-up Queue ─────────────────────────────────────

export async function getFollowUpQueue(): Promise<Lead[]> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("*, appointments!left(id)")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (!data) return [];

  return (data as (Lead & { appointments: { id: string }[] })[])
    .filter((row) => !row.appointments || row.appointments.length === 0)
    .map(({ appointments: _appts, ...lead }) => lead as Lead);
}

// ─── Missed Call Queue ───────────────────────────────────

export async function getMissedCallQueue(): Promise<Call[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("calls")
    .select("*")
    .eq("status", "missed")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });
  return (data as Call[]) ?? [];
}

// ─── Missed Call Heatmap ─────────────────────────────────

export async function getMissedCallHeatmap(): Promise<{ hour: number; count: number }[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("calls")
    .select("created_at")
    .eq("status", "missed")
    .gte("created_at", cutoff);

  if (!data || data.length === 0) return [];

  const counts: Record<number, number> = {};
  for (const row of data as { created_at: string }[]) {
    const hour = new Date(row.created_at).getHours();
    counts[hour] = (counts[hour] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// ─── Live Call Status ─────────────────────────────────────

export async function getLiveCallStatus(): Promise<Call | null> {
  const { data } = await supabase
    .from("calls")
    .select("*")
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Call) ?? null;
}

// ─── Briefing (Home Page) ────────────────────────────────

export async function getBriefing() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const [
    callsRes,
    leadsRes,
    appointmentsCountRes,
    appointmentsRes,
    exceptionsRes,
    recentRes,
    businessRes,
  ] = await Promise.all([
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("appointments")
      .select("*")
      .gte("scheduled_start", new Date().toISOString())
      .in("status", ["confirmed", "rescheduled"])
      .order("scheduled_start", { ascending: true })
      .limit(20),
    supabase
      .from("calls")
      .select("*")
      .in("status", ["transferred", "failed"])
      .gte("created_at", todayISO)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("businesses")
      .select("status, vapi_phone_id, seconds_remaining, allow_overage")
      .limit(1)
      .maybeSingle(),
  ]);

  const rawRecent = (recentRes.data as Call[]) ?? [];

  // Derive is_repeat_caller: phone appears more than once across all recent calls
  const phoneCounts: Record<string, number> = {};
  for (const c of rawRecent) {
    if (c.caller_phone) phoneCounts[c.caller_phone] = (phoneCounts[c.caller_phone] ?? 0) + 1;
  }
  const recentCalls = rawRecent.map((c) => ({
    ...c,
    is_repeat_caller: c.caller_phone ? (phoneCounts[c.caller_phone] ?? 0) > 1 : false,
  }));

  const todayStart = today.toISOString();
  const todayCallDurations = rawRecent
    .filter((c) => c.created_at >= todayStart && c.duration_secs != null)
    .map((c) => c.duration_secs as number);
  const avgCallSecs = todayCallDurations.length > 0
    ? Math.round(todayCallDurations.reduce((a, b) => a + b, 0) / todayCallDurations.length)
    : null;

  const biz = businessRes.data;
  const secondsRemaining = (biz?.seconds_remaining as number) ?? 0;
  const allowOverage = !!(biz?.allow_overage);
  const hasCredits = secondsRemaining > 0 || allowOverage;

  return {
    callsToday: callsRes.count ?? 0,
    leadsToday: leadsRes.count ?? 0,
    appointmentsToday: appointmentsCountRes.count ?? 0,
    upcomingAppointments: (appointmentsRes.data as Appointment[]) ?? [],
    exceptionCalls: (exceptionsRes.data as Call[]) ?? [],
    recentCalls,
    avgCallSecs,
    businessStatus: (biz?.status as string) ?? null,
    businessHasPhone: !!(biz?.vapi_phone_id),
    secondsRemaining,
    allowOverage,
    hasCredits,
  };
}

// ─── Operational Events ───────────────────────────────────

export async function getUnresolvedOperationalEvents(): Promise<OperationalEvent[]> {
  const { data } = await supabase
    .from("operational_events")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as OperationalEvent[]) ?? [];
}

export async function resolveOperationalEvent(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("operational_events")
    .update({ resolved: true })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Call Queue ───────────────────────────────────────────

export async function getPendingCallQueue(): Promise<CallQueueItem[]> {
  const { data } = await supabase
    .from("call_queue")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(30);
  return (data as CallQueueItem[]) ?? [];
}

export async function markQueueItemHandled(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("call_queue")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Actions ─────────────────────────────────────────────

export async function markCallHandled(callId: string) {
  const { error } = await supabase
    .from("calls")
    .update({ status: "completed" })
    .eq("id", callId);
  return { error: error?.message ?? null };
}

export async function markLeadContacted(leadId: string) {
  const { error } = await supabase
    .from("leads")
    .update({ status: "contacted", updated_at: new Date().toISOString() })
    .eq("id", leadId);
  return { error: error?.message ?? null };
}

export async function markLeadBooked(leadId: string) {
  const { error } = await supabase
    .from("leads")
    .update({ status: "booked", updated_at: new Date().toISOString() })
    .eq("id", leadId);
  return { error: error?.message ?? null };
}

// ─── Settings (Save) ────────────────────────────────────

export async function updateBusinessSettings(
  businessId: string,
  settings: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("businesses")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", businessId);
  return { error: error?.message ?? null };
}

export async function updateBusinessTopLevel(
  businessId: string,
  fields: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("businesses")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", businessId);
  return { error: error?.message ?? null };
}

// Keep old names as aliases for any callers not yet updated
export const updateClinicSettings = updateBusinessSettings;
export const updateClinicTopLevel = updateBusinessTopLevel;

// ─── Global Search ───────────────────────────────────────

export type SearchResult =
  | { kind: "call"; id: string; title: string; subtitle: string; href: string }
  | { kind: "appointment"; id: string; title: string; subtitle: string; href: string }
  | { kind: "lead"; id: string; title: string; subtitle: string; href: string };

export async function globalSearch(q: string): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const [callsRes, apptsRes, leadsRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id, caller_phone, summary, outcome, created_at")
      .or(`caller_phone.ilike.${like},summary.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("appointments")
      .select("id, customer_name, customer_phone, service_type, scheduled_start")
      .or(`customer_name.ilike.${like},customer_phone.ilike.${like},service_type.ilike.${like}`)
      .order("scheduled_start", { ascending: true })
      .limit(8),
    supabase
      .from("leads")
      .select("id, name, phone, service_needed, status")
      .or(`name.ilike.${like},phone.ilike.${like},service_needed.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const results: SearchResult[] = [];

  for (const c of (callsRes.data ?? []) as Array<{
    id: string;
    caller_phone: string | null;
    summary: string | null;
    outcome: string | null;
  }>) {
    results.push({
      kind: "call",
      id: c.id,
      title: c.caller_phone ?? "Unknown caller",
      subtitle: c.summary ?? c.outcome ?? "Call",
      href: `/calls/${c.id}`,
    });
  }

  for (const a of (apptsRes.data ?? []) as Array<{
    id: string;
    customer_name: string;
    service_type: string | null;
    scheduled_start: string;
  }>) {
    const when = new Date(a.scheduled_start).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    results.push({
      kind: "appointment",
      id: a.id,
      title: a.customer_name,
      subtitle: `${a.service_type ?? "Appointment"} · ${when}`,
      href: `/appointments`,
    });
  }

  for (const l of (leadsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    phone: string;
    service_needed: string | null;
    status: string;
  }>) {
    results.push({
      kind: "lead",
      id: l.id,
      title: l.name ?? l.phone,
      subtitle: `${l.service_needed ?? "Lead"} · ${l.status}`,
      href: `/leads`,
    });
  }

  return results;
}
