import { describe, expect, it } from "vitest";
import { continuityWindow, summarizeWorkoutContinuity } from "../workout-continuity";

const sunday = { duration_minutes: 180, actual_tss: 150, rpe: 4,
  plan: { scheduled_date: "2026-11-15", title: "Tirada larga", long_ride: true } };

describe("cross-week actual training context", () => {
  it("includes the previous Sunday when the next plan starts on Monday", () => {
    expect(continuityWindow("2026-11-16")).toEqual({ since: "2026-11-09", until: "2026-11-15" });
  });
  it.each(["pending", "skipped"])("a %s Sunday long ride provides no performed load for Monday", (status) => {
    const context = summarizeWorkoutContinuity([{ ...sunday, status }], "2026-11-16", "2026-11-16");
    expect(context.sesiones[0]).toMatchObject({ fecha: "2026-11-15", tirada_larga: true,
      estado: status === "skipped" ? "omitido" : "no_realizado", tss_real: 0, rpe: null });
    expect(context.ultima_realizada).toBeNull();
  });
  it("keeps the performed Sunday load, RPE and sensations for Monday", () => {
    const context = summarizeWorkoutContinuity([{ ...sunday, status: "completed", feedback_notes: "Piernas cansadas" }], "2026-11-16", "2026-11-16");
    expect(context.ultima_realizada).toMatchObject({ fecha: "2026-11-15", tss_real: 150, rpe: 4, sensaciones: "Piernas cansadas" });
  });
  it("does not assume a pending Sunday was performed when generating on Sunday evening", () => {
    expect(summarizeWorkoutContinuity([{ ...sunday, status: "pending" }], "2026-11-16", "2026-11-15").sesiones[0])
      .toMatchObject({ estado: "sin_confirmar", tss_real: 0 });
  });
  it("includes elapsed current-week days for midweek plans but excludes future and older sessions", () => {
    expect(continuityWindow("2026-11-18")).toEqual({ since: "2026-11-09", until: "2026-11-17" });
    const rows = ["2026-11-08", "2026-11-15", "2026-11-17", "2026-11-18"].map((date) => ({ status: "completed", plan: { scheduled_date: date } }));
    expect(summarizeWorkoutContinuity(rows, "2026-11-18", "2026-11-18").sesiones.map((s) => s.fecha)).toEqual(["2026-11-15", "2026-11-17"]);
  });
  it("uses Madrid date for an unscheduled manual completion at a UTC day boundary", () => {
    expect(summarizeWorkoutContinuity([{ status: "completed", completed_at: "2026-11-14T23:30:00Z" }], "2026-11-16", "2026-11-16").ultima_realizada?.fecha).toBe("2026-11-15");
  });
});