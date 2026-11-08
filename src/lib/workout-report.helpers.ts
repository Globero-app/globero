export function needsWorkoutReport(status: string, plan: { report?: { text?: string } } | null): boolean {
  return status === "completed" && !plan?.report?.text;
}

export function workoutReportDate(workout: { plan?: any; completed_at?: string | null }): string | null {
  const scheduled = workout.plan?.scheduled_date;
  if (typeof scheduled === "string" && /^\d{4}-\d{2}-\d{2}/.test(scheduled)) return scheduled.slice(0, 10);
  return activityDate(workout.completed_at);
}

export function activityDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(date);
}

export function chooseReportActivity(activities: any[], day: string, minutes: number, excluded: Set<string>) {
  return activities.filter(a => activityDate(a.start_date) === day && !excluded.has(String(a.id)))
    .sort((a, b) => Math.abs(Number(a.moving_time ?? 0) / 60 - minutes) - Math.abs(Number(b.moving_time ?? 0) / 60 - minutes))[0] ?? null;
}