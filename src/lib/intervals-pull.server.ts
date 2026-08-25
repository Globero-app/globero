/** Lectura inversa desde Intervals.icu: fechas movidas, eventos borrados y sesiones completadas. */

import type { IntervalsCreds } from "./intervals.server";

const BASE = "https://intervals.icu/api/v1";

function athletePath(athleteId: string) {
  return athleteId.startsWith("i") ? athleteId : `i${athleteId}`;
}

async function get(creds: IntervalsCreds, path: string) {
  const token = Buffer.from(`API_KEY:${creds.apiKey}`).toString("base64");
  const res = await fetch(`${BASE}/athlete/${athletePath(creds.athleteId)}${path}`, {
    headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Intervals.icu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Eventos del calendario entre dos fechas (YYYY-MM-DD) */
export async function intervalsListEvents(creds: IntervalsCreds, oldest: string, newest: string): Promise<any[]> {
  const res = await get(creds, `/events?oldest=${oldest}&newest=${newest}`);
  return Array.isArray(res) ? res : [];
}

function isoDaysFrom(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ReconcileResult = { moved: number; removed: number; completed: number };

/**
 * Sincroniza los cambios hechos en Intervals.icu hacia la app.
 * Anti-bucle: al aplicar un cambio recibido se guarda `plan.intervals_synced_at`
 * para no reescribir el evento en Intervals justo después.
 */
export async function reconcileIntervalsEvents(
  supabase: any,
  userId: string,
  creds: IntervalsCreds,
): Promise<ReconcileResult> {
  const out: ReconcileResult = { moved: 0, removed: 0, completed: 0 };

  const oldest = isoDaysFrom(-14);
  const newest = isoDaysFrom(60);
  const today = new Date().toISOString().slice(0, 10);

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, plan, status, duration_minutes, planned_tss")
    .eq("user_id", userId)
    .eq("status", "pending");

  const linked = (workouts ?? []).filter((w: any) => w?.plan?.intervals_event_id);
  if (!linked.length) return out;

  let events: any[] = [];
  try {
    events = await intervalsListEvents(creds, oldest, newest);
  } catch (e) {
    console.error("intervals events list", e);
    return out;
  }
  const byId = new Map<string, any>();
  for (const ev of events) byId.set(String(ev?.id ?? ""), ev);

  // Actividades reales del rango, para detectar sesiones ejecutadas
  let activities: any[] = [];
  try {
    const { intervalsListActivities } = await import("./intervals.server");
    activities = await intervalsListActivities(creds, oldest);
  } catch (e) {
    console.error("intervals activities list", e);
  }
  const actByDate = new Map<string, any>();
  for (const a of activities) {
    const d = String(a?.start_date_local ?? "").slice(0, 10);
    if (d && !actByDate.has(d)) actByDate.set(d, a);
  }

  const nowIso = new Date().toISOString();

  for (const w of linked) {
    const plan = w.plan ?? {};
    const eventId = String(plan.intervals_event_id);
    const ev = byId.get(eventId);
    const planDate: string | null = plan.scheduled_date ?? null;

    // 1) Evento borrado en Intervals -> se desvincula
    if (!ev) {
      if (planDate && planDate < oldest) continue; // fuera del rango consultado
      await supabase
        .from("workouts")
        .update({ plan: { ...plan, intervals_event_id: null, intervals_unlinked_at: nowIso, intervals_synced_at: nowIso } })
        .eq("id", w.id)
        .eq("user_id", userId);
      out.removed++;
      continue;
    }

    // 2) Fecha movida en Intervals -> se actualiza en la app
    const evDate = String(ev.start_date_local ?? "").slice(0, 10);
    let currentPlan = plan;
    if (evDate && planDate && evDate !== planDate) {
      currentPlan = { ...plan, scheduled_date: evDate, intervals_synced_at: nowIso };
      await supabase.from("workouts").update({ plan: currentPlan }).eq("id", w.id).eq("user_id", userId);
      out.moved++;
    }

    // 3) Sesión ejecutada -> completado con TSS/IF reales
    const doneDate = currentPlan.scheduled_date ?? evDate;
    if (!doneDate || doneDate > today) continue;
    const act = ev.paired_activity_id
      ? activities.find((a: any) => String(a?.id) === String(ev.paired_activity_id))
      : actByDate.get(doneDate);
    if (!act) continue;

    const actualTss = Number(act.icu_training_load ?? act.training_load ?? 0) || null;
    const actualIf = Number(act.icu_intensity ?? 0) || null;
    const planned = Number(w.planned_tss ?? currentPlan.estimated_tss ?? 0) || null;
    const compliance = planned && actualTss ? Math.round((actualTss / planned) * 100) / 100 : null;

    await supabase
      .from("workouts")
      .update({
        status: "completed",
        completed_at: act.start_date_local ? new Date(act.start_date_local).toISOString() : nowIso,
        actual_tss: actualTss,
        actual_if: actualIf,
        compliance,
        plan: { ...currentPlan, intervals_activity_id: String(act.id ?? ""), intervals_synced_at: nowIso },
      })
      .eq("id", w.id)
      .eq("user_id", userId);
    out.completed++;
  }

  return out;
}
