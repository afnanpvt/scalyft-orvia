import { supabase } from "@/lib/supabase";
import type { Call, Lead, Appointment, Clinic } from "@/lib/types";

export async function getUserClinicId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("id", user.id)
    .single();

  return data?.clinic_id ?? null;
}

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

export async function getRecentCalls(limit = 15): Promise<Call[]> {
  
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentCalls error:", error);
    return [];
  }
  return (data as Call[]) ?? [];
}

export async function getCalls(
  page = 1,
  pageSize = 20
): Promise<{ calls: Call[]; total: number }> {
  
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("calls")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getCalls error:", error);
    return { calls: [], total: 0 };
  }
  return { calls: (data as Call[]) ?? [], total: count ?? 0 };
}

export async function getCallById(id: string): Promise<Call | null> {
  
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getCallById error:", error);
    return null;
  }
  return data as Call;
}

export async function getLeadByCallId(
  callId: string
): Promise<Lead | null> {
  
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  return (data as Lead) ?? null;
}

export async function getAppointmentByCallId(
  callId: string
): Promise<Appointment | null> {
  
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  return (data as Appointment) ?? null;
}

export async function getWeeklyCallStats(): Promise<
  { date: string; calls: number; leads: number; appointments: number }[]
> {
  
  const days: { date: string; calls: number; leads: number; appointments: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    const [callsRes, leadsRes, apptsRes] = await Promise.all([
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
    ]);

    days.push({
      date: d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }),
      calls: callsRes.count ?? 0,
      leads: leadsRes.count ?? 0,
      appointments: apptsRes.count ?? 0,
    });
  }

  return days;
}

export async function getOutcomeBreakdown(): Promise<
  { outcome: string; count: number }[]
> {
  
  const { data } = await supabase
    .from("calls")
    .select("outcome");

  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const key = row.outcome ?? "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts).map(([outcome, count]) => ({
    outcome: outcome.replace(/_/g, " "),
    count,
  }));
}

export async function getLeads(
  page = 1,
  pageSize = 20,
  status?: string
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

  const { data, error, count } = await query;

  if (error) {
    console.error("getLeads error:", error);
    return { leads: [], total: 0 };
  }
  return { leads: (data as Lead[]) ?? [], total: count ?? 0 };
}

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
