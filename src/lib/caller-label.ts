import type { Call } from "@/lib/types";

// Browser test calls (Talk to Assistant / Demo) have no caller number; the DB
// tags them extracted_data.source = "web" so they read as tests, not strangers.
export function isWebTestCall(call: Pick<Call, "caller_phone" | "extracted_data">): boolean {
  return !call.caller_phone && (call.extracted_data as Record<string, unknown> | null)?.source === "web";
}

export function callerPhoneLabel(call: Pick<Call, "caller_phone" | "extracted_data">): string {
  if (call.caller_phone) return call.caller_phone;
  return isWebTestCall(call) ? "Test call" : "Unknown caller";
}
