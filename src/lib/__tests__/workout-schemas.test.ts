import { describe, expect, it } from "vitest";
import { StepSchema as GeneratedStepSchema, WorkoutSchema as GeneratedWorkoutSchema } from "../workouts-gen.server";
import { StepSchema, WorkoutSchema } from "../workouts-schemas";

describe("límites de texto de los esquemas de entrenamiento", () => {
  it("limita summary a 240 caracteres en todos los esquemas", () => {
    expect(GeneratedWorkoutSchema.properties.summary.maxLength).toBe(240);
    expect(WorkoutSchema.properties.summary.maxLength).toBe(240);
  });

  it("limita why a 180 caracteres", () => {
    expect(GeneratedWorkoutSchema.properties.why.maxLength).toBe(180);
  });

  it("limita description a 120 caracteres en todos los esquemas", () => {
    expect(GeneratedStepSchema.properties.description.maxLength).toBe(120);
    expect(StepSchema.properties.description.maxLength).toBe(120);
  });
});
