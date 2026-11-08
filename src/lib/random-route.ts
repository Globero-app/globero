import { simplifyTrack } from "./gpx";

export const RANDOM_ROUTE_POINTS = [3, 4, 5, 6] as const;

/** Limita el GPX persistido sin perder el punto final del recorrido circular. */
export function simplifyRandomRouteCoordinates(coordinates: number[][], maxPoints = 800): number[][] {
  const points = coordinates.map(([lon, lat, ele]) => ({ lat, lon, ...(ele == null ? {} : { ele }) }));
  const simplified = simplifyTrack(points, maxPoints);
  const last = points.at(-1);
  if (last && simplified.at(-1) !== last) simplified[simplified.length - 1] = last;
  return simplified.map(({ lon, lat, ele }) => ele == null ? [lon, lat] : [lon, lat, ele]);
}
