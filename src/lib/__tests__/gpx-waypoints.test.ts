import { describe, expect, it } from "vitest";
import { buildGpxWithWaypoints } from "../gpx";

const pts = [{ lat: 0, lon: 0, ele: 100 }, { lat: 0, lon: 0.01, ele: 110 }, { lat: 0, lon: 0.02, ele: 120 }];

describe("buildGpxWithWaypoints", () => {
  it("does not crash when a waypoint label is missing", () => {
    const xml = buildGpxWithWaypoints("", pts, [{ km: 1, label: undefined as any }]);
    expect(xml).toContain("<name>Avituallamiento</name>");
  });
  it("builds a GPX from points when there is no original XML", () => {
    const xml = buildGpxWithWaypoints("", pts, [{ km: 1, label: "CHO 40g" }]);
    expect(xml).toContain("<trkpt");
    expect(xml).toContain("<name>CHO 40g</name>");
  });
});
