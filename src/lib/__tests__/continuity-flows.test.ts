import { expect, it, vi } from "vitest";
import { pickTodayWorkout } from "../readiness.server";
import { loadWorkoutContinuity } from "../workout-continuity.server";

it("Readiness and Telegram never turn Sunday's missed ride into Monday's workout", () => {
  expect(pickTodayWorkout([{ status: "pending", plan: { scheduled_date: "2026-11-15" } }], "2026-11-16")).toBeNull();
  expect(pickTodayWorkout([{ status: "skipped", plan: { scheduled_date: "2026-11-16" } }], "2026-11-16")).toBeNull();
  expect(pickTodayWorkout([{ id: "monday", status: "pending", plan: { scheduled_date: "2026-11-16" } }], "2026-11-16")?.id).toBe("monday");
});

it("shared history reads the whole prior week with owner scope and includes unlinked real rides", async () => {
  const owners: string[] = [];
  const db = { from: (table: string) => {
    const q: any = { select: () => q, gte: () => q, lte: () => q, order: () => q,
      eq: (column: string, value: string) => { if (column === "user_id") owners.push(value); return q; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "workouts"
        ? [{ status: "skipped", plan: { scheduled_date: "2026-11-15", long_ride: true } }]
        : [{ name: "Salida libre", start_date: "2026-11-15T10:00:00", moving_time: 10800, icu_training_load: 150 }] }).then(resolve) };
    return q;
  } };
  const history = await loadWorkoutContinuity(db, "owner", "2026-11-16", "2026-11-16");
  expect(owners).toEqual(["owner", "owner"]);
  expect(history.sesiones[0]).toMatchObject({ estado: "omitido", tss_real: 0 });
  expect(history.actividades_realizadas[0].icu_training_load).toBe(150);
});

vi.mock("../intervals.server", () => ({ syncWorkoutEvent: vi.fn() }));
it("rebalancing does not add a missed Sunday ride to Monday's remaining sessions", async () => {
  const { rebalanceWeekCore } = await import("../week-rebalance.server");
  const writes = vi.fn();
  const db = { from: (table: string) => {
    let status = "";
    const q: any = { select: () => q, update: writes, eq: (column: string, value: string) => { if (column === "status") status = value; return q; },
      maybeSingle: async () => ({ data: table === "profiles" ? { ftp: 250 } : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: status === "pending" ? [{ id: "remaining", status, duration_minutes: 60,
        planned_tss: 50, plan: { scheduled_date: "2099-11-16", week_target_tss: 200 } }] : [] }).then(resolve) };
    return q;
  } };
  const result = await rebalanceWeekCore(db, "owner", "2099-11-16");
  expect(result.changed).toBe(false);
  expect(writes).not.toHaveBeenCalled();
});