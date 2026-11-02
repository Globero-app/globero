import { describe, expect, it } from "vitest";
import { estimatedRouteHours, forecastAvailability, routeDeparture, routeSchedule, mapRouteHours, recommendClothing, routeWeatherSignature, type RouteHour } from "../route-weather";

const points = [{ lat: 41, lon: 2 }, { lat: 41, lon: 2.5 }, { lat: 41, lon: 3 }];
const sample = (temperature: number, wind = 5, rain = 0, rainProbability = 0): RouteHour => ({ timestamp: 0, km: 0, lat: 41, lon: 2, temperature, apparent: temperature, wind, rain, rainProbability });
describe("route hourly clothing", () => {
  it("makes hourly forecasts available up to 3 days, not 4 days", () => {
    const now = new Date("2026-11-02T07:00:00Z");
    expect(forecastAvailability("2026-11-05", now)).toBe("available");
    expect(forecastAvailability("2026-11-06", now)).toBe("too_far");
    expect(forecastAvailability("2026-11-01", now)).toBe("past");
  });
  it("uses declared duration and estimates it from distance and climbing otherwise", () => {
    expect(estimatedRouteHours({ duration_hours: 5.5, distance_km: 100 })).toBe(5.5);
    expect(estimatedRouteHours({ distance_km: 48, elevation_m: 1000, intensity: "media" })).toBe(2.6);
  });
  it("maps each hour including departure and exact arrival to route progress", () => {
    const start = routeDeparture("2026-11-02", "07:30", "Europe/Madrid");
    expect(start).toBe(Date.parse("2026-11-02T06:30:00Z"));
    const schedule = routeSchedule(points, 2.5, start);
    expect(schedule.map(p => p.timestamp - start)).toEqual([0, 3600000, 7200000, 9000000]);
    expect(schedule[0].lon).toBe(2);
    expect(schedule[3].lon).toBeCloseTo(3, 3);
    expect(schedule[1].lon).toBeCloseTo(2.4, 3);
  });
  it("includes next-day arrival and respects summer timezone", () => {
    const start = routeDeparture("2026-07-02", "23:30", "Europe/Madrid");
    expect(start).toBe(Date.parse("2026-07-02T21:30:00Z"));
    expect(routeSchedule(points, 2, start).at(-1)?.timestamp).toBe(Date.parse("2026-07-02T23:30:00Z"));
  });
  it("does not exceed duration or accept invalid duration/time", () => {
    expect(routeSchedule(points, 0.5, 0).map(p => p.timestamp)).toEqual([0, 1800000]);
    expect(() => routeSchedule(points, 25, 0)).toThrow();
    expect(() => routeDeparture("2026-11-02", "25:00", "Europe/Madrid")).toThrow();
  });
  it("reads the correct hourly bin at every location and detects missing/null data", () => {
    const schedule = routeSchedule(points, 1, 1800000);
    const data = { hourly: { time: [0, 3600], temperature_2m: [10, 20], apparent_temperature: [9, 19], wind_speed_10m: [5, 15], precipitation: [0, 1], precipitation_probability: [0, 50] } };
    const result = mapRouteHours(schedule, [data, data]);
    expect(result.complete).toBe(true);
    expect(result.samples.map(p => p.temperature)).toEqual([10, 20]);
    expect(mapRouteHours(schedule, [data]).complete).toBe(false);
    expect(mapRouteHours(schedule, [{ hourly: { ...data.hourly, temperature_2m: [null, 20] } }, data]).complete).toBe(false);
  });
  it("recommends upper body, legs and spares for the coldest conditions, wind and rain", () => {
    const result = recommendClothing([sample(19), sample(7, 25, 0.2)]);
    expect(result?.upper).toEqual(["thermal_top", "base_layer"]);
    expect(result?.legs).toEqual(["thermal_tights"]);
    expect(result?.accessories).toEqual(expect.arrayContaining(["vest", "arm_warmers", "windbreaker", "rain_jacket", "full_gloves", "overshoes"]));
  });
  it("recommends light clothing for warm dry weather without rain jacket", () => {
    const result = recommendClothing([sample(26), sample(28)]);
    expect(result?.upper).toEqual(["light_top"]);
    expect(result?.legs).toEqual(["shorts"]);
    expect(result?.accessories).not.toContain("rain_jacket");
    expect(recommendClothing([])).toBeNull();
  });
  it("invalidates the forecast signature after geometry, duration or date changes", () => {
    const original = routeWeatherSignature(points, "2026-11-02", 2);
    expect(routeWeatherSignature(points, "2026-11-03", 2)).not.toBe(original);
    expect(routeWeatherSignature(points, "2026-11-02", 3)).not.toBe(original);
    expect(routeWeatherSignature([...points, { lat: 42, lon: 3 }], "2026-11-02", 2)).not.toBe(original);
  });
});