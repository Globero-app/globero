import { describe, expect, it } from "vitest";
import { COMPETITION_SUMMARY_COLUMNS } from "../competition-summary";

describe("competition list projection", () => {
  it("loads summary fields without GPX, weather or hydration payloads", () => {
    expect(COMPETITION_SUMMARY_COLUMNS).toBe("id,name,date,type,distance_km,elevation_m,intensity,duration_hours,notes");
    expect(COMPETITION_SUMMARY_COLUMNS).not.toMatch(/track_points|gpx_data|weather_forecast|hydration_plan/);
  });
});
