import { createClient } from "@/lib/supabase/server";
import type { Call, Lead, Appointment, Clinic } from "@/lib/types";

export async function getUserClinicId(): Promise<string | null> {
  const supabase = await createClient();
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
  const supabase = await createClient();

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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  return (data as Appointment) ?? null;
}

export async function getClinicSettings(): Promise<Clinic | null> {
  const supabase = await createClient();
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
