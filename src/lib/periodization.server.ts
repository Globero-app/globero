/* Periodización por bloques: Base → Construcción → Pico → Tapering,
   con sobrecarga progresiva dentro del bloque y semana de descarga.
   Solo servidor. */

import { weekStart, isoDate } from "./training-load.server";

export type BlockFocus = "base" | "construccion" | "pico" | "tapering" | "transicion";

export interface Periodization {
  focus: BlockFocus;
  week_index: number;
  block_length: number;
  is_deload: boolean;
  block_start: string;
  progression_factor: number;
  weeks_to_race: number | null;
  prompt_block: string;
}

const WEEK = 7 * 86400000;

export const BLOCK_LENGTH: Record<BlockFocus, number> = {
  base: 4,
  construccion: 4,
  pico: 3,
  tapering: 2,
  transicion: 1,
};

const NEXT_FOCUS: Record<BlockFocus, BlockFocus> = {
  base: "construccion",
  construccion: "pico",
  pico: "transicion",
  transicion: "base",
  tapering: "transicion",
};

const FOCUS_DESC: Record<BlockFocus, string> = {
  base: "volumen aeróbico, fuerza específica a baja cadencia y tempo suave; poca intensidad alta",
  construccion: "trabajo de umbral (Z4) y tempo (Z3) con volumen sostenido; el grueso del estímulo específico",
  pico: "VO₂ máx (Z5), intensidad específica de competición y menos volumen total",
  tapering: "volumen muy bajo manteniendo pinceladas cortas de intensidad para llegar fresco",
  transicion: "semana de transición: recuperación activa y trabajo aeróbico ligero antes del siguiente bloque",
};

/** Sobrecarga progresiva dentro del bloque (multiplicador sobre la media de 3 semanas). */
function progressionFactor(focus: BlockFocus, weekIndex: number, length: number): number {
  if (focus === "tapering") return weekIndex >= length ? 0.5 : 0.7;
  if (focus === "transicion") return 0.6;
  if (weekIndex >= length && focus !== "pico") return 0.62; // descarga
  if (focus === "pico") return [1.0, 1.06, 0.8][Math.min(weekIndex, length) - 1] ?? 1.0;
  return Math.min(1.16, 1 + 0.06 * (weekIndex - 1));
}

function addWeeks(dateISO: string, weeks: number): string {
  return isoDate(new Date(new Date(`${dateISO}T12:00:00Z`).getTime() + weeks * WEEK));
}

function diffWeeks(fromISO: string, toISO: string): number {
  return Math.round((new Date(`${toISO}T12:00:00Z`).getTime() - new Date(`${fromISO}T12:00:00Z`).getTime()) / WEEK);
}

/** Fase anclada a la fecha de competición. */
function raceAnchored(weeksToRace: number): { focus: BlockFocus; week_index: number } {
  if (weeksToRace <= 1) return { focus: "tapering", week_index: Math.min(2, 2 - weeksToRace) || 1 };
  if (weeksToRace <= 4) return { focus: "pico", week_index: 5 - weeksToRace };
  if (weeksToRace <= 8) return { focus: "construccion", week_index: 9 - weeksToRace };
  const rest = (weeksToRace - 9) % 4;
  return { focus: "base", week_index: 4 - rest };
}

export function resolvePeriodization(opts: {
  plan_week_start: string;
  last_block: { focus?: string | null; start_date?: string | null; week_index?: number | null } | null;
  competition_date?: string | null;
}): Periodization {
  const planWeek = weekStart(opts.plan_week_start);
  let focus: BlockFocus;
  let weekIndex: number;
  let weeksToRace: number | null = null;

  if (opts.competition_date) {
    weeksToRace = Math.max(0, diffWeeks(planWeek, weekStart(opts.competition_date)));
    const a = raceAnchored(weeksToRace);
    focus = a.focus;
    weekIndex = Math.max(1, Math.min(BLOCK_LENGTH[a.focus], a.week_index));
  } else {
    const prevFocus = (opts.last_block?.focus as BlockFocus) ?? null;
    const prevStart = opts.last_block?.start_date ? weekStart(String(opts.last_block.start_date)) : null;
    if (prevFocus && prevStart && BLOCK_LENGTH[prevFocus]) {
      const elapsed = diffWeeks(prevStart, planWeek); // 0 = misma semana del inicio del bloque
      if (elapsed < 0) {
        focus = prevFocus;
        weekIndex = 1;
      } else if (elapsed < BLOCK_LENGTH[prevFocus]) {
        focus = prevFocus;
        weekIndex = elapsed + 1;
      } else {
        // bloque terminado (aunque haya semanas sin generar): avanza de fase
        let f = NEXT_FOCUS[prevFocus];
        let remaining = elapsed - BLOCK_LENGTH[prevFocus];
        while (remaining >= BLOCK_LENGTH[f]) {
          remaining -= BLOCK_LENGTH[f];
          f = NEXT_FOCUS[f];
        }
        focus = f;
        weekIndex = remaining + 1;
      }
    } else {
      focus = "base";
      weekIndex = 1;
    }
  }

  const length = BLOCK_LENGTH[focus];
  const isDeload = focus === "transicion" || (focus !== "pico" && focus !== "tapering" && weekIndex >= length);
  const blockStart = addWeeks(planWeek, -(weekIndex - 1));
  const factor = progressionFactor(focus, weekIndex, length);

  const prompt_block = `
PERIODIZACIÓN (macrociclo, decidido por el sistema — no la cambies):
- Fase actual: ${focus.toUpperCase()} · semana ${weekIndex} de ${length}${isDeload ? " → SEMANA DE DESCARGA" : ""}.
- Objetivo de la fase: ${FOCUS_DESC[focus]}.
- Sobrecarga progresiva: esta semana debe suponer aproximadamente un ${Math.round((factor - 1) * 100)}% respecto a la carga media de las 3 semanas previas.${
    isDeload
      ? "\n- SEMANA DE DESCARGA: reduce volumen e intensidad, máximo una sesión de calidad corta, el resto Z1-Z2."
      : `\n- Progresión dentro del bloque: cada semana sube ligeramente volumen o densidad de intervalos respecto a la anterior (semana ${weekIndex} de ${length}).`
  }
- Prioridad de intensidades en esta fase: ${
    focus === "base"
      ? "Z2 dominante, fuerza a baja cadencia, algún bloque de tempo"
      : focus === "construccion"
        ? "Z3-Z4 (tempo y umbral) como estímulo principal, Z2 de base"
        : focus === "pico"
          ? "Z5 (VO₂ máx) e intervalos específicos de competición, volumen reducido"
          : focus === "tapering"
            ? "volumen mínimo, aceleraciones y bloques cortos a ritmo de carrera"
            : "Z1-Z2 exclusivamente, recuperación activa"
  }.${weeksToRace !== null ? `\n- Faltan ${weeksToRace} semana(s) para la competición objetivo.` : ""}`;

  return {
    focus,
    week_index: weekIndex,
    block_length: length,
    is_deload: isDeload,
    block_start: blockStart,
    progression_factor: factor,
    weeks_to_race: weeksToRace,
    prompt_block,
  };
}
