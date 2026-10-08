import { describe, it, expect, vi } from "vitest";
import { handleWahooEvent, resolveWahooEvent } from "../wahoo-webhook";

function deps(stored = 1, profile: any = { id: "u1" }) {
  return {
    findProfile: vi.fn(async () => profile),
    pullActivities: vi.fn(async () => stored),
    refreshPmc: vi.fn(async () => {}),
    deauthorize: vi.fn(async () => {}),
  };
}

describe("resolveWahooEvent", () => {
  it("acepta event_type", () => expect(resolveWahooEvent({ event_type: "workout_summary" })).toBe("workout"));
  it("acepta event", () => expect(resolveWahooEvent({ event: "workout_summary" })).toBe("workout"));
  it("event_type tiene prioridad sobre event", () =>
    expect(resolveWahooEvent({ event_type: "foo", event: "workout_summary" })).toBe("ignore"));
  it("evento desconocido se ignora", () => expect(resolveWahooEvent({ event: "foo" })).toBe("ignore"));
  it("sin evento es desautorización", () => expect(resolveWahooEvent({})).toBe("deauth"));
});

describe("handleWahooEvent", () => {
  it("recalcula PMC con actividades nuevas vía event", async () => {
    const d = deps(2);
    const r = await handleWahooEvent({ event: "workout_summary", user: { id: 9 } }, d);
    expect(r).toMatchObject({ stored: 2, refreshed: true });
    expect(d.refreshPmc).toHaveBeenCalledWith("u1", { id: "u1" });
  });

  it("recalcula PMC con actividades nuevas vía event_type", async () => {
    const d = deps(1);
    const r = await handleWahooEvent({ event_type: "workout_summary", user_id: 9 }, d);
    expect(r).toMatchObject({ refreshed: true });
  });

  it("no recalcula si la actividad ya estaba importada", async () => {
    const d = deps(0);
    const r = await handleWahooEvent({ event: "workout_summary", user: { id: 9 } }, d);
    expect(r).toMatchObject({ stored: 0, refreshed: false });
    expect(d.refreshPmc).not.toHaveBeenCalled();
  });

  it("evento inválido no importa, no recalcula ni desconecta", async () => {
    const d = deps();
    const r = await handleWahooEvent({ event: "bogus", user: { id: 9 } }, d);
    expect(r).toMatchObject({ ignored: true, refreshed: false });
    expect(d.pullActivities).not.toHaveBeenCalled();
    expect(d.refreshPmc).not.toHaveBeenCalled();
    expect(d.deauthorize).not.toHaveBeenCalled();
  });

  it("sin user id devuelve 400", async () => {
    const d = deps();
    const r = await handleWahooEvent({ event: "workout_summary" }, d);
    expect(r.status).toBe(400);
    expect(d.pullActivities).not.toHaveBeenCalled();
  });

  it("usuario desconocido se ignora sin recalcular", async () => {
    const d = deps(1, null);
    const r = await handleWahooEvent({ event: "workout_summary", user: { id: 9 } }, d);
    expect(r).toMatchObject({ ignored: true, refreshed: false });
    expect(d.pullActivities).not.toHaveBeenCalled();
  });

  it("desautorización no recalcula PMC", async () => {
    const d = deps();
    await handleWahooEvent({ event: "deauthorize", user: { id: 9 } }, d);
    expect(d.deauthorize).toHaveBeenCalledWith("9");
    expect(d.refreshPmc).not.toHaveBeenCalled();
  });
});
