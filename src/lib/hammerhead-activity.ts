/** Hammerhead's duration is milliseconds; movingTime/elapsedTime are seconds. */
export function hammerheadTiming(a: any) {
  const seconds = a.movingTime ?? (a.duration != null ? Number(a.duration) / 1000 : a.elapsedTime ?? 0);
  return {
    duration: Number(seconds),
    start: a.startedAt ?? a.startTime ?? a.createdAt ?? Date.now(),
  };
}