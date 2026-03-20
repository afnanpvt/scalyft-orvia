import { describe, it, expect } from "vitest";

describe("queries module", () => {
  it("should export query functions", async () => {
    const mod = await import("../queries");
    expect(mod.getOverviewStats).toBeDefined();
    expect(mod.getRecentCalls).toBeDefined();
    expect(mod.getCallById).toBeDefined();
    expect(mod.getClinicSettings).toBeDefined();
  });
});
