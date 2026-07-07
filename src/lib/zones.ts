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
