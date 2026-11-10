import { describe, expect, it, vi } from "vitest";
import { assertPlanDates, parseAIResponse } from "../ai-response";

const schema = { type: "object", properties: { workouts: { type: "array", items: {
  type: "object", required: ["steps"], properties: { steps: { type: "array", minItems: 3 } },
} } }, required: ["workouts"] };
const response = (args: string, finish_reason = "tool_calls") => ({ choices: [{ finish_reason,
  message: { tool_calls: [{ function: { arguments: args } }] },
}] });

describe("incomplete AI output", () => {
  it("rejects length termination even when the JSON is syntactically complete", () => {
    expect(() => parseAIResponse(response('{"workouts":[{"steps":[1,2,3]}]}', "length"), schema)).toThrow("truncada");
  });
  it("rejects malformed truncated JSON", () => {
    expect(() => parseAIResponse(response('{"workouts":['), schema)).toThrow("truncada");
  });
  it("rejects missing structured response instead of returning plain text", () => {
    expect(() => parseAIResponse({ choices: [{ message: { content: "plan parcial" } }] }, schema)).toThrow("incompleta");
  });
  it("rejects missing nested fields and missing steps", () => {
    expect(() => parseAIResponse(response('{"workouts":[{}]}'), schema)).toThrow("incompleta");
    expect(() => parseAIResponse(response('{"workouts":[{"steps":[1,2]}]}'), schema)).toThrow("incompleta");
  });
  it("returns complete valid JSON unchanged", () => {
    expect(parseAIResponse(response('{"workouts":[{"steps":[1,2,3]}]}'), schema)).toEqual({ workouts: [{ steps: [1,2,3] }] });
  });
  it("requires all seven menu dates, rejecting duplicates or missing days", () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${16 + i}`);
    const dias = dates.map((fecha) => ({ fecha }));
    expect(() => assertPlanDates({ dias }, "dias", "fecha", dates)).not.toThrow();
    expect(() => assertPlanDates({ dias: dias.slice(0, 6) }, "dias", "fecha", dates)).toThrow("incompleta");
    expect(() => assertPlanDates({ dias: [...dias.slice(0, 6), dias[0]] }, "dias", "fecha", dates)).toThrow("incompleta");
  });
  it("requires every scheduled workout in order before persistence", () => {
    const dates = ["2026-11-16", "2026-11-18", "2026-11-20"];
    const save = vi.fn();
    expect(() => {
      assertPlanDates({ workouts: [{ scheduled_date: dates[0] }] }, "workouts", "scheduled_date", dates);
      save();
    }).toThrow("incompleta");
    expect(save).not.toHaveBeenCalled();
  });
});