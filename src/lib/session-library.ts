/* Biblioteca de sesiones con progresión.
   Define la estructura canónica de cada objetivo fisiológico y su nivel de
   progresión, para que la IA no invente los números de las series. */

export type SessionGoal =
  | "vo2max"
  | "umbral"
  | "tempo"
  | "resistencia"
  | "neuromuscular"
  | "fuerza_resistencia"
  | "recuperacion";

export interface SessionTemplate {
  goal: SessionGoal;
  label: string;
  /** Progresión: nivel 1 = entrada, nivel 4 = máximo. */
  levels: string[];
  zone: string;
  recovery: string;
}

export const SESSION_LIBRARY: Record<SessionGoal, SessionTemplate> = {
  vo2max: {
    goal: "vo2max",
    label: "VO₂ máx",
    levels: ["4x3 min", "4x4 min", "5x4 min", "5x5 min"],
    zone: "Z5 (106-120% FTP)",
    recovery: "recuperación igual al tiempo de trabajo en Z1",
  },
  umbral: {
    goal: "umbral",
    label: "Umbral",
    levels: ["3x8 min", "3x10 min", "4x10 min", "3x15 min"],
    zone: "Z4 (91-105% FTP)",
    recovery: "5 min en Z1-Z2 entre series",
  },
  tempo: {
    goal: "tempo",
    label: "Tempo",
    levels: ["2x15 min", "2x20 min", "3x20 min", "2x30 min"],
    zone: "Z3 (76-90% FTP)",
    recovery: "5 min en Z2 entre bloques",
  },
  resistencia: {
    goal: "resistencia",
    label: "Resistencia aeróbica",
    levels: ["continuo Z2", "Z2 + 2x10 min tempo", "Z2 + 3x12 min tempo", "Z2 + 3x15 min tempo al final"],
    zone: "Z2 (56-75% FTP)",
    recovery: "sin recuperaciones específicas",
  },
  neuromuscular: {
    goal: "neuromuscular",
    label: "Neuromuscular",
    levels: ["6x10 s", "8x10 s", "8x15 s", "10x15 s"],
    zone: "Z7 (máximo, sprint)",
    recovery: "3-5 min completos entre sprints",
  },
  fuerza_resistencia: {
    goal: "fuerza_resistencia",
    label: "Fuerza-resistencia",
    levels: ["3x6 min a 50-60 rpm", "4x6 min a 50-60 rpm", "4x8 min a 50-60 rpm", "5x8 min a 50-60 rpm"],
    zone: "Z3-Z4 con cadencia 50-60 rpm",
    recovery: "4 min en Z1-Z2 con cadencia libre",
  },
  recuperacion: {
    goal: "recuperacion",
    label: "Recuperación",
    levels: ["30-45 min Z1", "45 min Z1", "45-60 min Z1-Z2 suave", "60 min Z1-Z2 suave"],
    zone: "Z1 (<56% FTP)",
    recovery: "sin intensidad",
  },
};

/** Nivel de progresión 1-4 a partir de cuántas veces se ha completado ese objetivo. */
export function progressionLevel(completedOfGoal: number): number {
  if (completedOfGoal <= 1) return 1;
  if (completedOfGoal <= 3) return 2;
  if (completedOfGoal <= 6) return 3;
  return 4;
}

/** Bloque de prompt con las sesiones disponibles y el nivel que le toca a cada una. */
export function libraryPromptBlock(levels: Partial<Record<SessionGoal, number>>): string {
  const rows = (Object.keys(SESSION_LIBRARY) as SessionGoal[]).map((g) => {
    const t = SESSION_LIBRARY[g];
    const lvl = Math.min(4, Math.max(1, levels[g] ?? 1));
    return `- ${t.label} (${g}): estructura OBLIGATORIA "${t.levels[lvl - 1]}" en ${t.zone}, ${t.recovery}. [nivel ${lvl}/4]`;
  });
  return `
BIBLIOTECA DE SESIONES (progresión personal del ciclista):
${rows.join("\n")}
REGLAS DE LA BIBLIOTECA:
- Elige para cada sesión UNO de estos objetivos (session_goal) y respeta EXACTAMENTE la estructura del nivel indicado (nº de series y duración). No inventes otras combinaciones.
- Puedes adaptar el calentamiento, la vuelta a la calma y los rodajes intermedios para cuadrar la duración objetivo.
- No repitas el mismo objetivo dos días consecutivos.`;
}
