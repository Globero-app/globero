import { describe, it, expect } from "vitest";
import { resolveMaxTokens } from "../ai-call.server";
describe("resolveMaxTokens", () => {
  it("tareas complejas: 16000", () => expect(resolveMaxTokens({ fn: "workouts-week" })).toBe(16000));
  it("auxiliares: 4000", () => expect(resolveMaxTokens({ fn: "meal-swap" })).toBe(4000));
  it("override acotado al tope global", () => expect(resolveMaxTokens({ fn: "x", maxTokens: 99999 })).toBe(16000));
});
