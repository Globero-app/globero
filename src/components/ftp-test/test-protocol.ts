import type { FitWorkoutStep } from "@/lib/fit-writer";
import type { ZwoStep } from "@/lib/zwo-writer";

export interface Phase { key: string; label: string; seconds: number; instruction: string; targetPctFtp?: [number, number]; }

export const PHASES: Phase[] = [
  { key: "wu1", label: "Calentamiento suave", seconds: 10 * 60, instruction: "Rueda en Z1-Z2, cadencia 85-95 rpm. Objetivo: subir pulso progresivamente.", targetPctFtp: [45, 65] },
  { key: "wu2", label: "3 aceleraciones", seconds: 6 * 60, instruction: "3 x 1 min alta cadencia (100-110 rpm) + 1 min suave entre cada una.", targetPctFtp: [70, 90] },
  { key: "wu3", label: "Rodaje suave", seconds: 5 * 60, instruction: "Baja pulso rodando en Z1 antes del bloque duro.", targetPctFtp: [45, 60] },
  { key: "effort", label: "★ 20 min ALL-OUT", seconds: 20 * 60, instruction: "Da el máximo SOSTENIBLE 20 min. Al terminar apuntarás la potencia media (o FC media si no tienes potenciómetro).", targetPctFtp: [95, 110] },
  { key: "cd", label: "Vuelta a la calma", seconds: 10 * 60, instruction: "Z1 muy suave. Respira, hidrátate.", targetPctFtp: [40, 55] },
];

export function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Construye los pasos del test FTP como bloque estándar de entrenamiento. */
export function buildTestSteps(referenceFtp: number): Array<ZwoStep & FitWorkoutStep & { intensity: any }> {
  const steps: Array<any> = [];
  const pct = (p: number) => Math.round((p / 100) * referenceFtp);

  steps.push({
    name: "Calentamiento",
    description: "Z1-Z2, cadencia 85-95 rpm",
    duration_type: "time", duration_seconds: 10 * 60, duration_value: 10 * 60,
    target: "power", target_low: pct(45), target_high: pct(65),
    intensity: "warmup",
  });
  for (let i = 0; i < 3; i++) {
    steps.push({
      name: `Acel ${i + 1}`,
      description: "Alta cadencia 100-110 rpm",
      duration_type: "time", duration_seconds: 60, duration_value: 60,
      target: "power", target_low: pct(75), target_high: pct(90),
      intensity: "interval",
    });
    steps.push({
      name: "Recuperación",
      description: "Suave entre aceleraciones",
      duration_type: "time", duration_seconds: 60, duration_value: 60,
      target: "power", target_low: pct(50), target_high: pct(60),
      intensity: "recovery",
    });
  }
  steps.push({
    name: "Rodaje",
    description: "Baja pulso antes del all-out",
    duration_type: "time", duration_seconds: 5 * 60, duration_value: 5 * 60,
    target: "power", target_low: pct(45), target_high: pct(60),
    intensity: "active",
  });
  steps.push({
    name: "FTP 20 min",
    description: "Máximo sostenible 20 min",
    duration_type: "time", duration_seconds: 20 * 60, duration_value: 20 * 60,
    target: "power", target_low: pct(95), target_high: pct(105),
    intensity: "interval",
  });
  steps.push({
    name: "Vuelta calma",
    description: "Z1 muy suave",
    duration_type: "time", duration_seconds: 10 * 60, duration_value: 10 * 60,
    target: "power", target_low: pct(40), target_high: pct(55),
    intensity: "cooldown",
  });
  return steps;
}
