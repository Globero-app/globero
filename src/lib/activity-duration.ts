/** Legacy activity durations above one day are milliseconds, not seconds. */
export function activityDurationSeconds(value: unknown): number {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration > 86400 ? duration / 1000 : duration;
}