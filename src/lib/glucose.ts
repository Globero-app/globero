/** Estadísticas de glucosa con rango objetivo 70–180 mg/dL. */
export function glucoseStats(values: number[]) {
  if (!values.length) return { avg: 0, inRange: 0, low: 0, high: 0 };
  const n = values.length;
  const pct = (c: number) => Math.round((c / n) * 100);
  return {
    avg: Math.round(values.reduce((a, b) => a + b, 0) / n),
    inRange: pct(values.filter((v) => v >= 70 && v <= 180).length),
    low: pct(values.filter((v) => v < 70).length),
    high: pct(values.filter((v) => v > 180).length),
  };
}
