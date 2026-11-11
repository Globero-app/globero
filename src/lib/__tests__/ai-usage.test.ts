import { describe, expect, it } from "vitest";
import { aiUsageCostUsd, aiUsageMonthRange, estimateAiCredits, summarizeAiUsage, summarizeAiUsageByModel, summarizeAiUsageByUser } from "../ai-usage";

describe("AI usage estimates", () => {
  it("uses the current token rates for the complex model", () => {
    expect(estimateAiCredits({ model: "gpt-5.6-sol", prompt_tokens: 1000, completion_tokens: 500 })).toBeCloseTo(0.056, 10);
  });

  it("recognizes dated light-model and legacy-model response names", () => {
    expect(estimateAiCredits({ model: "gpt-6-luna-2026-11-01", prompt_tokens: 1000, completion_tokens: 500 })).toBeCloseTo(0.0014, 10);
    expect(estimateAiCredits({ model: "gpt-5-mini-2025-08-07", prompt_tokens: 1000, completion_tokens: 500 })).toBeCloseTo(0.005, 10);
  });

  it("converts each estimated credit to exactly 0.20 USD", () => {
    expect(aiUsageCostUsd(12.5)).toBe(2.5);
  });

  it("aggregates global calls, tokens, credits and cost", () => {
    const total = summarizeAiUsage([
      { model: "gpt-5.6-sol", calls: 2, prompt_tokens: 1000, completion_tokens: 500 },
      { model: "gpt-5-mini-2025-08-07", calls: 1, prompt_tokens: 1000, completion_tokens: 500 },
    ]);
    expect(total.calls).toBe(3);
    expect(total.tokens).toBe(3000);
    expect(total.credits).toBeCloseTo(0.061, 10);
    expect(total.cost_usd).toBeCloseTo(0.0122, 10);
  });

  it("aggregates monthly usage per user without mixing model rates", () => {
    const users = summarizeAiUsageByUser([
      { user_id: "a", model: "gpt-5.6-sol", calls: 1, prompt_tokens: 1000, completion_tokens: 500 },
      { user_id: "a", model: "gpt-6-luna", calls: 2, prompt_tokens: 1000, completion_tokens: 500 },
      { user_id: "b", model: "gpt-5-mini", calls: 1, prompt_tokens: 1000, completion_tokens: 500 },
    ]);
    expect(users).toHaveLength(2);
    expect(users.find((user) => user.user_id === "a")?.credits).toBeCloseTo(0.0574, 10);
    expect(users.find((user) => user.user_id === "a")?.calls).toBe(3);
    expect(users.find((user) => user.user_id === "b")?.cost_usd).toBeCloseTo(0.001, 10);
  });
});
