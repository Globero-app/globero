import { describe, expect, it } from "vitest";
import { competitionToday, getNextActiveCompetition } from "../competition-target";

const rows = [
  { id: "past", user_id: "miguel", name: "Anterior", date: "2026-10-31", intensity: "competicion" },
  { id: "route", user_id: "miguel", name: "Ruta", date: "2026-11-02", intensity: "media" },
  { id: "later", user_id: "miguel", name: "Segunda", date: "2026-11-15", intensity: "competicion" },
  { id: "next", user_id: "miguel", name: "Próxima", date: "2026-11-08", intensity: "competicion" },
  { id: "other", user_id: "other", name: "Ajena", date: "2026-11-03", intensity: "competicion" },
];

function database(entries = rows, error: { message: string } | null = null) {
  return { from: (table: string) => {
    expect(table).toBe("competitions");
    let result = [...entries];
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { result = result.filter(row => row[key as keyof typeof row] === value); return query; },
      gte: (_key: string, value: string) => { result = result.filter(row => row.date >= value); return query; },
      order: (key: string) => { if (key === "date") result.sort((a, b) => a.date.localeCompare(b.date)); return query; },
      limit: (count: number) => { result = result.slice(0, count); return query; },
      maybeSingle: async () => ({ data: result[0] ?? null, error }),
    };
    return query;
  } };
}

describe("automatic competition target", () => {
  it("selects the earliest upcoming marked competition owned by the athlete, excluding routes and past events", async () => {
    const target = await getNextActiveCompetition(database(), "miguel", "2026-11-01");
    expect(target?.id).toBe("next");
    expect(target?.date).toBe("2026-11-08");
  });
  it("uses free training when no active competition remains", async () => {
    expect(await getNextActiveCompetition(database(), "miguel", "2026-11-16")).toBeNull();
  });
  it("includes a competition on the current Madrid date", async () => {
    expect((await getNextActiveCompetition(database(), "miguel", "2026-11-08"))?.id).toBe("next");
    expect(competitionToday(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08");
  });
  it("does not silently switch to free training when loading fails", async () => {
    await expect(getNextActiveCompetition(database([], { message: "unavailable" }), "miguel", "2026-11-01"))
      .rejects.toThrow("unavailable");
  });
});