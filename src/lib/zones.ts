/** Zonas de potencia Coggan a partir del FTP (vatios). */
export interface PowerZone {
  id: number;
  key: string;
  label: string;
  low: number;
  high: number;
  pctLow: number;
  pctHigh: number;
  focus: string;
  color: string;
}

const ZONES: Array<Omit<PowerZone, "low" | "high"> & { pctLow: number; pctHigh: number }> = [
  { id: 1, key: "z1", label: "Z1 · Recuperación",   pctLow: 0,    pctHigh: 55,  focus: "Rodaje muy suave, regeneración", color: "#94a3b8" },
  { id: 2, key: "z2", label: "Z2 · Resistencia",    pctLow: 56,   pctHigh: 75,  focus: "Base aeróbica larga",             color: "#22c55e" },
  { id: 3, key: "z3", label: "Z3 · Tempo",          pctLow: 76,   pctHigh: 90,  focus: "Ritmo sostenido",                  color: "#eab308" },
  { id: 4, key: "z4", label: "Z4 · Umbral (FTP)",   pctLow: 91,   pctHigh: 105, focus: "Series al FTP, contrarreloj",     color: "#f97316" },
  { id: 5, key: "z5", label: "Z5 · VO₂ máx",        pctLow: 106,  pctHigh: 120, focus: "Intervalos 3-8 min",              color: "#ef4444" },
  { id: 6, key: "z6", label: "Z6 · Anaeróbico",     pctLow: 121,  pctHigh: 150, focus: "Intervalos 30 s - 3 min",         color: "#a855f7" },
  { id: 7, key: "z7", label: "Z7 · Neuromuscular",  pctLow: 151,  pctHigh: 999, focus: "Sprints < 30 s",                   color: "#0ea5e9" },
];

export function computePowerZones(ftp: number | null | undefined): PowerZone[] | null {
  if (!ftp || ftp <= 0) return null;
  return ZONES.map((z) => ({
    ...z,
    low: Math.round((z.pctLow / 100) * ftp),
    high: z.pctHigh >= 999 ? Infinity : Math.round((z.pctHigh / 100) * ftp),
  }));
}

/** FTP estimado a partir de una prueba de 20 min all-out (Coggan): 95% del promedio. */
export function ftpFrom20Min(avgWatts: number): number {
  return Math.round(avgWatts * 0.95);
}

/** FTP estimado a partir de un ramp test: 75% del último minuto MAP (potencia máxima aeróbica). */
export function ftpFromRampMAP(mapWatts: number): number {
  return Math.round(mapWatts * 0.75);
}

/**
 * Zonas de frecuencia cardíaca (Friel) a partir del LTHR (Umbral de FC).
 * Si no hay LTHR pero sí FC máx, se estima LTHR ≈ 92% de FCmáx.
 */
const HR_ZONES: Array<Omit<PowerZone, "low" | "high">> = [
  { id: 1, key: "z1", label: "Z1 · Recuperación", pctLow: 0,   pctHigh: 81,  focus: "Rodaje muy suave, regeneración", color: "#94a3b8" },
  { id: 2, key: "z2", label: "Z2 · Resistencia",  pctLow: 82,  pctHigh: 88,  focus: "Base aeróbica larga",             color: "#22c55e" },
  { id: 3, key: "z3", label: "Z3 · Tempo",        pctLow: 89,  pctHigh: 93,  focus: "Ritmo sostenido",                  color: "#eab308" },
  { id: 4, key: "z4", label: "Z4 · Umbral",       pctLow: 94,  pctHigh: 99,  focus: "Series al umbral",                 color: "#f97316" },
  { id: 5, key: "z5a", label: "Z5a · VO₂ (bajo)", pctLow: 100, pctHigh: 102, focus: "Intervalos largos VO₂",            color: "#ef4444" },
  { id: 6, key: "z5b", label: "Z5b · VO₂ (alto)", pctLow: 103, pctHigh: 106, focus: "Intervalos cortos VO₂",            color: "#a855f7" },
  { id: 7, key: "z5c", label: "Z5c · Máxima",     pctLow: 107, pctHigh: 999, focus: "Esfuerzos máximos",                color: "#0ea5e9" },
];

export function computeHrZones(lthr: number | null | undefined, maxHr?: number | null): PowerZone[] | null {
  let ref = lthr && lthr > 0 ? lthr : null;
  if (!ref && maxHr && maxHr > 0) ref = Math.round(maxHr * 0.92);
  if (!ref) return null;
  return HR_ZONES.map((z) => ({
    ...z,
    low: Math.round((z.pctLow / 100) * ref!),
    high: z.pctHigh >= 999 ? Infinity : Math.round((z.pctHigh / 100) * ref!),
  }));
}

/** LTHR estimado a partir de la FC media de los 20 min del test FTP (Friel): ~95%. */
export function lthrFrom20Min(avgHr: number): number {
  return Math.round(avgHr * 0.95);
}

/** Referencias del ciclista para traducir objetivos a zonas. */
export interface ZoneRefsClient { ftp?: number | null; lthr?: number | null; maxHr?: number | null }

export interface StepZoneInfo {
  zone: PowerZone;
  pctLow: number;
  pctHigh: number;
  refLabel: string;
  refValue: number;
  explanation: string;
}

/**
 * Traduce el objetivo de un bloque (vatios o ppm) a su zona y explica
 * qué se entrena en ella y por qué está en la sesión.
 */
export function describeStepZone(step: any, refs: ZoneRefsClient): StepZoneInfo | null {
  const low = Number(step?.target_low) || 0;
  const high = Number(step?.target_high) || low;
  if (!low) return null;
  const mid = (low + high) / 2;

  if (step?.target === "power") {
    const ftp = refs.ftp && refs.ftp > 0 ? refs.ftp : null;
    if (!ftp) return null;
    const zones = computePowerZones(ftp)!;
    const pct = (mid / ftp) * 100;
    const zone = zones.find((z) => pct >= z.pctLow && pct <= z.pctHigh) ?? zones[zones.length - 1]!;
    return {
      zone,
      pctLow: Math.round((low / ftp) * 100),
      pctHigh: Math.round((high / ftp) * 100),
      refLabel: "FTP",
      refValue: ftp,
      explanation: `${zone.label}: ${zone.focus}. ${Math.round((low / ftp) * 100)}-${Math.round((high / ftp) * 100)}% de tu FTP (${ftp} W).`,
    };
  }

  if (step?.target === "hr") {
    const ref = refs.lthr && refs.lthr > 0 ? refs.lthr : refs.maxHr && refs.maxHr > 0 ? Math.round(refs.maxHr * 0.92) : null;
    if (!ref) return null;
    const zones = computeHrZones(ref)!;
    const pct = (mid / ref) * 100;
    const zone = zones.find((z) => pct >= z.pctLow && pct <= z.pctHigh) ?? zones[zones.length - 1]!;
    return {
      zone,
      pctLow: Math.round((low / ref) * 100),
      pctHigh: Math.round((high / ref) * 100),
      refLabel: "LTHR",
      refValue: ref,
      explanation: `${zone.label}: ${zone.focus}. ${Math.round((low / ref) * 100)}-${Math.round((high / ref) * 100)}% de tu LTHR (${ref} ppm).`,
    };
  }
  return null;
}
