import { describe, expect, it } from "vitest";
import { activityDate, chooseReportActivity, needsWorkoutReport, workoutReportDate } from "../workout-report.helpers";
import { resolveWorkoutReportActivity } from "../workout-report-link.server";

function database(tables: Record<string, any[]>) {
  return { from(table: string) {
    let rows = tables[table] ?? [];
    let action: "read" | "update" | "upsert" = "read";
    let values: any;
    const query: any = {
      select() { return query; },
      eq(key: string, value: any) { rows = rows.filter(r => r[key] === value); return query; },
      neq(key: string, value: any) { rows = rows.filter(r => r[key] !== value); return query; },
      gte(key: string, value: string) { rows = rows.filter(r => r[key] >= value); return query; },
      lt(key: string, value: string) { rows = rows.filter(r => r[key] < value); return query; },
      update(value: any) { action = "update"; values = value; return query; },
      upsert(value: any) { action = "upsert"; values = value; return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: any) {
        if (action === "update") rows.forEach(r => Object.assign(r, values));
        if (action === "upsert" && !(tables[table] ?? []).some(r => r.user_id === values.user_id && r.activity_id === values.activity_id)) {
          (tables[table] ??= []).push(values);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  } };
}

describe("completed workout reports", () => {
  it("allows both recovery actions without any provider ID", () => {
    expect(needsWorkoutReport("completed", {})).toBe(true);
  });
  it("allows recovery when feedback already exists but report does not", () => {
    expect(needsWorkoutReport("completed", { report: { text: "" } })).toBe(true);
  });
  it("does not expose recovery actions for skipped sessions or existing reports", () => {
    expect(needsWorkoutReport("skipped", {})).toBe(false);
    expect(needsWorkoutReport("completed", { report: { text: "Analysis" } })).toBe(false);
  });
  it("uses the session date rather than the date a historical workout was marked complete", () => {
    expect(workoutReportDate({ plan: { scheduled_date: "2026-11-01" }, completed_at: "2026-11-08T13:00:00Z" })).toBe("2026-11-01");
    expect(activityDate("2026-11-07T23:30:00Z")).toBe("2026-11-08");
  });
  it("excludes other dates and activities already assigned to another workout", () => {
    expect(chooseReportActivity([
      { id: "other-day", start_date: "2026-11-07T08:00:00Z", moving_time: 3600 },
      { id: "assigned", start_date: "2026-11-08T08:00:00Z", moving_time: 3600 },
      { id: "ride", start_date: "2026-11-08T09:00:00Z", moving_time: 3700 },
    ], "2026-11-08", 60, new Set(["assigned"]))?.id).toBe("ride");
  });
  it("links the same-day activity and reuses existing RPE/feel unchanged", async () => {
    const tables = {
      workouts: [{ id: "w", user_id: "u", status: "completed", plan: { scheduled_date: "2026-11-08" }, duration_minutes: 60 }],
      intervals_activities: [{ id: "wahoo_123", user_id: "u", start_date: "2026-11-08T08:00:00Z", moving_time: 3600 }],
      daily_activities: [{ user_id: "u", activity_id: "wahoo_123", date: "2026-11-08", rpe: 8, feel: 4, feedback_completed: true }],
    };
    const result = await resolveWorkoutReportActivity(database(tables), "u", "w");
    expect(result.feedbackId).toBe("wahoo_123");
    expect(tables.workouts[0].plan).toMatchObject({ intervals_activity_id: "wahoo_123" });
    expect(tables.daily_activities[0]).toMatchObject({ rpe: 8, feel: 4, feedback_completed: true });
    expect(tables.daily_activities).toHaveLength(1);
  });
  it("allows feedback for a manually completed session with no recorded activity", async () => {
    const tables: Record<string, any[]> = {
      workouts: [{ id: "w", user_id: "u", status: "completed", plan: { scheduled_date: "2026-11-08" }, duration_minutes: 60 }],
      intervals_activities: [], daily_activities: [],
    };
    const result = await resolveWorkoutReportActivity(database(tables), "u", "w");
    expect(result.feedbackId).toBeNull();
    expect(tables.daily_activities).toHaveLength(0);
    expect(tables.workouts[0].plan.intervals_activity_id).toBeUndefined();
  });
  it("rejects another user's workout", async () => {
    const tables = { workouts: [{ id: "w", user_id: "other", status: "completed" }] };
    await expect(resolveWorkoutReportActivity(database(tables), "u", "w")).rejects.toThrow("Entrenamiento completado no encontrado");
  });
  it("resolves a daily-only activity without requiring a Strava ID", async () => {
    const tables: Record<string, any[]> = {
      workouts: [{ id: "w", user_id: "u", status: "completed", plan: { scheduled_date: "2026-11-08" }, duration_minutes: 60 }],
      intervals_activities: [],
      daily_activities: [{ user_id: "u", activity_id: "hammerhead_1", date: "2026-11-08", rpe: 6, feel: 3, feedback_completed: true }],
    };
    await resolveWorkoutReportActivity(database(tables), "u", "w");
    expect(tables.workouts[0].plan.intervals_activity_id).toBe("hammerhead_1");
  });
});