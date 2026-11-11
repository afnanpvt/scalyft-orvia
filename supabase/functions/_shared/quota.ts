// Plan limits + hard caps. Pure so it can be unit tested.

export const PLANS = {
  trial: { calls: 50 },
  solo: { calls: 100 },
  pro: { calls: 250 },
  scale: { calls: 600 },
} as const;

export type PlanName = keyof typeof PLANS;

export interface QuotaInput {
  plan: PlanName | null;
  calls_included: number | null;
  overage_cap_calls: number | null;
  allow_overage: boolean;
  seconds_remaining: number | null;
  billing_status?: string | null;
}

export interface QuotaResult {
  allowed: boolean;
  inOverage: boolean;
  used: number;
  limit: number | null;      // hard limit in calls (null = legacy minutes billing)
  reason?: "canceled" | "calls_exhausted" | "minutes_exhausted";
}

export function checkQuota(b: QuotaInput, callsUsed: number): QuotaResult {
  if (b.billing_status === "canceled") {
    return { allowed: false, inOverage: false, used: callsUsed, limit: b.calls_included, reason: "canceled" };
  }
  if (!b.plan) {
    const secs = b.seconds_remaining ?? 0;
    if (secs <= 0 && !b.allow_overage) {
      return { allowed: false, inOverage: false, used: callsUsed, limit: null, reason: "minutes_exhausted" };
    }
    return { allowed: true, inOverage: secs <= 0, used: callsUsed, limit: null };
  }
  const included = b.calls_included ?? PLANS[b.plan].calls;
  const hard = included + (b.allow_overage ? (b.overage_cap_calls ?? 0) : 0);
  if (callsUsed >= hard) {
    return { allowed: false, inOverage: callsUsed >= included, used: callsUsed, limit: hard, reason: "calls_exhausted" };
  }
  return { allowed: true, inOverage: callsUsed >= included, used: callsUsed, limit: hard };
}

/** Thresholds (as fraction of included calls) at which the owner gets a heads-up text. */
export function crossedThreshold(included: number, before: number, after: number): 0.8 | 1 | null {
  if (included <= 0) return null;
  if (before < included && after >= included) return 1;
  if (before < included * 0.8 && after >= included * 0.8) return 0.8;
  return null;
}
