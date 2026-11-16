import { describe, expect, it } from "vitest";
import { missingWeeklyDates } from "../weekly-workout-window";
import { buildSchedule } from "../workouts-gen.server";

describe("weekly calendar coverage", () => {
  it("a carried-over Monday leaves three training dates uncovered", () => {
    expect(missingWeeklyDates([5, 0, 3, 1], "2026-11-16", "2026-11-22", ["2026-11-16"]))
      .toEqual(["2026-11-18", "2026-11-20", "2026-11-22"]);
  });
  it("generation excludes existing dates without spilling beyond Sunday", () => {
    expect(buildSchedule([5, 0, 3, 1], 3, "2026-11-22", new Date("2026-11-15T12:00:00Z"), ["2026-11-16"]).map((s) => s.date))
      .toEqual(["2026-11-18", "2026-11-20", "2026-11-22"]);
  });
  it("a full week requires no generation", () => {
    expect(missingWeeklyDates([1, 3], "2026-11-16", "2026-11-22", ["2026-11-16", "2026-11-18"]))
      .toEqual([]);
  });
  it("a future competition limits the dates but a session does not", () => {
    expect(missingWeeklyDates([1, 3, 5, 0], "2026-11-16", "2026-11-22", ["2026-11-16"], "2026-11-20"))
      .toEqual(["2026-11-18", "2026-11-20"]);
  });
});