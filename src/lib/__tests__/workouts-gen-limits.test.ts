import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ competition: vi.fn(), periodization: vi.fn() }));
vi.mock("../weather-daily.server", () => ({ fetchDailyWeather: vi.fn(), adviseForWorkout: vi.fn() }));
vi.mock("../ai-call.server", () => ({ callAI: vi.fn() }));
vi.mock("../competition-target", () => ({ getNextActiveCompetition: mocks.competition }));
vi.mock("../subscription-access.server", () => ({ requireGenerationAccess: vi.fn() }));
vi.mock("../training-load.server", () => ({ weekStart: (date: string) => date }));
vi.mock("../user-lang.server", () => ({ getUserLang: () => "es", langInstruction: () => "es" }));
vi.mock("../workout-validator.server", () => ({}));
vi.mock("../athlete-profile.server", () => ({}));
vi.mock("../periodization.server", () => ({ resolvePeriodization: mocks.periodization }));
import { generateWorkoutsCore } from "../workouts-gen.server";

const db = {
  from(table: string) {
    const query: any = {
      select: () => query, eq: () => query, not: () => query, order: () => query, limit: () => query,
      maybeSingle: () => Promise.resolve({ data: table === "profiles" ? { weight_kg: 70 } : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [] }).then(resolve),
    };
    return query;
  },
};

afterEach(() => vi.useRealTimers());

it.each(["2026-11-08", "2026-11-09"])("competition %s cannot collapse the future schedule", async (date) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
  mocks.competition.mockResolvedValue({ date, name: "Race" });
  // Stop after scheduling, before any AI or persisted generation is performed.
  mocks.periodization.mockImplementation(() => { throw new Error("schedule reached periodization"); });
  await expect(generateWorkoutsCore(db, "owner", {
    bike_type: "carretera", duration_minutes: 60, training_days: [2, 4],
    from: new Date("2026-11-08T12:00:00Z"), until: "2026-11-15",
  })).rejects.toThrow("schedule reached periodization");
});

it("a future competition still bounds the calendar", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
  mocks.competition.mockResolvedValue({ date: "2026-11-10", name: "Race" });
  await expect(generateWorkoutsCore(db, "owner", {
    bike_type: "carretera", duration_minutes: 60, training_days: [4],
    from: new Date("2026-11-08T12:00:00Z"), until: "2026-11-15",
  })).rejects.toThrow("No hay días de entrenamiento disponibles");
});