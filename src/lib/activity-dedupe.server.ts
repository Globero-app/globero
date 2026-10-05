/** Deduplicación por huella física: inicio ±2 min y duración coincidente (±2 min o 3%).
 *  Copias de Wahoo con hora desfasada: mismo día y duración casi idéntica (±30 s) dentro de ±13 h. */

const START_TOL = 2 * 60_000;
const SHIFT_TOL = 13 * 3600_000;

function sameDuration(a: number, b: number) {
  if (!a || !b) return false;
  return Math.abs(a - b) <= Math.max(120, Math.max(a, b) * 0.03);
}

function madridDay(ts: number) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

export function isSameActivity(a: any, b: any) {
  if (!a?.start_date || !b?.start_date) return false;
  const ta = new Date(a.start_date).getTime();
  const tb = new Date(b.start_date).getTime();
  const da = Number(a.moving_time) || 0;
  const db = Number(b.moving_time) || 0;
  const diff = Math.abs(ta - tb);
  if (diff <= START_TOL && sameDuration(da, db)) return true;
  // Copia con marca horaria desfasada (p. ej. Wahoo ~12 h): mismo día y duración casi exacta
  return diff <= SHIFT_TOL && da > 600 && db > 0 && Math.abs(da - db) <= 30 && madridDay(ta) === madridDay(tb);
}

/** Quita filas que ya existen (con otro id) para el usuario o repetidas dentro del lote. */
export async function filterDuplicateActivities(supabase: any, userId: string, rows: any[]): Promise<any[]> {
  const valid = rows.filter((r) => r?.start_date);
  if (!valid.length) return rows;
  const times = valid.map((r) => new Date(r.start_date).getTime());
  const from = new Date(Math.min(...times) - SHIFT_TOL).toISOString();
  const to = new Date(Math.max(...times) + SHIFT_TOL).toISOString();
  const { data } = await supabase
    .from("intervals_activities")
    .select("id, start_date, moving_time")
    .eq("user_id", userId)
    .gte("start_date", from)
    .lte("start_date", to);
  const kept: any[] = [...((data ?? []) as any[])];
  const out: any[] = [];
  for (const r of rows) {
    const dup = kept.find((k) => String(k.id) !== String(r.id) && isSameActivity(k, r));
    if (dup) continue;
    kept.push(r);
    out.push(r);
  }
  return out;
}
