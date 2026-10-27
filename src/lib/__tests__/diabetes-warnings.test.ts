import { expect, test } from "vitest";
import { glucoseTargets, diabetesPrompt, diabetesCoachContext, workoutDiabetesWarnings } from "../diabetes";

test("sesión intensa corta: riesgo hiper, sin hipo", () => {
  expect(workoutDiabetesWarnings(45, 0.9, "type1")).toEqual(["pre", "hyper", "reserve", "post", "night"]);
});
test("rodaje largo suave: riesgo hipo y nocturno", () => {
  expect(workoutDiabetesWarnings(120, 0.65, "type1")).toEqual(["pre", "hypo", "reserve", "post", "night"]);
});
test("tipo 2 sin aviso nocturno", () => {
  expect(workoutDiabetesWarnings(120, 0.65, "type2")).not.toContain("night");
});

import { diabetesCoachContext } from "../diabetes";
test("contexto coach solo con diabetes y sin dosis", () => {
  expect(diabetesCoachContext({ has_diabetes: false })).toBe("");
  const c = diabetesCoachContext({ has_diabetes: true, diabetes_type: "type1", cgm_device: "dexcom" });
  expect(c).toContain("Dexcom");
  expect(c).toContain("NUNCA indiques dosis");
});

test("glucoseTargets usa valores seguros por defecto", () => {
  expect(glucoseTargets(null)).toEqual({ min: 120, max: 180, rescue: 15 });
  expect(glucoseTargets({ has_diabetes: true })).toEqual({ min: 120, max: 180, rescue: 15 });
});

test("glucoseTargets respeta los valores personalizados del atleta", () => {
  expect(glucoseTargets({ has_diabetes: true, glucose_target_min: 100, glucose_target_max: 160, glucose_rescue_grams: 20 }))
    .toEqual({ min: 100, max: 160, rescue: 20 });
});

test("los prompts de IA incluyen los límites personalizados", () => {
  const p = { has_diabetes: true, diabetes_type: "type1", cgm_device: "dexcom", glucose_target_min: 110, glucose_target_max: 170, glucose_rescue_grams: 25 };
  expect(diabetesPrompt(p)).toContain("110–170 mg/dL");
  expect(diabetesPrompt(p)).toContain("25 g de CHO de rescate");
  expect(diabetesCoachContext(p)).toContain("110–170 mg/dL");
  expect(diabetesCoachContext(p)).toContain("rescate 25 g CHO");
});
