import { describe, it, expect } from "vitest";
import { validateWorkout, avoidBackToBackHard, enforceWeeklyTss, type ValidateCtx } from "@/lib/workout-validator.server";

const ctx: ValidateCtx = {
  ftp: 250,
  lthr: 160,
  maxHr: 185,
  basis: "power",
  duration_minutes: 60,
  long_ride: false,
};

const basePlan = () => ({
  name: "Test",
  title: "Sesión de prueba",
  summary: "…",
  steps: [
    { name: "Calentamiento", description: "suave", duration_type: "time", duration_seconds: 600, target: "power", target_low: 100, target_high: 140, intensity: "warmup" },
    { name: "Z2", description: "rodaje", duration_type: "time", duration_seconds: 2400, target: "power", target_low: 150, target_high: 180, intensity: "active" },
    { name: "Vuelta calma", description: "suave", duration_type: "time", duration_seconds: 600, target: "power", target_low: 90, target_high: 120, intensity: "cooldown" },
  ],
});

describe("validateWorkout", () => {
  it("garantiza calentamiento y vuelta a la calma", () => {
    const p = basePlan();
    p.steps = p.steps.slice(1, 2); // sin warmup ni cooldown
    const { plan } = validateWorkout(p, ctx);
    expect(plan.steps[0].intensity).toBe("warmup");
    expect(plan.steps[plan.steps.length - 1].intensity).toBe("cooldown");
  });

  it("reconstruye un plan vacío", () => {
    const { plan, minutes } = validateWorkout({ name: "x", steps: [] }, ctx);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(minutes - 60) / 60).toBeLessThanOrEqual(0.12);
  });

  it("los targets de potencia quedan dentro de las zonas del FTP", () => {
    const { plan } = validateWorkout(basePlan(), ctx);
    for (const s of plan.steps) {
      expect(s.target).toBe("power");
      expect(s.target_low).toBeGreaterThanOrEqual(0);
      expect(s.target_high).toBeGreaterThanOrEqual(s.target_low);
      // Nunca por encima de Z7 (160% FTP redondeado)
      expect(s.target_high).toBeLessThanOrEqual(Math.round(ctx.ftp! * 1.6) + 5);
    }
  });

  it("recorta nombres a 15 caracteres", () => {
    const p = basePlan();
    p.steps[1].name = "Un nombre extremadamente largo de bloque";
    const { plan } = validateWorkout(p, ctx);
    for (const s of plan.steps) expect(s.name.length).toBeLessThanOrEqual(15);
  });

  it("ajusta la duración total al objetivo ±10%", () => {
    const p = basePlan();
    p.steps[1].duration_seconds = 600; // total 30 min -> objetivo 60
    const { minutes } = validateWorkout(p, ctx);
    expect(Math.abs(minutes - 60) / 60).toBeLessThanOrEqual(0.12);
  });

  it("escala la tirada larga a ~1.8x", () => {
    const { minutes } = validateWorkout(basePlan(), { ...ctx, long_ride: true });
    expect(minutes).toBeGreaterThan(90);
  });

  it("en base FC usa targets hr en ppm", () => {
    const { plan } = validateWorkout(basePlan(), { ...ctx, basis: "hr" });
    for (const s of plan.steps) {
      expect(s.target).toBe("hr");
      expect(s.target_high).toBeLessThanOrEqual(Math.round(160 * 1.1) + 2);
    }
  });
});

describe("avoidBackToBackHard", () => {
  const hardPlan = () =>
    validateWorkout(
      {
        name: "Duro",
        steps: [
          { name: "Calentamiento", duration_type: "time", duration_seconds: 600, target: "power", target_low: 100, target_high: 140, intensity: "warmup" },
          { name: "Serie Z5", duration_type: "time", duration_seconds: 600, target: "power", target_low: 270, target_high: 300, intensity: "interval" },
          { name: "Vuelta calma", duration_type: "time", duration_seconds: 600, target: "power", target_low: 90, target_high: 120, intensity: "cooldown" },
        ],
      },
      { ...ctx, duration_minutes: 30 },
    ).plan;

  it("suaviza la segunda sesión dura en días consecutivos", () => {
    const items = [
      { plan: hardPlan(), tss: 60, minutes: 30, ctx, date: "2026-08-31" },
      { plan: hardPlan(), tss: 60, minutes: 30, ctx, date: "2026-09-01" },
    ];
    avoidBackToBackHard(items);
    expect(items[1].plan.softened_reason).toBeTruthy();
    const zones = items[1].plan.steps.map((s: any) => Number(s.zone) || 0);
    expect(Math.max(...zones)).toBeLessThan(4);
  });

  it("no toca sesiones en días no consecutivos", () => {
    const items = [
      { plan: hardPlan(), tss: 60, minutes: 45, ctx, date: "2026-08-31" },
      { plan: hardPlan(), tss: 60, minutes: 45, ctx, date: "2026-09-03" },
    ];
    avoidBackToBackHard(items);
    expect(items[1].plan.softened_reason).toBeFalsy();
  });
});

describe("enforceWeeklyTss", () => {
  it("recorta la semana cuando supera el objetivo", () => {
    const big = () => ({
      name: "Grande",
      steps: [
        { name: "Calentamiento", duration_type: "time", duration_seconds: 600, target: "power", target_low: 100, target_high: 140, intensity: "warmup" },
        { name: "Umbral", duration_type: "time", duration_seconds: 3600, target: "power", target_low: 230, target_high: 260, intensity: "interval" },
        { name: "Vuelta calma", duration_type: "time", duration_seconds: 600, target: "power", target_low: 90, target_high: 120, intensity: "cooldown" },
      ],
    });
    const mk = () => {
      const v = validateWorkout(big(), { ...ctx, duration_minutes: 80 });
      return { plan: v.plan, tss: v.tss, minutes: v.minutes, ctx: { ...ctx, duration_minutes: 80 } };
    };
    const items = [mk(), mk(), mk()];
    const before = items.reduce((a, i) => a + i.tss, 0);
    enforceWeeklyTss(items, 120);
    const after = items.reduce((a, i) => a + i.tss, 0);
    expect(after).toBeLessThan(before);
  });
});
