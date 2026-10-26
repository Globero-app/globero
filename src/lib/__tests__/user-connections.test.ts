import { expect, it } from "vitest";
import { userConnections, CONNECTION_PROFILE_FIELDS } from "../user-connections";

it.each([
  ["telegram", "telegram_chat_id"], ["intervals", "intervals_api_key"],
  ["garmin", "garmin_access_token"], ["hammerhead", "hammerhead_access_token"],
  ["wahoo", "wahoo_access_token"], ["strava", "strava_access_token"],
])("detects %s without returning credentials", (id, field) => {
  const statuses = userConnections({ [field]: "private-fixture" });
  expect(statuses.find((status) => status.id === id)?.connected).toBe(true);
  expect(statuses.filter((status) => status.connected)).toHaveLength(1);
  expect(JSON.stringify(statuses)).not.toContain("private-fixture");
  expect(CONNECTION_PROFILE_FIELDS.split(",")).toContain(field);
});

it("counts an active Garmin pairing without OAuth", () => {
  expect(userConnections(null, true).find((status) => status.id === "garmin")?.connected).toBe(true);
  expect(userConnections(null, false).find((status) => status.id === "garmin")?.connected).toBe(false);
});

it("shows every integration disconnected for a missing profile", () => {
  expect(userConnections(null)).toHaveLength(6);
  expect(userConnections(null).every((status) => !status.connected)).toBe(true);
});