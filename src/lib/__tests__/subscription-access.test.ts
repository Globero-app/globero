import { describe, expect, it } from "vitest";
import { canGenerate } from "../subscription-access";
import { requireGenerationAccess } from "../subscription-access.server";
const signup = new Date("2026-10-22T12:00:00Z");
const trial = { trial_ends_at: new Date(signup.getTime() + 30 * 86400000).toISOString() };
describe("subscription generation permissions", () => {
  it("allows 30 days without payment details", () => {
    expect(canGenerate(trial, new Date(signup.getTime() + 30 * 86400000 - 1))).toBe(true);
    expect(canGenerate(trial, new Date(signup.getTime() + 30 * 86400000))).toBe(false);
  });
  it("reactivates generation with an active subscription", () => {
    expect(canGenerate({ subscription_status: "active" })).toBe(true);
    expect(canGenerate({ subscription_status: "canceled" })).toBe(false);
    expect(canGenerate({ subscription_status: "past_due" })).toBe(false);
  });
  it("allows a reversible free admin grant", () => {
    expect(canGenerate({ admin_grant_active: true })).toBe(true);
    expect(canGenerate({ admin_grant_active: false })).toBe(false);
  });
  it("fails closed for missing and deactivated accounts", () => {
    expect(canGenerate(null)).toBe(false);
    expect(canGenerate({ admin_grant_active: true, deactivated_at: "2026-10-22" })).toBe(false);
  });
  it("rejects an expired account at the shared server guard", async () => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { trial_ends_at: "2020-01-01" } }) };
    await expect(requireGenerationAccess({ from: () => q }, "user")).rejects.toThrow("Activa una suscripción");
  });
});