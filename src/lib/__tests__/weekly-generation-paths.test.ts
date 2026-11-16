import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), rows: [] as any[], today: "2026-11-16" }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const fn: any = { middleware: () => fn, inputValidator: () => fn, handler: (handler: any) => handler };
  return fn;
} }));
vi.mock("../workouts-gen.server", async (original) => ({ ...await original<any>(), generateWorkoutsCore: mocks.generate }));
vi.mock("../competition-target", () => ({ getNextActiveCompetition: vi.fn().mockResolvedValue(null) }));
vi.mock("../training-load.server", () => ({
  madridTodayISO: () => mocks.today,
  isoDate: (date: Date) => date.toISOString().slice(0, 10),
  weekStart: () => "2026-11-09",
}));
vi.mock("../intervals.server", () => ({ syncWorkoutEvent: vi.fn() }));
vi.mock("../weekly-summary.server", () => ({ sendWeeklySummary: vi.fn() }));
vi.mock("../web-push.server", () => ({ notifyUser: vi.fn() }));

import { generateWorkouts } from "../workouts-generate.functions";
import { maybeGenerateNextWeekEarly } from "../next-week-gen.server";

const db = { from(table: string) {
  const q: any = {
    select: () => q, eq: () => q, gte: () => q, lte: () => q, update: () => q,
    maybeSingle: async () => ({ data: table === "profiles" ? { weekly_auto_enabled: true, weekly_training_days: [1, 3, 5, 0] } : null }),
    then: (resolve: any) => Promise.resolve({ data: table === "workouts" ? mocks.rows : [], error: null }).then(resolve),
  };
  return q;
} };
beforeEach(() => { vi.clearAllMocks(); mocks.today = "2026-11-16"; mocks.generate.mockResolvedValue([]); });
afterEach(() => vi.useRealTimers());

it("manual generation fills future gaps and preserves a completed Wednesday", async () => {
  mocks.rows = [{ status: "completed", plan: { scheduled_date: "2026-11-18" } }];
  await (generateWorkouts as any)({ context: { supabase: db, userId: "owner" }, data: { training_days: [1, 3, 5, 0], bike_type: "carretera", duration_minutes: 60 } });
  expect(mocks.generate.mock.calls[0]?.[2].excluded_dates).toEqual(["2026-11-18"]);
});
it("a fully covered manual window does not generate duplicates", async () => {
  mocks.rows = ["2026-11-18", "2026-11-20", "2026-11-22"].map((date) => ({ status: "pending", plan: { scheduled_date: date } }));
  expect(await (generateWorkouts as any)({ context: { supabase: db, userId: "owner" }, data: { training_days: [1, 3, 5, 0], bike_type: "carretera", duration_minutes: 60 } })).toEqual([]);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("Sunday early generation fills three gaps despite an existing next Monday", async () => {
  mocks.today = "2026-11-15";
  mocks.rows = [{ status: "completed", plan: { scheduled_date: "2026-11-15" } }, { status: "pending", plan: { scheduled_date: "2026-11-16" } }];
  await maybeGenerateNextWeekEarly(db, "owner");
  expect(mocks.generate.mock.calls[0]?.[2]).toMatchObject({ max_count: 3, excluded_dates: ["2026-11-15", "2026-11-16"] });
});