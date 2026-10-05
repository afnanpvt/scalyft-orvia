import { describe, it, expect } from "vitest";
import { parseSlot, zonedDateTimeToUtc } from "../../supabase/functions/_shared/timezone";

const iso = (d: Date) => d.toISOString();

const localTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

describe("parseSlot", () => {
  it("reads an offset-less slot as business-local time (Gemini, 2026-10-04)", () => {
    const d = parseSlot("2026-10-05T10:00:00", "Asia/Kolkata");
    expect(iso(d)).toBe("2026-10-05T04:30:00.000Z");
    expect(localTime(d, "Asia/Kolkata")).toBe("10:00 AM");
  });

  it("accepts the common offset-less variants", () => {
    for (const slot of ["2026-10-05T10:00", "2026-10-05 10:00:00", "2026-10-05T10:00:00.000", " 2026-10-05T10:00:00 "]) {
      expect(iso(parseSlot(slot, "Asia/Kolkata"))).toBe("2026-10-05T04:30:00.000Z");
    }
  });

  it("uses the business timezone, not the runtime's", () => {
    expect(iso(parseSlot("2026-10-05T10:00:00", "America/Chicago"))).toBe("2026-10-05T15:00:00.000Z");
    expect(iso(parseSlot("2026-01-15T10:00:00", "America/Chicago"))).toBe("2026-01-15T16:00:00.000Z");
  });

  it("leaves slots that carry Z or an offset unchanged", () => {
    expect(iso(parseSlot("2026-10-05T04:30:00.000Z", "Asia/Kolkata"))).toBe("2026-10-05T04:30:00.000Z");
    expect(iso(parseSlot("2026-10-05T10:00:00+05:30", "America/Chicago"))).toBe("2026-10-05T04:30:00.000Z");
    expect(iso(parseSlot("2026-10-05T10:00:00-05:00", "Asia/Kolkata"))).toBe("2026-10-05T15:00:00.000Z");
  });

  it("handles early-morning slots on US DST change days", () => {
    // Spring forward (2026-03-08): 7:00 AM is already CDT (UTC-5).
    expect(iso(parseSlot("2026-03-08T07:00:00", "America/Chicago"))).toBe("2026-03-08T12:00:00.000Z");
    // Fall back (2026-11-01): 5:00 AM is already CST (UTC-6).
    expect(iso(parseSlot("2026-11-01T05:00:00", "America/Chicago"))).toBe("2026-11-01T11:00:00.000Z");
  });

  it("returns an Invalid Date for unparseable slots", () => {
    expect(isNaN(parseSlot("not a time", "Asia/Kolkata").getTime())).toBe(true);
    expect(isNaN(parseSlot("", "Asia/Kolkata").getTime())).toBe(true);
  });
});

describe("zonedDateTimeToUtc", () => {
  it("converts wall-clock hours used by check-availability", () => {
    expect(iso(zonedDateTimeToUtc("2026-10-05", 10, 0, "Asia/Kolkata"))).toBe("2026-10-05T04:30:00.000Z");
    expect(iso(zonedDateTimeToUtc("2026-10-05", 19, 0, "America/Chicago"))).toBe("2026-10-06T00:00:00.000Z");
    expect(iso(zonedDateTimeToUtc("2026-10-05", 0, 0, "America/New_York"))).toBe("2026-10-05T04:00:00.000Z");
  });
});
