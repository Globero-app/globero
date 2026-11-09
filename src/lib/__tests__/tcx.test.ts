import { describe, expect, it } from "vitest";
import { buildTcxWithCoursePoints, formatRideClock } from "../tcx";

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
      { km: 1, minute: 45, label: "CHO 30g · tramo llano", carbs_g: 30 },
      { km: 2, minute: 90, label: "CHO 40g · antes de subida", carbs_g: 40 },
    ], "Ruta & prueba");

    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(4);
    expect(tcx).toContain("<LatitudeDegrees>40.010002</LatitudeDegrees>");
    expect(tcx).toContain("<LatitudeDegrees>40.030004</LatitudeDegrees>");
    expect(tcx.match(/<CoursePoint>/g)).toHaveLength(2);
    expect(tcx.match(/<PointType>Food<\/PointType>/g)).toHaveLength(2);
    expect(tcx).toContain("<Name>30g 0:45</Name>");
    expect(tcx).toContain("<Name>40g 1:30</Name>");
    expect(tcx).toContain("<Name>Ruta &amp; prueba</Name>");
    expect(tcx).not.toContain("<wpt");
  });

  it("anota gramos de CHO y hora de toma en el nombre y las notas", () => {
    const tcx = buildTcxWithCoursePoints(originalGpx, [], [
      { km: 15, minute: 45, label: "tramo llano", carbs_g: 30 },
    ]);

    expect(tcx).toContain("<Name>30g 0:45</Name>");
    expect(tcx).toContain("<Notes>KM 15 - t+0:45 - 30 g CHO - tramo llano</Notes>");
  });

  it("omite la hora de toma cuando no se conoce el minuto", () => {
    const tcx = buildTcxWithCoursePoints(originalGpx, [], [
      { km: 1, minute: null, note: "Toma 25g" },
    ]);

    expect(tcx).toContain("<Name>CHO 25g</Name>");
    expect(tcx).toContain("<Notes>KM 1 - 25 g CHO - Toma 25g</Notes>");
  });

  it("usa los puntos guardados si no hay GPX original válido", () => {
    const tcx = buildTcxWithCoursePoints("", [
      { lat: 40, lon: -3, ele: 500 },
      { lat: 40.01, lon: -3.01, ele: 510 },
    ], [{ km: 0.5, minute: 12, note: "Toma 25g" }]);

    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(2);
    expect(tcx.match(/<CoursePoint>/g)).toHaveLength(1);
    expect(tcx).toContain("<PointType>Food</PointType>");
    expect(tcx).toContain("<Name>25g 0:12</Name>");
  });

  it("incluye tiempo obligatorio y distancia acumulada en cada punto aunque el GPX no tenga tiempos", () => {
    const tcx = buildTcxWithCoursePoints("", [
      { lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0, lon: 0.02 },
    ], []);
    const trackpoints = [...tcx.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)].map((m) => m[1]);
    const times = trackpoints.map((p) => Date.parse(p.match(/<Time>(.*?)<\/Time>/)?.[1] || ""));
    const distances = trackpoints.map((p) => Number(p.match(/<DistanceMeters>(.*?)<\/DistanceMeters>/)?.[1]));
    expect(times.every(Number.isFinite)).toBe(true);
    expect(times[1]).toBeGreaterThan(times[0]);
    expect(times[2]).toBeGreaterThan(times[1]);
    expect(distances[0]).toBe(0);
    expect(distances[1]).toBeCloseTo(1111.949, 2);
    expect(distances[2]).toBeCloseTo(2223.899, 2);
    const lap = tcx.match(/<Lap>([\s\S]*?)<\/Lap>/)?.[1] || "";
    expect(Number(lap.match(/<DistanceMeters>(.*?)<\/DistanceMeters>/)?.[1])).toBe(distances[2]);
    expect(Number(lap.match(/<TotalTimeSeconds>(.*?)<\/TotalTimeSeconds>/)?.[1])).toBeGreaterThan(0);
  });

  it("conserva el track con namespace GPX y limita los nombres según el esquema Garmin", () => {
    const tcx = buildTcxWithCoursePoints(originalGpx.replace(/(<\/?)(trkpt|ele|time)\b/g, "$1gpx:$2"), [], [
      { km: 1, minute: 90, carbs_g: 30 },
    ], "Ruta con un nombre muy largo");
    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(4);
    expect(tcx).toContain("<AltitudeMeters>610</AltitudeMeters>");
    const courseName = tcx.match(/<Course>\s*<Name>(.*?)<\/Name>/)?.[1] || "";
    const foodName = tcx.match(/<CoursePoint>\s*<Name>(.*?)<\/Name>/)?.[1] || "";
    expect(courseName.length).toBe(15);
    expect(foodName).toBe("30g 1:30");
    expect(tcx).toContain("<Notes>KM 1 - t+1:30 - 30 g CHO - CHO 30g</Notes>");
  });

  it("sincroniza y ordena los CoursePoints con sus Trackpoints aunque lleguen desordenados", () => {
    const tcx = buildTcxWithCoursePoints(originalGpx, [], [
      { km: 3, minute: 5, label: "Final", carbs_g: 40 },
      { km: 1, minute: 90, label: "Inicio", carbs_g: 30 },
    ]);
    const trackTimes = new Map([...tcx.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)].map((match) => [
      match[1].match(/<LatitudeDegrees>(.*?)<\/LatitudeDegrees>/)?.[1],
      match[1].match(/<Time>(.*?)<\/Time>/)?.[1],
    ]));
    const coursePoints = [...tcx.matchAll(/<CoursePoint>([\s\S]*?)<\/CoursePoint>/g)].map((match) => ({
      latitude: match[1].match(/<LatitudeDegrees>(.*?)<\/LatitudeDegrees>/)?.[1],
      time: match[1].match(/<Time>(.*?)<\/Time>/)?.[1],
    }));

    expect(coursePoints.map((point) => point.time)).toEqual(coursePoints.map((point) => trackTimes.get(point.latitude)));
    expect(coursePoints.map((point) => Date.parse(point.time || ""))).toEqual(
      [...coursePoints.map((point) => Date.parse(point.time || ""))].sort((a, b) => a - b),
    );
  });

  it("rechaza coordenadas inválidas en lugar de descargar una ruta vacía", () => {
    expect(() => buildTcxWithCoursePoints("", [{ lat: NaN, lon: 0 }, { lat: 0, lon: 1 }], [])).toThrow("coordenadas");
  });
});

describe("formatRideClock", () => {
  it("convierte minutos desde la salida en H:MM", () => {
    expect(formatRideClock(0)).toBe("0:00");
    expect(formatRideClock(9)).toBe("0:09");
    expect(formatRideClock(45.4)).toBe("0:45");
    expect(formatRideClock(90)).toBe("1:30");
    expect(formatRideClock(600)).toBe("10:00");
    expect(formatRideClock(-5)).toBe("0:00");
  });
});
