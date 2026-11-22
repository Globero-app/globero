/** Keep outdoor ranges intact; indoor power steps use one absolute-watt setpoint. */
export function workoutPowerSteps<T extends { target?: string; target_low?: number; target_high?: number }>(
  steps: T[], indoor: boolean,
): T[] {
  return steps.map((step) => {
    if (!indoor || step.target !== "power") return { ...step };
    const low = step.target_low ?? step.target_high;
    const high = step.target_high ?? step.target_low;
    if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < 0) return { ...step };
    const watts = Math.round((low + high) / 2);
    return { ...step, target_low: watts, target_high: watts };
  });
}