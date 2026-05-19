import { supabase } from "@/lib/supabase";
import type { Call, Lead, Appointment, Clinic } from "@/lib/types";

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

// ─── Clinic Settings ─────────────────────────────────────

export async function getClinicSettings(): Promise<Clinic | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("id", user.id)
    .single();

  if (!userRow) return null;

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("id", userRow.clinic_id)
    .single();

  return (clinic as Clinic) ?? null;
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
  const endOfDayISO = endOfDay.toISOString();

  const [
    callsRes,
    leadsRes,
    appointmentsCountRes,
    appointmentsRes,
    exceptionsRes,
    recentRes,
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
      .gte("scheduled_start", todayISO)
      .lte("scheduled_start", endOfDayISO),
    // Today's appointments ONLY (not future days)
    supabase
      .from("appointments")
      .select("*")
      .gte("scheduled_start", todayISO)
      .lte("scheduled_start", endOfDayISO)
      .order("scheduled_start", { ascending: true })
      .limit(20),
    // Exception calls — transferred or failed (need attention)
    supabase
      .from("calls")
      .select("*")
      .in("status", ["transferred", "failed"])
      .gte("created_at", todayISO)
      .order("created_at", { ascending: false })
      .limit(5),
    // Recent calls for activity feed
    supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
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

  return {
    callsToday: callsRes.count ?? 0,
    leadsToday: leadsRes.count ?? 0,
    appointmentsToday: appointmentsCountRes.count ?? 0,
    todaysAppointments: (appointmentsRes.data as Appointment[]) ?? [],
    exceptionCalls: (exceptionsRes.data as Call[]) ?? [],
    recentCalls,
  };
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

export async function updateClinicSettings(
  clinicId: string,
  settings: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("clinics")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", clinicId);
  return { error: error?.message ?? null };
}

export async function updateClinicTopLevel(
  clinicId: string,
  fields: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("clinics")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", clinicId);
  return { error: error?.message ?? null };
}
