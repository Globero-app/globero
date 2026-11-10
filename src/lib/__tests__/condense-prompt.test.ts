import { describe, it, expect } from "vitest";
import { condensePrompt } from "../workouts-gen.server";
describe("condensePrompt", () => {
  it("colapsa líneas en blanco múltiples", () => {
    expect(condensePrompt("A  \n\n\n\nB\n")).toBe("A\n\nB");
  });
});
