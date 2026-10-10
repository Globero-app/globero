import { describe, expect, it } from "vitest";
import { elevationProfile } from "../gpx";

describe("GPX elevation profile", () => {
  it("accumulates track distance in kilometres and preserves elevations", () => {
    const result = elevationProfile([{ lat: 0, lon: 0, ele: 100 }, { lat: 0, lon: 0.01, ele: 200 }, { lat: 0.01, lon: 0.01, ele: 150 }]);
    expect(result[0]).toEqual({ km: 0, lat: 0, lon: 0, elevation: 100 });
    expect(result[1].km).toBeCloseTo(1.11195, 4);
    expect(result[2].km).toBeCloseTo(2.2239, 4);
    expect(result.map((point) => point.elevation)).toEqual([100, 200, 150]);
  });
  it("keeps absent elevations as gaps rather than inventing sea-level values", () => {
    expect(elevationProfile([{ lat: 0, lon: 0 }, { lat: 0, lon: 0, ele: 0 }, { lat: 0, lon: 0, ele: NaN }]).map((point) => point.elevation)).toEqual([null, 0, null]);
  });
  it("supports empty tracks", () => {
    expect(elevationProfile([])).toEqual([]);
  });
});