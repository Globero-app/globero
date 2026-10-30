import { describe, expect, it } from "vitest";
import { canActOnWorkout } from "../workout-status";

describe("individual workout actions", () => {
  it("disallows quick actions and completion for skipped workouts", () => {
    expect(canActOnWorkout("skipped")).toBe(false);
  });
  it("keeps completed workouts read-only", () => {
    expect(canActOnWorkout("completed")).toBe(false);
  });
  it("preserves actions for pending workouts", () => {
    expect(canActOnWorkout("pending")).toBe(true);
  });
});