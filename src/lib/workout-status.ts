/** Shared UI eligibility for individual session actions. */
export function canActOnWorkout(status: string | null | undefined): boolean {
  return status !== "skipped" && status !== "completed";
}