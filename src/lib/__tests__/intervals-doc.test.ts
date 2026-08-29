import { describe, it, expect } from "vitest";
import { buildWorkoutDoc, hrRangeToLthrPct } from "@/lib/intervals.server";

const refs = { ftp: 250, lthr: 160, maxHr: 185 };

const step = (extra: any) => ({
  name: "Calentamiento",
  duration_type: "time",
  duration_seconds: 600,
  target: "power",
  target_low: 138,
  target_high: 188,
  intensity: "warmup",
  ...extra,
});

describe("buildWorkoutDoc", () => {
  it("exterior con potencia: porcentaje sobre FTP", () => {
    const doc = buildWorkoutDoc({ steps: [step({})] }, "power", refs);
    expect(doc).toContain("10m 55-75% Calentamiento");
  });

  it("rodillo con FTP: % como objetivo y vatios entre paréntesis, sin (0-0w)", () => {
    const doc = buildWorkoutDoc({ indoor: true, steps: [step({})] }, "power", refs);
    expect(doc).toContain("10m 55-75% (138-188w) Calentamiento");
    expect(doc).not.toContain("(0-0");
  });

  it("rodillo: elimina tokens de zona del nombre", () => {
    const doc = buildWorkoutDoc({ indoor: true, steps: [step({ name: "Z2 Rodaje" })] }, "power", refs);
    expect(doc).not.toMatch(/\bZ2\b/);
    expect(doc).toContain("Rodaje");
  });

  it("pasos de FC: rango en % LTHR", () => {
    const doc = buildWorkoutDoc(
      { steps: [step({ name: "Umbral", target: "hr", target_low: 150, target_high: 158 })] },
      "hr",
      refs,
    );
    expect(doc).toContain("% LTHR");
    expect(doc).not.toContain("bpm");
  });

  it("cadencia usa rpm", () => {
    const doc = buildWorkoutDoc(
      { steps: [step({ target: "cadence", target_low: 90, target_high: 90 })] },
      "power",
      refs,
    );
    expect(doc).toContain("90rpm");
  });
});

describe("hrRangeToLthrPct", () => {
  it("convierte bpm absolutos a % LTHR", () => {
    expect(hrRangeToLthrPct({ target_low: 160, target_high: 160 }, refs)).toEqual({ low: 100, high: 100 });
  });

  it("resuelve zonas sin valores numéricos", () => {
    expect(hrRangeToLthrPct({ name: "Z2", target_low: 0, target_high: 0 }, refs)).toEqual({ low: 82, high: 88 });
  });

  it("sin referencia de FC devuelve null", () => {
    expect(hrRangeToLthrPct({ target_low: 150 }, { ftp: 250, lthr: null, maxHr: null })).toBeNull();
  });
});
