import { expect, test } from "vitest";
import { workoutDiabetesWarnings } from "../diabetes";

test("sesión intensa corta: riesgo hiper, sin hipo", () => {
  expect(workoutDiabetesWarnings(45, 0.9, "type1")).toEqual(["pre", "hyper", "reserve", "post", "night"]);
});
test("rodaje largo suave: riesgo hipo y nocturno", () => {
  expect(workoutDiabetesWarnings(120, 0.65, "type1")).toEqual(["pre", "hypo", "reserve", "post", "night"]);
});
test("tipo 2 sin aviso nocturno", () => {
  expect(workoutDiabetesWarnings(120, 0.65, "type2")).not.toContain("night");
});
