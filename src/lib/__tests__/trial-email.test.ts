import { describe, expect, it } from "vitest";
import { trialEmailDue } from "../trial-email";

const profile = { trial_ends_at: "2026-11-02T06:20:00Z", subscription_status: "inactive", admin_grant_active: false, deactivated_at: null };
describe("trial account email eligibility", () => {
  it("sends the reminder on day 25, not before", () => {
    expect(trialEmailDue(profile, Date.parse("2026-10-28T06:19:59Z"))).toBeNull();
    expect(trialEmailDue(profile, Date.parse("2026-10-28T06:20:00Z"))).toBe("trial-day-25");
    expect(trialEmailDue(profile, Date.parse("2026-10-29T06:20:00Z"))).toBeNull();
  });
  it("sends the expiry notice after 30 days, not before or on later days", () => {
    expect(trialEmailDue(profile, Date.parse("2026-11-02T06:19:59Z"))).toBeNull();
    expect(trialEmailDue(profile, Date.parse("2026-11-02T06:20:00Z"))).toBe("trial-expired");
    expect(trialEmailDue(profile, Date.parse("2026-11-03T06:20:00Z"))).toBeNull();
  });
  it("excludes subscribed, free-granted and deactivated accounts", () => {
    const now = Date.parse("2026-10-28T06:20:00Z");
    expect(trialEmailDue({ ...profile, subscription_status: "active" }, now)).toBeNull();
    expect(trialEmailDue({ ...profile, admin_grant_active: true }, now)).toBeNull();
    expect(trialEmailDue({ ...profile, deactivated_at: "2026-10-27T00:00:00Z" }, now)).toBeNull();
  });
});