import { describe, it, expect } from "vitest";
import { carbsPerHour, buildFuelPlan } from "../fueling";

describe("carbsPerHour", () => {
  it("salida corta suave no requiere carbohidratos", () => expect(carbsPerHour(0.75, 0.6, "medium")).toBe(0));
  it("3h+ intensa con tolerancia media = 90 g/h", () => expect(carbsPerHour(4, 0.85, "medium")).toBe(90));
  it("tolerancia baja nunca supera 60 g/h", () => expect(carbsPerHour(5, 0.9, "low")).toBeLessThanOrEqual(60));
  it("tolerancia alta en salida larga intensa sube a 110 g/h", () => expect(carbsPerHour(4, 0.85, "high")).toBe(110));
});

describe("buildFuelPlan", () => {
  it("el total de carbohidratos coincide con ritmo × horas", () => {
    const p = buildFuelPlan(180, 0.75, "medium");
    expect(p.totalCarbs).toBe(225);
    expect(p.schedule.length).toBeGreaterThan(0);
  });
});
