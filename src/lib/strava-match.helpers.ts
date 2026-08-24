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
