import { describe, expect, it, vi } from "vitest";

const { callAI } = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock("../ai-call.server", () => ({ callAI }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
// Invoke the real handlers with a supplied authenticated context, without RPC transport.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder: any = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: any) => fn,
    };
    return builder;
  },
}));
import { generateMenu, swapRecipe } from "../ai.functions";
import { importWorkoutPlan } from "../plan-io.functions";

describe("expired trial entrypoints", () => {
  for (const [name, handler] of [
    ["competition menus", generateMenu],
    ["competition recipe swaps", swapRecipe],
    ["new imported workouts", importWorkoutPlan],
  ] as const) {
    it(`rejects ${name} before AI or data writes after 30 days`, async () => {
      callAI.mockClear();
      const write = vi.fn();
      const q: any = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: { trial_ends_at: "2020-01-31T00:00:00Z", subscription_status: "inactive" } }),
        insert: write, update: write,
      };
      await expect((handler as any)({ data: {}, context: { userId: "user", supabase: { from: () => q } } }))
        .rejects.toThrow("Activa una suscripción");
      expect(callAI).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    });
  }
});