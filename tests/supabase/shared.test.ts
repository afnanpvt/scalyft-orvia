import { describe, expect, it } from "vitest";
import { buildAssistantConfig, buildGreeting, buildSystemPrompt, isOpenNow, type BusinessRow } from "../../supabase/functions/_shared/assistant";
import { checkQuota, crossedThreshold } from "../../supabase/functions/_shared/quota";
import { forwardingInstructions, digits } from "../../supabase/functions/_shared/forwarding";
import { generateSlots, lunchRange, slotMinutesFor, zonedDateTimeToUtc } from "../../supabase/functions/_shared/slots";
import { formatJobSms } from "../../supabase/functions/_shared/notify";

const biz: BusinessRow = {
  id: "b1",
  name: "Swift Plumbing",
  timezone: "America/Chicago",
  trade: "plumbing",
  settings: {
    operating_hours: {
      monday: { open: "08:00", close: "17:00" }, tuesday: { open: "08:00", close: "17:00" },
      wednesday: { open: "08:00", close: "17:00" }, thursday: { open: "08:00", close: "17:00" },
      friday: { open: "08:00", close: "17:00" }, saturday: { open: "08:00", close: "17:00", closed: true },
      sunday: { open: "08:00", close: "17:00", closed: true },
    },
    service_area_zips: ["78704", "78745"],
    transfer_number: "+15125550100",
  },
};

describe("assistant config", () => {
  const OPEN = new Date("2026-11-04T18:00:00Z"); // Wed 12:00 CST
  const CLOSED = new Date("2026-11-04T03:00:00Z"); // Tue 21:00 CST

  it("discloses recording in the greeting by default", () => {
    expect(buildGreeting(biz)).toMatch(/may be recorded/i);
  });

  it("knows open vs closed in the business timezone", () => {
    expect(isOpenNow(biz.settings, biz.timezone, OPEN)).toBe(true);
    expect(isOpenNow(biz.settings, biz.timezone, CLOSED)).toBe(false);
    expect(isOpenNow(biz.settings, biz.timezone, new Date("2026-11-07T18:00:00Z"))).toBe(false); // Saturday closed
  });

  it("prompt is trade-specific, US, and has no dental/India leftovers", () => {
    const p = buildSystemPrompt(biz, CLOSED);
    expect(p).toContain("CLOSED (after hours)");
    expect(p).toMatch(/burst or leaking pipe/);
    expect(p).toContain("78704");
    expect(p).not.toMatch(/dental|patient|clinic|India|₹|Hindi/i);
  });

  it("wires secrets and emergency transfer with a fallback", () => {
    const c = buildAssistantConfig(biz, { supabaseUrl: "https://x.supabase.co", webhookSecret: "s3cret", now: OPEN });
    const tools = c.model.tools as any[];
    const fn = tools.filter((t) => t.type === "function");
    expect(fn.map((t) => t.function.name).sort()).toEqual(["book_appointment", "capture_lead", "check_availability"]);
    for (const t of fn) expect(t.server.secret).toBe("s3cret");
    expect(c.server.secret).toBe("s3cret");
    const tr = tools.find((t) => t.type === "transferCall");
    expect(tr.destinations[0].number).toBe("+15125550100");
    expect(tr.destinations[0].transferPlan.fallbackPlan.message).toBeTruthy();
    const book = fn.find((t) => t.function.name === "book_appointment");
    expect(book.function.parameters.required).toContain("address");
  });

  it("omits transfer tool when no number configured", () => {
    const b = { ...biz, settings: { ...biz.settings, transfer_number: undefined } };
    const c = buildAssistantConfig(b, { supabaseUrl: "https://x.supabase.co" });
    expect((c.model.tools as any[]).some((t) => t.type === "transferCall")).toBe(false);
  });
});

describe("quota", () => {
  const base = { plan: "solo" as const, calls_included: 100, overage_cap_calls: 20, allow_overage: false, seconds_remaining: 0 };
  it("blocks at the included limit when overage is off", () => {
    expect(checkQuota(base, 99).allowed).toBe(true);
    expect(checkQuota(base, 100)).toMatchObject({ allowed: false, reason: "calls_exhausted" });
  });
  it("allows capped overage when enabled", () => {
    const b = { ...base, allow_overage: true };
    expect(checkQuota(b, 100)).toMatchObject({ allowed: true, inOverage: true });
    expect(checkQuota(b, 120).allowed).toBe(false);
  });
  it("blocks canceled subscriptions; legacy minutes plan still works", () => {
    expect(checkQuota({ ...base, billing_status: "canceled" }, 0).allowed).toBe(false);
    expect(checkQuota({ ...base, plan: null, seconds_remaining: 60 }, 5).allowed).toBe(true);
    expect(checkQuota({ ...base, plan: null, seconds_remaining: 0 }, 5).allowed).toBe(false);
  });
  it("threshold alerts fire once", () => {
    expect(crossedThreshold(100, 79, 80)).toBe(0.8);
    expect(crossedThreshold(100, 80, 81)).toBeNull();
    expect(crossedThreshold(100, 99, 100)).toBe(1);
  });
});

describe("slots", () => {
  it("converts local wall time to UTC across DST", () => {
    expect(zonedDateTimeToUtc("2026-07-01", 9, 0, "America/Chicago").toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-12-01", 9, 0, "America/Chicago").toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });
  it("skips busy ranges, lunch, and past/too-soon times", () => {
    const open = zonedDateTimeToUtc("2026-12-01", 8, 0, "America/Chicago");
    const close = zonedDateTimeToUtc("2026-12-01", 17, 0, "America/Chicago");
    const busy = [{ start: zonedDateTimeToUtc("2026-12-01", 9, 0, "America/Chicago"), end: zonedDateTimeToUtc("2026-12-01", 11, 0, "America/Chicago") }];
    const lunch = lunchRange("2026-12-01", "12:00-13:00", "America/Chicago")!;
    const now = new Date("2026-11-30T12:00:00Z");
    const slots = generateSlots(open, close, 60, 0, [...busy, lunch], now);
    const hours = slots.map((s) => +new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(s));
    expect(hours).toEqual([8, 11, 13, 14, 15, 16]);
    expect(generateSlots(open, close, 60, 0, [], new Date(open.getTime() - 30 * 60000), 60)[0].getTime()).toBeGreaterThanOrEqual(open.getTime() + 30 * 60000);
  });
  it("uses per-service duration", () => {
    expect(slotMinutesFor({ service_details: [{ name: "Drain cleaning", duration_minutes: 45 }], slot_duration_default: 90 }, "drain cleaning")).toBe(45);
    expect(slotMinutesFor({ slot_duration_default: 90 }, "x")).toBe(90);
  });
});

describe("forwarding + owner SMS", () => {
  it("builds carrier codes with a normalized number", () => {
    expect(digits("+1 (512) 555-0100")).toBe("5125550100");
    const att = forwardingInstructions("+15125550100", 20)[0];
    expect(att.steps[0]).toBe("No answer: dial **61*15125550100**20# then press Call");
  });
  it("owner SMS carries name, address, issue, urgency and link", () => {
    const t = formatJobSms({ tag: "EMERGENCY", businessName: "Swift", name: "Ann", phone: "+1512", address: "1 Main St 78704", issue: "burst pipe", urgency: "emergency", link: "https://app/calls/1" });
    for (const s of ["Ann", "1 Main St 78704", "burst pipe", "EMERGENCY", "https://app/calls/1"]) expect(t).toContain(s);
  });
});
