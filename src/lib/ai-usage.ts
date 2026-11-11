export const AI_CREDIT_COST_USD = 0.2;

export interface AiUsageTokens {
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface AiUsageTotals {
  calls: number;
  tokens: number;
  credits: number;
  cost_usd: number;
}

/* Tarifas base actuales del AI Gateway, en créditos por token. */
const MODEL_RATES = [
  { match: "gpt-6-luna", input: 0.0000004, output: 0.000002 },
  { match: "gpt-5.6-sol", input: 0.000016, output: 0.00008 },
  { match: "gpt-5-mini", input: 0.000001, output: 0.000008 },
] as const;
const DEFAULT_RATE = { input: 0.000016, output: 0.00008 };

export function estimateAiCredits(row: Pick<AiUsageTokens, "model" | "prompt_tokens" | "completion_tokens">): number {
  const model = row.model.toLowerCase();
  const rate = MODEL_RATES.find((candidate) => model.includes(candidate.match)) ?? DEFAULT_RATE;
  const promptTokens = Math.max(0, Number(row.prompt_tokens) || 0);
  const completionTokens = Math.max(0, Number(row.completion_tokens) || 0);
  return promptTokens * rate.input + completionTokens * rate.output;
}

export function aiUsageCostUsd(credits: number): number {
  return credits * AI_CREDIT_COST_USD;
}

export function summarizeAiUsage(rows: readonly AiUsageTokens[]): AiUsageTotals {
  const credits = rows.reduce((total, row) => total + estimateAiCredits(row), 0);
  return {
    calls: rows.reduce((total, row) => total + (Number(row.calls) || 0), 0),
    tokens: rows.reduce((total, row) => total + (Number(row.prompt_tokens) || 0) + (Number(row.completion_tokens) || 0), 0),
    credits,
    cost_usd: aiUsageCostUsd(credits),
  };
}

export function summarizeAiUsageByUser<T extends AiUsageTokens & { user_id: string | null }>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.user_id ?? "system";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((items) => ({
    user_id: items[0].user_id,
    ...summarizeAiUsage(items),
  })).sort((a, b) => b.credits - a.credits);
}

export function formatAiCredits(value: number, locale = "es-ES"): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatAiCostUsd(value: number, locale = "es-ES"): string {
  return value.toLocaleString(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
