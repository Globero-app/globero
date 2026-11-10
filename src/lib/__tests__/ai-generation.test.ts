import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWeeklyNutritionCore, immediateNutritionWeeks } from "../nutrition-gen.server";
import { generateWorkoutsCore } from "../workouts-gen.server";
import { buildDailyBrief } from "../coach.server";

const { callAI, getUserLang } = vi.hoisted(() => ({
  callAI: vi.fn<(messages: any[], schema?: any, meta?: any) => Promise<any>>(),
  getUserLang: vi.fn().mockResolvedValue("es"),
}));
vi.mock("../ai-call.server", () => ({ callAI }));
vi.mock("../user-lang.server", async (original) => ({
  ...await original<typeof import("../user-lang.server")>(), getUserLang,
}));
vi.mock("../training-load.server", async (original) => ({
  ...await original<typeof import("../training-load.server")>(),
  buildTrainingLoad: vi.fn().mockResolvedValue({
    ctl: 40, atl: 45, tsb: -5, weekly: [], avg_weekly_tss_3w: 200,
    completed_28d: 5, planned_28d: 6,
  }),
  prescribeWeek: vi.fn().mockReturnValue({ target_tss: 200, hard_sessions_max: 1, mode: "normal" }),
}));
vi.mock("../athlete-profile.server", () => ({
  refreshAthleteProfile: vi.fn().mockResolvedValue(null),
  athletePromptBlock: () => "", minutesForDay: () => 60,
}));

function database(profile: any, competition: any = null) {
  profile = { trial_ends_at: "2099-01-01T00:00:00Z", ...profile };
  return {
    from(table: string) {
      let saved: any;
      const query: any = {
        select: () => query, eq: () => query, neq: () => query, not: () => query,
        gte: () => query, lte: () => query, order: () => query, limit: () => query,
        upsert: (row: any) => { saved = row; return query; },
        update: () => query,
        maybeSingle: async () => ({ data: saved ?? (table === "profiles" ? profile : table === "competitions" ? competition : null) }),
        then: (resolve: (value: any) => any) => Promise.resolve({ data: [], count: 1 }).then(resolve),
      };
      return query;
    },
  };
}

beforeEach(() => {
  callAI.mockReset();
  getUserLang.mockResolvedValue("es");
});

it("expired accounts cannot reach the workout or nutrition AI boundary", async () => {
  const expired = database({ trial_ends_at: "2020-01-01T00:00:00Z", subscription_status: "inactive" });
  await expect(generateWorkoutsCore(expired, "user", { bike_type: "carretera", duration_minutes: 60, training_days: [1] })).rejects.toThrow("Activa una suscripción");
  await expect(generateWeeklyNutritionCore(expired, "user", { goal: "mantenimiento" })).rejects.toThrow("Activa una suscripción");
  expect(callAI).not.toHaveBeenCalled();
});

describe("immediate nutrition horizon", () => {
  it("generates at most current and next week even with four affected weeks", () => {
    expect(immediateNutritionWeeks([
      "2026-10-18", "2026-10-19", "2026-10-25", "2026-10-26", "2026-11-02",
    ], "2026-10-17")).toEqual(["2026-10-12", "2026-10-19"]);
  });
  it("does not generate an unrelated later week", () => {
    expect(immediateNutritionWeeks(["2026-11-02"], "2026-10-17")).toEqual([]);
  });
  it("falls back to current week when no workouts were inserted", () => {
    expect(immediateNutritionWeeks([], "2026-10-17")).toEqual(["2026-10-12"]);
  });
  it("keeps Sunday in current week and next Monday in next week", () => {
    expect(immediateNutritionWeeks(["2026-10-18", "2026-10-19", "2026-10-26"], "2026-10-18"))
      .toEqual(["2026-10-12", "2026-10-19"]);
  });
});

