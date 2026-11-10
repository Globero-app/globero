import { expect, it, vi } from "vitest";
import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import { assertPlanDates, parseAIResponse } from "../ai-response";
import { generateWeeklyNutritionCore } from "../nutrition-gen.server";
import { generateWorkoutsCore } from "../workouts-gen.server";

// Opt-in paid integration test. Synthetic profile, actual production prompts,
// schemas/model/token cap; no account access, provider sync or database writes.
vi.mock("../ai-call.server", async (original) => {
  const { resolveMaxTokens, resolveModel } = await original<typeof import("../ai-call.server")>();
  return { callAI: async (messages: Array<{ role: "system" | "user"; content: string }>, schema: any, meta: any) => {
    expect(resolveModel(meta)).toBe("openai/gpt-5.6-sol");
    const limit = resolveMaxTokens(meta);
    const response = await generateChatCompletion({
      model: "openai/gpt-5.6-sol", messages, max_completion_tokens: limit, reasoning_effort: "none",
      tools: [{ type: "function", function: { name: "respond", description: "Respuesta estructurada", parameters: schema } }],
      tool_choice: { type: "function", function: { name: "respond" } },
    }, { maxRetries: 0 });
    const result = parseAIResponse(response, schema);
    const dates = [...messages[1].content.matchAll(meta.fn === "nutrition-week"
      ? /^- (\d{4}-\d{2}-\d{2}) \(/gm : /^- Sesión \d+: (\d{4}-\d{2}-\d{2})/gm)].map((match) => match[1]);
    assertPlanDates(result, meta.fn === "nutrition-week" ? "dias" : "workouts", meta.fn === "nutrition-week" ? "fecha" : "scheduled_date", dates);
    console.log(JSON.stringify({ fn: meta.fn, model: response.model, max_tokens: limit,
      finish_reason: response.choices[0]?.finish_reason, usage: response.usage, dates, complete: true }));
    throw new Error("LIVE_PLAN_VALIDATED_NO_SAVE");
  } };
});
vi.mock("../user-lang.server", () => ({ getUserLang: () => "es", langInstruction: () => "Escribe en castellano." }));
vi.mock("../training-load.server", async (original) => ({
  ...await original<typeof import("../training-load.server")>(),
  buildTrainingLoad: async () => ({ ctl: 40, atl: 45, tsb: -5, weekly: [], avg_weekly_tss_3w: 200, completed_28d: 5, planned_28d: 6 }),
  prescribeWeek: () => ({ target_tss: 280, hard_sessions_max: 2, mode: "normal", reason: "Carga estable" }),
}));
vi.mock("../athlete-profile.server", () => ({ refreshAthleteProfile: async () => null, athletePromptBlock: () => "", minutesForDay: () => 60 }));

const writes = vi.fn(() => { throw new Error("Unexpected database write"); });
const db = { from(table: string) {
  const query: any = {
    select: () => query, eq: () => query, neq: () => query, not: () => query,
    gte: () => query, lte: () => query, order: () => query, limit: () => query,
    insert: writes, upsert: writes, delete: writes, update: writes,
    maybeSingle: async () => ({ data: table === "profiles" ? {
      trial_ends_at: "2099-01-01", age: 40, gender: "male", weight_kg: 75, height_cm: 178,
      ftp: 250, max_hr: 183, lthr: 165, cyclist_type: "mixto", dietary_preferences: "sin lactosa",
    } : null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 1 }).then(resolve),
  }; return query;
} };

it.runIf(process.env.RUN_LIVE_AI_PLANS === "1")("real seven-day nutrition JSON fits the current token cap", async () => {
  await expect(generateWeeklyNutritionCore(db, "synthetic", { goal: "mantenimiento", week_start: "2026-11-16" }))
    .rejects.toThrow("LIVE_PLAN_VALIDATED_NO_SAVE");
  expect(writes).not.toHaveBeenCalled();
}, 180000);

it.runIf(process.env.RUN_LIVE_AI_PLANS === "1")("real seven-session workout JSON fits the current token cap", async () => {
  await expect(generateWorkoutsCore(db, "synthetic", { bike_type: "carretera", duration_minutes: 60,
    training_days: [0,1,2,3,4,5,6], max_count: 7, long_ride_day: 0,
    from: new Date("2026-11-15T12:00:00Z"), until: "2026-11-22" }))
    .rejects.toThrow("LIVE_PLAN_VALIDATED_NO_SAVE");
  expect(writes).not.toHaveBeenCalled();
}, 180000);