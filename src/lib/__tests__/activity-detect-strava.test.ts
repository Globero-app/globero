import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ strava: vi.fn(), devices: vi.fn(), hammerhead: vi.fn() }));
vi.mock("../intervals-activities.server", () => ({ syncIntervalsActivities: vi.fn().mockResolvedValue(0) }));
vi.mock("../devices.server", () => ({ pullDeviceActivities: mocks.devices, pullHammerheadActivities: mocks.hammerhead }));
vi.mock("../strava.server", () => ({ pullStravaActivities: mocks.strava }));
vi.mock("../activity-dedupe.server", () => ({ isSameActivity: vi.fn() }));
import { detectAndAssign } from "../activity-detect.server";

const admin = {
  from: () => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      limit: () => query, gte: () => query,
      maybeSingle: () => Promise.resolve({ data: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [] }).then(resolve),
    };
    return query;
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.strava.mockResolvedValue(0);
});
it("pulls Strava before matching activities", async () => {
  await detectAndAssign(admin, "strava-user", "2026-11-09");
  expect(mocks.strava).toHaveBeenCalledWith(admin, "strava-user");
});
it("continues detection when Strava sync fails", async () => {
  mocks.strava.mockRejectedValue(new Error("provider unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(detectAndAssign(admin, "strava-user", "2026-11-09")).resolves.toEqual({ auto: 0, asked: 0 });
  } finally { log.mockRestore(); }
});
it("still pulls Strava when another device fails", async () => {
  mocks.devices.mockRejectedValue(new Error("device unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await detectAndAssign(admin, "strava-user", "2026-11-09");
    expect(mocks.strava).toHaveBeenCalledWith(admin, "strava-user");
  } finally { log.mockRestore(); }
});