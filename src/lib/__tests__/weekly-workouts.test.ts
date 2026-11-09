import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyWorkoutParams, weeklyWorkoutWindow } from "../weekly-workout-window";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), generate: vi.fn(), nutrition: vi.fn(), sync: vi.fn(), summary: vi.fn(),
  profiles: [] as any[], existing: new Set<string>(), queries: [] as any[],
}));
vi.mock("@/lib/cron-auth.server", () => ({ verifyCronRequest: mocks.auth }));
vi.mock("@/lib/workouts-gen.server", () => ({ generateWorkoutsCore: mocks.generate }));
vi.mock("@/lib/nutrition-gen.server", () => ({ generateWeeklyNutritionCore: mocks.nutrition }));
vi.mock("@/lib/intervals.server", () => ({ syncWorkoutEvent: mocks.sync }));
vi.mock("@/lib/weekly-summary.server", () => ({ sendWeeklySummary: mocks.summary }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let cap = Infinity;
      let update = false;
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        is: () => query,
        order: () => query,
        gte: (key: string, value: string) => { filters.push([key, value]); return query; },
        lte: (key: string, value: string) => { filters.push([key, value]); return query; },
        limit: (n: number) => { cap = n; return query; },
        update: () => { update = true; return query; },
        then(resolve: (value: unknown) => unknown) {
          mocks.queries.push({ table, filters, update });
          const rows = table === "profiles"
            ? mocks.profiles.filter((p) => filters.every(([k, v]) => p[k] === v))
            : mocks.existing.has(String(filters.find(([k]) => k === "user_id")?.[1])) ? [{ id: "existing" }] : [];
          return Promise.resolve({ data: rows.slice(0, cap), error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));
import { Route } from "../../routes/api/public/hooks/weekly-workouts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = (query = "") => {
  const handlers = Route.options.server?.handlers;
  const handler = typeof handlers === "function" ? undefined : handlers?.POST;
  if (typeof handler !== "function") throw new Error("POST handler missing");
  return handler({ request: new Request(`http://localhost/api/public/hooks/weekly-workouts${query}`, { method: "POST" }) } as Parameters<typeof handler>[0]) as Promise<Response>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
  mocks.auth.mockResolvedValue(true);
  mocks.generate.mockResolvedValue([{ id: "generated" }]);
  mocks.summary.mockResolvedValue(true);
  mocks.sync.mockResolvedValue(true);
  mocks.profiles = [1, 2, 3, 4].map((n) => ({
    id: id(n), weekly_auto_enabled: true, weekly_training_days: [1, 3, 5],
    nutrition_plan_enabled: true, weekly_last_generated_at: "2026-11-09T07:00:00Z",
  }));
  mocks.existing.clear();
  mocks.queries = [];
});

describe("Madrid weekly window", () => {
  it.each([
    ["2026-11-08T19:59:00Z", false], ["2026-11-08T20:00:00Z", true],
    ["2026-11-08T22:30:00Z", true], ["2026-11-08T23:00:00Z", true],
    ["2026-11-09T13:00:00Z", true], ["2026-11-09T13:01:00Z", false],
    ["2026-11-10T20:00:00Z", false],
    ["2026-07-12T19:00:00Z", true], ["2026-07-13T12:01:00Z", false],
  ])("checks Sunday 21:00 to Monday 14:00 for %s", (date, allowed) => {
    expect(weeklyWorkoutWindow(new Date(date)).allowed).toBe(allowed);
  });
  it.each(["2026-11-08T20:00:00Z", "2026-11-09T08:00:00Z"])("plans the same week from Sunday/Monday %s", (date) => {
    const window = weeklyWorkoutWindow(new Date(date));
    expect(window.mondayISO).toBe("2026-11-09");
    expect(window.untilSunday).toBe("2026-11-15");
    expect(window.from.toISOString()).toBe("2026-11-08T12:00:00.000Z");
  });
  it("defaults to three and validates query parameters", () => {
    expect(weeklyWorkoutParams.parse({}).limit).toBe(3);
    expect(weeklyWorkoutParams.parse({ limit: "2", userId: id(1) }).limit).toBe(2);
    expect(weeklyWorkoutParams.safeParse({ limit: "0" }).success).toBe(false);
    expect(weeklyWorkoutParams.safeParse({ userId: "invalid" }).success).toBe(false);
  });
});

describe("weekly cron", () => {
  it("rejects unauthenticated forced requests", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await run("?force=1")).status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("limits generation to three, ignores stale last-generated timestamps and aligns nutrition", async () => {
    const response = await (await run()).json();
    expect(response.processed).toBe(3);
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(response.window).toEqual({ mondayISO: "2026-11-09", untilSunday: "2026-11-15" });
    expect(mocks.generate.mock.calls[0]?.[2]).toMatchObject({ until: "2026-11-15", from: new Date("2026-11-08T12:00:00Z") });
    expect(mocks.nutrition.mock.calls[0]?.[2].week_start).toBe("2026-11-09");
    expect(mocks.summary).toHaveBeenCalledTimes(3);
    expect(mocks.queries.filter((q) => q.update)).toHaveLength(3);
  });
  it("skips existing scheduled workouts without consuming a generation slot", async () => {
    mocks.existing.add(id(1));
    const response = await (await run("?limit=2")).json();
    expect(response.processed).toBe(2);
    expect(response.results[0]).toMatchObject({ user: id(1), skipped: true });
    expect(mocks.generate.mock.calls.map((c) => c[1])).toEqual([id(2), id(3)]);
    expect(mocks.queries.find((q) => q.table === "workouts").filters).toContainEqual(["plan->>scheduled_date", "2026-11-15"]);
  });
  it("explicit user forces only that account outside the time window, even with existing workouts", async () => {
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    mocks.existing.add(id(2));
    mocks.profiles[1].weekly_auto_enabled = false;
    const response = await (await run(`?userId=${id(2)}`)).json();
    expect(response.processed).toBe(1);
    expect(mocks.generate.mock.calls.map((c) => c[1])).toEqual([id(2)]);
  });
  it("force=1 bypasses the time window and calendar idempotency", async () => {
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    mocks.existing.add(id(1));
    expect((await (await run("?force=1&limit=1")).json()).processed).toBe(1);
    expect(mocks.generate.mock.calls[0]?.[1]).toBe(id(1));
  });
  it("returns window and empty results outside the permitted window", async () => {
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    expect(await (await run()).json()).toMatchObject({ processed: 0, skipped: true, results: [] });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("keeps weekly summaries for non-auto users", async () => {
    mocks.profiles.push({ id: id(5), weekly_auto_enabled: false });
    await run("?limit=1");
    expect(mocks.summary.mock.calls.map((c) => c[1])).toEqual([id(1), id(5)]);
  });
  it("continues after a failed attempt without marking it generated", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("failed"));
    const response = await (await run("?limit=2")).json();
    expect(response.processed).toBe(2);
    expect(response.results[0].error).toBe("failed");
    expect(mocks.queries.filter((q) => q.update)).toHaveLength(1);
  });
});