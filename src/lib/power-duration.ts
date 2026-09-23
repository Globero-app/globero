/* Modelo potencia-duración (PD Curve): ajuste de CP (potencia crítica), W' y FRC.
   Puro, sin dependencias: usable en servidor y cliente. */

export type CurvePoint = { seconds: number; watts: number };

export interface PdModel {
  /** Potencia crítica en vatios */
  cp: number | null;
  /** Capacidad de trabajo por encima de CP, en kJ */
  w_prime_kj: number | null;
  /** Functional Reserve Capacity (energía anaeróbica útil 30 s – 3 min), en kJ */
  frc_kj: number | null;
  /** Calidad del ajuste (R²) del modelo hiperbólico */
  r2: number | null;
  /** Puntos usados en el ajuste */
  points: CurvePoint[];
}

/** Mejor punto disponible cerca de una duración (tolerancia relativa). */
function nearest(curve: CurvePoint[], seconds: number, tol = 0.2): CurvePoint | null {
  let best: CurvePoint | null = null;
  for (const p of curve) {
    if (!Number.isFinite(p.watts) || p.watts <= 0) continue;
    if (Math.abs(p.seconds - seconds) > Math.max(5, seconds * tol)) continue;
    if (!best || p.watts > best.watts) best = p;
  }
  return best;
}

/** Regresión lineal de W = CP·t + W' (modelo Monod-Scherrer sobre trabajo total). */
function linearWorkFit(points: CurvePoint[]): { cp: number; wPrime: number; r2: number } | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.seconds);
  const ys = points.map((p) => p.watts * p.seconds); // julios
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den <= 0) return null;
  const cp = num / den;
  const wPrime = my - cp * mx;
  if (!Number.isFinite(cp) || cp <= 0 || !Number.isFinite(wPrime) || wPrime <= 0) return null;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = cp * xs[i]! + wPrime;
    ssRes += (ys[i]! - pred) ** 2;
    ssTot += (ys[i]! - my) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  return { cp, wPrime, r2: r2 === null ? 0 : r2 };
}

/**
 * Ajusta el modelo PD con los mejores esfuerzos del ciclista.
 * - CP y W' a partir de esfuerzos de 3 a 20 min (rango válido del modelo de 2 parámetros).
 * - FRC a partir de la energía por encima de CP en esfuerzos cortos (30 s – 3 min).
 */
export function fitPowerDuration(curve: CurvePoint[]): PdModel {
  const empty: PdModel = { cp: null, w_prime_kj: null, frc_kj: null, r2: null, points: [] };
  if (!curve?.length) return empty;

  const targets = [180, 300, 480, 600, 720, 1200];
  const used: CurvePoint[] = [];
  for (const t of targets) {
    const p = nearest(curve, t);
    if (p && !used.some((u) => u.seconds === p.seconds)) used.push(p);
  }
  // Coherencia: la potencia debe decrecer con la duración
  used.sort((a, b) => a.seconds - b.seconds);
  const clean = used.filter((p, i) => i === 0 || p.watts < used[i - 1]!.watts);

  const fit = linearWorkFit(clean);
  if (!fit) return { ...empty, points: clean };

  const cp = Math.round(fit.cp);
  const wPrimeKj = Math.round((fit.wPrime / 1000) * 10) / 10;

  // FRC: energía media por encima de CP en esfuerzos cortos reales
  const shortPoints = [30, 60, 120, 180]
    .map((s) => nearest(curve, s, 0.25))
    .filter((p): p is CurvePoint => !!p && p.watts > cp);
  const frcValues = shortPoints.map((p) => ((p.watts - cp) * p.seconds) / 1000);
  const frc = frcValues.length ? Math.round((Math.max(...frcValues)) * 10) / 10 : null;

  return {
    cp,
    w_prime_kj: wPrimeKj,
    frc_kj: frc,
    r2: fit.r2 === null ? null : Math.round(fit.r2 * 1000) / 1000,
    points: clean,
  };
}

/** Duración estimada (s) que puede sostenerse a una potencia dada, según CP y W'. */
export function timeToExhaustion(cp: number, wPrimeKj: number, watts: number): number | null {
  if (!cp || !wPrimeKj || watts <= cp) return null;
  return Math.round((wPrimeKj * 1000) / (watts - cp));
}

/** Potencia sostenible estimada durante t segundos. */
export function predictedPower(cp: number, wPrimeKj: number, seconds: number): number | null {
  if (!cp || !wPrimeKj || seconds <= 0) return null;
  return Math.round(cp + (wPrimeKj * 1000) / seconds);
}

/** Interpretación del perfil a partir de CP, W' y FRC relativos. */
export function pdProfileLabel(cp: number | null, wPrimeKj: number | null, weightKg: number | null): string | null {
  if (!cp || !wPrimeKj) return null;
  const wkg = weightKg && weightKg > 0 ? cp / weightKg : null;
  const wPrimePerKg = weightKg && weightKg > 0 ? (wPrimeKj * 1000) / weightKg : null;
  if (wPrimePerKg !== null && wPrimePerKg >= 300) return "muy explosivo (W' alto)";
  if (wPrimePerKg !== null && wPrimePerKg <= 150) return "resistente (W' bajo, CP dominante)";
  if (wkg !== null && wkg >= 4.2) return "aeróbico fuerte";
  return "equilibrado";
}
