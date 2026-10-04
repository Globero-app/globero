/** Deduplicación por huella física: inicio ±2 min y duración coincidente (±2 min o 3%). */

const START_TOL = 2 * 60_000;

function sameDuration(a: number, b: number) {
  if (!a || !b) return false;
  return Math.abs(a - b) <= Math.max(120, Math.max(a, b) * 0.03);
}

export function isSameActivity(a: any, b: any) {
  if (!a?.start_date || !b?.start_date) return false;
  const ta = new Date(a.start_date).getTime();
  const tb = new Date(b.start_date).getTime();
  return Math.abs(ta - tb) <= START_TOL && sameDuration(Number(a.moving_time) || 0, Number(b.moving_time) || 0);
}

/** Quita filas que ya existen (con otro id) para el usuario o repetidas dentro del lote. */
export async function filterDuplicateActivities(supabase: any, userId: string, rows: any[]): Promise<any[]> {
  const valid = rows.filter((r) => r?.start_date);
  if (!valid.length) return rows;
  const times = valid.map((r) => new Date(r.start_date).getTime());
  const from = new Date(Math.min(...times) - START_TOL).toISOString();
  const to = new Date(Math.max(...times) + START_TOL).toISOString();
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
