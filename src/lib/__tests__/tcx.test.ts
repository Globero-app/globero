import { describe, expect, it } from "vitest";
import { buildTcxWithCoursePoints } from "../tcx";

const originalGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx><trk><trkseg>
<trkpt lat="40.000001" lon="-3.000001"><ele>600</ele><time>2026-11-06T08:00:00Z</time></trkpt>
<trkpt lat="40.010002" lon="-3.010002"><ele>610</ele></trkpt>
<trkpt lat="40.020003" lon="-3.020003"><ele>620</ele></trkpt>
<trkpt lat="40.030004" lon="-3.030004"><ele>630</ele></trkpt>
</trkseg></trk></gpx>`;

describe("buildTcxWithCoursePoints", () => {
  it("conserva todos los puntos del GPX original y exporta cada toma como Food", () => {
    const tcx = buildTcxWithCoursePoints(originalGpx, [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], [
      { km: 1, label: "CHO 30g · tramo llano", carbs_g: 30 },
      { km: 2, label: "CHO 40g · antes de subida", carbs_g: 40 },
    ], "Ruta & prueba");

    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(4);
    expect(tcx).toContain("<LatitudeDegrees>40.010002</LatitudeDegrees>");
    expect(tcx).toContain("<LatitudeDegrees>40.030004</LatitudeDegrees>");
    expect(tcx.match(/<CoursePoint>/g)).toHaveLength(2);
    expect(tcx.match(/<PointType>Food<\/PointType>/g)).toHaveLength(2);
    expect(tcx).toContain("<Name>CHO 30g</Name>");
    expect(tcx).toContain("<Name>CHO 40g</Name>");
    expect(tcx).toContain("<Name>Ruta &amp; prueba</Name>");
    expect(tcx).not.toContain("<wpt");
  });

  it("usa los puntos guardados si no hay GPX original válido", () => {
    const tcx = buildTcxWithCoursePoints("", [
      { lat: 40, lon: -3, ele: 500 },
      { lat: 40.01, lon: -3.01, ele: 510 },
    ], [{ km: 0.5, note: "Toma 25g" }]);

    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(2);
    expect(tcx.match(/<CoursePoint>/g)).toHaveLength(1);
    expect(tcx).toContain("<PointType>Food</PointType>");
  });
});