it("nutrition uses the same leading system prefix across profiles, goals and weeks", async () => {
  callAI.mockImplementation(async (messages) => ({
    dias: [...messages[1].content.matchAll(/^- (\d{4}-\d{2}-\d{2}) \(/gm)].map((match) => ({
      fecha: match[1], dia_semana: "lunes", entrenamiento: "Descanso",
      objetivo_calorias_kcal: 2200, objetivo_carbohidratos_g: 280, objetivo_proteinas_g: 120,
      ...Object.fromEntries(["desayuno", "media_manana", "comida", "merienda", "cena"].map((meal) => [meal, {
        nombre: "Arroz", ingredientes: ["Arroz 100 g"], preparacion: "Cocer el arroz.",
        macros: { carbohidratos_g: 56, proteinas_g: 24, grasas_g: 12, calorias_kcal: 428 },
      }])),
    })), resumen: "Distribuir carbohidratos según carga.",
  }));
  const first = await generateWeeklyNutritionCore(database({ weight_kg: 71, dietary_preferences: "sin lactosa" }), "a", {
    goal: "mantenimiento", week_start: "2026-10-12",
  });
  const second = await generateWeeklyNutritionCore(database({ weight_kg: 83, dietary_preferences: "vegano" }), "b", {
    goal: "masa_muscular", week_start: "2026-10-19",
  });
  const [a, b] = callAI.mock.calls.map(([messages]) => messages);
  expect(a.map((m: any) => m.role)).toEqual(["system", "user"]);
  expect(a[0].content).toBe(b[0].content);
  expect(a[0].content).not.toContain("2026-10-12");
  expect(a[1].content).toContain("sin lactosa");
  expect(b[1].content).toContain("vegano");
  expect(first.week_start).toBe("2026-10-12");
  expect(second.week_start).toBe("2026-10-19");
});

it("workouts keep the system prefix stable across FTP, prescription basis and language", async () => {
  // Stop at the captured AI boundary: never insert/delete workouts in this prompt test.
  callAI.mockRejectedValue(new Error("captured request"));
  for (const [ftp, basis, lang] of [[237, "power", "es"], [319, "hr", "fr"]] as const) {
    getUserLang.mockResolvedValue(lang);
    await expect(generateWorkoutsCore(database({ ftp, max_hr: 183, weight_kg: 75 }), "user", {
      bike_type: "carretera", duration_minutes: 60, training_days: [1, 3], target_basis: basis,
      from: new Date("2026-10-18T12:00:00Z"), until: "2026-10-25",
    })).rejects.toThrow("captured request");
  }
  const [a, b] = callAI.mock.calls.map(([messages]) => messages);
  expect(a.map((m: any) => m.role)).toEqual(["system", "user"]);
  expect(a[0].content).toBe(b[0].content);
  expect(a[0].content).not.toContain("237W");
  expect(a[1].content).toContain("237W");
  expect(b[1].content).toContain("319W");
  expect(b[1].content).toContain("FRECUENCIA CARDÍACA");
});

it("manual and scheduled generation use the authoritative next competition instead of a client selection", async () => {
  callAI.mockRejectedValue(new Error("captured request"));
  for (const competition_id of [undefined, "stale-selection"]) {
    await expect(generateWorkoutsCore(database({ ftp: 250 }, {
      id: "next", name: "Próxima competición", date: "2099-06-15", intensity: "competicion",
    }), "user", {
      bike_type: "carretera", duration_minutes: 60, training_days: [1, 3], competition_id,
    })).rejects.toThrow("captured request");
  }
  for (const [messages] of callAI.mock.calls) {
    expect(messages[1].content).toContain("Nombre: Próxima competición");
    expect(messages[1].content).toContain("Fecha del evento: 2099-06-15");
    expect(messages[1].content).toContain("preparación específica para la competición indicada");
    expect(messages[1].content).not.toContain("stale-selection");
  }
});

it("coach keeps fixed role and format stable across context and language", async () => {
  callAI.mockResolvedValue("Consejo breve");
  await buildDailyBrief(database({}), "a");
  getUserLang.mockResolvedValue("fr");
  await buildDailyBrief(database({}), "b");
  const [a, b] = callAI.mock.calls.map(([messages]) => messages);
  expect(a.map((m: any) => m.role)).toEqual(["system", "user"]);
  expect(a[0].content).toBe(b[0].content);
  expect(a[1].content).not.toBe(b[1].content);
});