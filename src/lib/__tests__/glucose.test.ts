import { expect, test } from "vitest";
import { glucoseStats } from "../glucose";

test("rango objetivo 70–180 mg/dL", () => {
  expect(glucoseStats([60, 70, 180, 200])).toEqual({ avg: 128, inRange: 50, low: 25, high: 25 });
});
