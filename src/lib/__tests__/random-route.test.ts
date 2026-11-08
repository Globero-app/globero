import { describe, expect, it } from "vitest";
import { RANDOM_ROUTE_POINTS, simplifyRandomRouteCoordinates } from "../random-route";

describe("random route performance", () => {
  it("uses one parallel round of at most four candidates", () => {
    expect(RANDOM_ROUTE_POINTS).toEqual([3, 4, 5, 6]);
    expect(RANDOM_ROUTE_POINTS).toHaveLength(4);
  });

  it("simplifies persisted coordinates to 800 points and preserves both endpoints", () => {
    const coordinates = Array.from({ length: 5000 }, (_, i) => [2 + i / 10000, 41 + i / 10000, 100 + i]);
    const result = simplifyRandomRouteCoordinates(coordinates);
    expect(result.length).toBeLessThanOrEqual(800);
    expect(result[0]).toEqual(coordinates[0]);
    expect(result.at(-1)).toEqual(coordinates.at(-1));
  });
});
