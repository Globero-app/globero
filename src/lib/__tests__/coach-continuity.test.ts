import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ callAI: vi.fn().mockResolvedValue("Mantén la sesión según lo realmente realizado.") }));
vi.mock("../ai-call.server", () => ({ callAI: mocks.callAI }));
vi.mock("../user-lang.server", () => ({ getUserLang: async () => "es", langInstruction: () => "Escribe en español" }));
vi.mock("../training-load.server", async (original) => ({
  ...await original<typeof import("../training-load.server")>(),
  madridTodayISO: () => "2026-11-16",
  buildTrainingLoad: async () => ({ ctl: 40, atl: 40, tsb: 0 }),
}));
import { buildDailyBrief } from "../coach.server";

beforeEach(() => mocks.callAI.mockClear());

it("daily advice reuses unchanged history but regenerates when Sunday's completion changes", async () => {
  let status = "pending";
  let profile: any = { id: "owner" };
  const db = { from(table: string) {
    let continuity = false;
    const q: any = { select: () => q, eq: () => q, limit: () => q, order: () => q,
      gte: (column: string) => { if (column === "plan->>scheduled_date") continuity = true; return q; },
      lte: () => q,
      update: (value: any) => { profile = { ...profile, ...value }; return q; },
      maybeSingle: async () => ({ data: table === "profiles" ? profile : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "workouts" && continuity
        ? [{ status, actual_tss: 150, rpe: 4, plan: { scheduled_date: "2026-11-15", long_ride: true } }] : [] }).then(resolve),
    };
    return q;
  } };
  await buildDailyBrief(db, "owner");
  await buildDailyBrief(db, "owner");
  expect(mocks.callAI).toHaveBeenCalledTimes(1);
  status = "completed";
  await buildDailyBrief(db, "owner");
  expect(mocks.callAI).toHaveBeenCalledTimes(2);
  const context = (index: number) => {
    const prompt = mocks.callAI.mock.calls[index][0][1].content as string;
    const line = prompt.split("\n").find((text) => text.startsWith("CONTINUIDAD CON")) ?? "";
    return JSON.parse(line.slice(line.indexOf(": ") + 2));
  };
  expect(context(0).sesiones[0]).toMatchObject({ estado: "no_realizado", tss_real: 0 });
  expect(context(1).sesiones[0]).toMatchObject({ estado: "realizado", tss_real: 150 });
});