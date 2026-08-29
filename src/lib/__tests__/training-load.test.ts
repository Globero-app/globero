import { describe, it, expect } from "vitest";
import {
  weekStart,
  estimateActivityTss,
  estimatePlanTss,
  computeCtlAtl,
  prescribeWeek,
  type TrainingLoadSummary,
} from "@/lib/training-load.server";

describe("weekStart", () => {
  it("devuelve el lunes de la semana", () => {
    expect(weekStart("2026-08-29")).toBe("2026-08-24"); // sábado -> lunes
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
    expect(weekStart("2026-08-30")).toBe("2026-08-24"); // domingo -> lunes previo
  });
});

describe("estimateActivityTss", () => {
  it("prioriza la carga real de Intervals.icu", () => {
    expect(estimateActivityTss({ icu_training_load: 87, moving_time: 3600 }, 250, null, null)).toBe(87);
  });

  it("estima por potencia cuando hay FTP", () => {
    // 1h a 250W con FTP 250 => IF 1.0 => 100 TSS
    expect(estimateActivityTss({ moving_time: 3600, average_watts: 250 }, 250, null, null)).toBe(100);
  });

  it("estima por FC cuando no hay potencia", () => {
    // 1h a LTHR => ~100 TSS
    expect(estimateActivityTss({ moving_time: 3600, average_heartrate: 160 }, null, 160, null)).toBe(100);
  });

  it("usa el fallback de 50 TSS/h sin datos", () => {
    expect(estimateActivityTss({ moving_time: 7200 }, null, null, null)).toBe(100);
  });

  it("devuelve 0 sin duración", () => {
    expect(estimateActivityTss({ moving_time: 0 }, 250, null, null)).toBe(0);
  });
});

describe("estimatePlanTss", () => {
  it("calcula el TSS desde los steps por potencia", () => {
    const plan = {
      steps: [
        { duration_seconds: 3600, target: "power", target_low: 250, target_high: 250 },
      ],
    };
    expect(estimatePlanTss(plan, 250, null, null)).toBe(100);
  });

  it("usa el fallback por minutos si no hay steps", () => {
    expect(estimatePlanTss({ steps: [] }, 250, null, null, 60)).toBe(55);
  });

  it("limita intensidades absurdas", () => {
    const plan = { steps: [{ duration_seconds: 3600, target: "power", target_low: 2000, target_high: 2000 }] };
    // cap a IF 1.6 => 256
    expect(estimatePlanTss(plan, 250, null, null)).toBe(256);
  });
});

describe("computeCtlAtl", () => {
  it("con carga constante ATL converge por encima de CTL", () => {
    const daily = [] as Array<{ date: string; tss: number }>;
    for (let i = 0; i < 90; i++) {
      const d = new Date(Date.UTC(2026, 5, 1) + i * 86400000).toISOString().slice(0, 10);
      daily.push({ date: d, tss: 50 });
    }
    const { ctl, atl } = computeCtlAtl(daily, "2026-08-29");
    expect(atl).toBeGreaterThan(ctl);
    expect(ctl).toBeGreaterThan(0);
  });

  it("sin datos devuelve 0", () => {
    expect(computeCtlAtl([], "2026-08-29")).toEqual({ ctl: 0, atl: 0 });
  });
});

function load(partial: Partial<TrainingLoadSummary>): TrainingLoadSummary {
  return {
    ctl: 50, atl: 50, tsb: 0, weekly: [], ramp_pct: null,
    avg_weekly_tss_3w: 300, adherence_pct: 90, planned_28d: 12, completed_28d: 11,
    avg_rpe: 3, readiness_7d: 3.5, readiness_14d: 3.5, readiness_trend: "flat", daily: [],
    ...partial,
  };
}

describe("prescribeWeek", () => {
  const opts = { sessions: 3, duration_minutes: 90 };

  it("entra en recuperación con TSB muy negativo", () => {
    const w = prescribeWeek(load({ tsb: -30 }), opts);
    expect(w.mode).toBe("recovery");
    expect(w.hard_sessions_max).toBe(1);
    expect(w.target_tss).toBeLessThan(300);
  });

  it("descarga en la semana 4 del bloque", () => {
    const w = prescribeWeek(load({}), { ...opts, block_week_index: 4 });
    expect(w.mode).toBe("recovery");
    expect(w.reason).toContain("descarga");
  });

  it("sobrecarga si está fresco y con readiness alto", () => {
    const w = prescribeWeek(load({ tsb: 15, readiness_7d: 4.5 }), opts);
    expect(w.mode).toBe("overload");
    expect(w.target_tss).toBeGreaterThan(300);
  });

  it("mantiene si el RPE medio es alto", () => {
    const w = prescribeWeek(load({ avg_rpe: 4.5 }), opts);
    expect(w.mode).toBe("maintain");
  });

  it("nunca baja de 40 TSS", () => {
    const w = prescribeWeek(load({ avg_weekly_tss_3w: 0, tsb: -40 }), { sessions: 1, duration_minutes: 20 });
    expect(w.target_tss).toBeGreaterThanOrEqual(40);
  });
});
