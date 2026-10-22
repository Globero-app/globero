export function isActivityDismissed(plan: any, activityId: string): boolean {
  return Array.isArray(plan?.dismissed_activity_ids) && plan.dismissed_activity_ids.includes(String(activityId));
}

export function dismissActivity(plan: any, activityId: string) {
  const next = { ...plan };
  delete next.strava_link_dismissed;
  next.dismissed_activity_ids = [...new Set([
    ...(Array.isArray(plan?.dismissed_activity_ids) ? plan.dismissed_activity_ids : []), String(activityId),
  ])];
  return next;
}

export function actSubtitle(a: any) {
  return [
    a.type,
    a.distance ? `${(Number(a.distance) / 1000).toFixed(1)} km` : null,
    a.moving_time ? `${Math.round(Number(a.moving_time) / 60)} min` : null,
    a.total_elevation_gain ? `${Math.round(Number(a.total_elevation_gain))} m+` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
