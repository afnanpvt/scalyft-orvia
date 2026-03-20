import { describe, it, expect, vi } from "vitest";

describe("LoginForm", () => {
  it("should export a LoginForm component", async () => {
    const mod = await import("../login-form");
    expect(mod.LoginForm).toBeDefined();
  });
});
