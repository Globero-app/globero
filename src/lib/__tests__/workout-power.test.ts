import { describe, expect, it } from "vitest";
import { workoutPowerSteps } from "../workout-power";

describe("workout power prescription", () => {
  const steps = [{ target: "power", target_low: 150, target_high: 180 }];
  it("preserves outdoor ranges without mutating the original", () => {
    expect(workoutPowerSteps(steps, false)).toEqual(steps);
    workoutPowerSteps(steps, true);
    expect(steps[0]).toEqual({ target: "power", target_low: 150, target_high: 180 });
  });
  it("uses the rounded midpoint as a fixed indoor watt setpoint", () => {
    expect(workoutPowerSteps(steps, true)[0]).toEqual({ target: "power", target_low: 165, target_high: 165 });
  });
  it("does not collapse heart rate or cadence ranges", () => {
    const other = [{ target: "hr", target_low: 130, target_high: 150 }, { target: "cadence", target_low: 80, target_high: 90 }];
    expect(workoutPowerSteps(other, true)).toEqual(other);
  });
  it("preserves zero watts and resolves single-bound targets", () => {
    expect(workoutPowerSteps([{ target: "power", target_low: 0, target_high: 0 }, { target: "power", target_high: 220 }], true))
      .toEqual([{ target: "power", target_low: 0, target_high: 0 }, { target: "power", target_low: 220, target_high: 220 }]);
  });
});