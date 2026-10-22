import { describe, expect, it } from "vitest";
import { dismissActivity, isActivityDismissed } from "../activity-match.helpers";

describe("activity-scoped dismissal", () => {
  it("only rejects the concrete Wahoo activity, not a future match", () => {
    const plan = dismissActivity({ scheduled_date: "2026-10-21" }, "wahoo_rejected");
    expect(isActivityDismissed(plan, "wahoo_rejected")).toBe(true);
    expect(isActivityDismissed(plan, "wahoo_508494826")).toBe(false);
  });
  it("removes legacy global blocking and keeps distinct discarded IDs", () => {
    const plan = dismissActivity(dismissActivity({ strava_link_dismissed: true }, "a"), "a");
    expect(plan.dismissed_activity_ids).toEqual(["a"]);
    expect(plan.strava_link_dismissed).toBeUndefined();
    expect(isActivityDismissed({ strava_link_dismissed: true }, "b")).toBe(false);
  });
});