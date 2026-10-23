import { expect, it } from "vitest";
import { hammerheadTiming } from "../hammerhead-activity";
it("uses riding start and converts the October 22 duration to seconds", () => {
  expect(hammerheadTiming({ duration: 4462000, startedAt: "2026-10-22T15:53:34.080Z", createdAt: "2026-10-22T17:07:39.129Z" })).toEqual({ duration: 4462, start: "2026-10-22T15:53:34.080Z" });
});
it("preserves explicit moving time in seconds", () => {
  expect(hammerheadTiming({ movingTime: 4460, duration: 4462000, startTime: "2026-10-22T15:53:34Z" }).duration).toBe(4460);
});