/** Register new integrations here; the admin query and user cards follow automatically. */
const CONNECTIONS = [
  { id: "telegram", label: "Telegram", fields: ["telegram_chat_id"] },
  { id: "intervals", label: "Intervals.icu", fields: ["intervals_api_key"] },
  { id: "garmin", label: "Garmin", fields: ["garmin_access_token"] },
  { id: "hammerhead", label: "Hammerhead", fields: ["hammerhead_access_token"] },
  { id: "wahoo", label: "Wahoo", fields: ["wahoo_access_token"] },
  { id: "strava", label: "Strava", fields: ["strava_access_token"] },
] as const;

export const CONNECTION_PROFILE_FIELDS = CONNECTIONS.flatMap((connection) => connection.fields).join(",");

export function userConnections(profile: Record<string, unknown> | null, garminPaired = false) {
  return CONNECTIONS.map(({ id, label, fields }) => ({
    id,
    label,
    connected: fields.some((field) => Boolean(profile?.[field])) || (id === "garmin" && garminPaired),
  }));
}