/* Resumen gamificado tras completar un entrenamiento: récords de potencia de la
   temporada, cumplimiento del plan e insignias de progreso. Solo servidor. */

export type SeasonRecord = { seconds: number; label: string; watts: number; previous: number | null; gain: number | null };
export type Badge = { emoji: string; label: string; detail: string };
export type Gamification = {
  compliance: { percent: number | null; label: string; planned_tss: number | null; actual_tss: number | null };
  records: SeasonRecord[];
  badges: Badge[];
  totals: { completed: number; season_completed: number };
  created_at: string;
};

const DUR_LABEL: Record<number, string> = {
  5: "5 s", 15: "15 s", 30: "30 s", 60: "1 min", 300: "5 min",
  600: "10 min", 1200: "20 min", 1800: "30 min", 3600: "1 h",
};

function seasonStart(todayISO: string): string {
  return `${todayISO.slice(0, 4)}-01-01`;
}

function complianceLabel(pct: number | null): string {
  if (pct == null) return "Sin datos suficientes para medir el cumplimiento.";
  if (pct >= 95 && pct <= 110) return "Clavado: ejecutaste el entreno tal y como estaba planificado.";
  if (pct > 110) return "Te pasaste de carga respecto a lo previsto.";
  if (pct >= 80) return "Muy cerca de lo planificado.";
  if (pct >= 60) return "Te quedaste algo por debajo de lo previsto.";
  return "La sesión quedó bastante por debajo de lo planificado.";
}

/** Calcula récords de temporada, cumplimiento e insignias de una sesión completada. */
export async function buildGamification(
  supabase: any,
  userId: string,
  workoutId: string,
): Promise<Gamification | null> {
  const { data: w } = await supabase
    .from("workouts")
    .select("id,plan,planned_tss,actual_tss,compliance,duration_minutes,session_goal,completed_at")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!w) return null;

  const plan: any = w.plan ?? {};
  const activityId = plan.intervals_activity_id ?? plan.strava_activity_id ?? null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const from = seasonStart(todayISO);

  // ---- Cumplimiento ----
  const planned = Number(w.planned_tss) || null;
  const actual = Number(w.actual_tss) || null;
  let percent: number | null = w.compliance != null ? Math.round(Number(w.compliance)) : null;
  if (percent == null && planned && actual) percent = Math.round((actual / planned) * 100);

  // ---- Récords de potencia de la temporada ----
  const records: SeasonRecord[] = [];
  if (activityId) {
    const [{ data: mine }, { data: season }] = await Promise.all([
      supabase
        .from("power_peaks")
        .select("duration_seconds,watts")
        .eq("user_id", userId)
        .eq("activity_id", String(activityId)),
      supabase
        .from("power_peaks")
        .select("duration_seconds,watts,activity_id")
        .eq("user_id", userId)
        .gte("activity_date", from),
    ]);

    const prevBest = new Map<number, number>();
    for (const p of ((season ?? []) as any[])) {
      if (String(p.activity_id) === String(activityId)) continue;
      const d = Number(p.duration_seconds);
      const v = Number(p.watts);
      if (!Number.isFinite(d) || !Number.isFinite(v)) continue;
      if (!prevBest.has(d) || v > (prevBest.get(d) as number)) prevBest.set(d, v);
    }

    for (const p of ((mine ?? []) as any[])) {
      const d = Number(p.duration_seconds);
      const v = Number(p.watts);
      if (!DUR_LABEL[d] || !Number.isFinite(v)) continue;
      const prev = prevBest.get(d) ?? null;
      if (prev == null || v > prev) {
        records.push({
          seconds: d,
          label: DUR_LABEL[d],
          watts: Math.round(v),
          previous: prev != null ? Math.round(prev) : null,
          gain: prev != null ? Math.round(v - prev) : null,
        });
      }
    }
    records.sort((a, b) => a.seconds - b.seconds);
  }

  // ---- Totales e insignias ----
  const [{ count: totalCompleted }, { count: seasonCompleted }] = await Promise.all([
    supabase.from("workouts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", `${from}T00:00:00Z`),
  ]);
  const completed = Number(totalCompleted ?? 0);
  const seasonDone = Number(seasonCompleted ?? 0);

  let act: any = null;
  if (activityId) {
    const { data } = await supabase
      .from("intervals_activities")
      .select("distance,total_elevation_gain,moving_time,average_watts")
      .eq("id", String(activityId))
      .eq("user_id", userId)
      .maybeSingle();
    act = data;
  }

  const badges: Badge[] = [];
  if (records.length) {
    badges.push({
      emoji: "🏆",
      label: records.length === 1 ? "Récord de temporada" : `${records.length} récords de temporada`,
      detail: records.map((r) => `${r.label}: ${r.watts} W${r.gain ? ` (+${r.gain} W)` : ""}`).join(" · "),
    });
  }
  if (percent != null && percent >= 95 && percent <= 110) {
    badges.push({ emoji: "🎯", label: "Sesión clavada", detail: `Cumplimiento del ${percent}% respecto al plan.` });
  }
  if (completed === 1) badges.push({ emoji: "🚴", label: "Primera sesión", detail: "Has completado tu primer entrenamiento con la app." });
  for (const m of [10, 25, 50, 100, 200]) {
    if (completed === m) badges.push({ emoji: "🎖️", label: `${m} entrenos completados`, detail: "Constancia de la buena." });
  }
  const km = Number(act?.distance ?? 0) / 1000;
  if (km >= 100) badges.push({ emoji: "💯", label: "Centenario", detail: `${km.toFixed(0)} km en una sola salida.` });
  const elev = Number(act?.total_elevation_gain ?? 0);
  if (elev >= 1000) badges.push({ emoji: "⛰️", label: "Escalador", detail: `${Math.round(elev)} m de desnivel positivo.` });
  const hours = Number(act?.moving_time ?? 0) / 3600;
  if (hours >= 3) badges.push({ emoji: "⏱️", label: "Fondista", detail: `${hours.toFixed(1)} h sobre la bici.` });

  // Racha: semanas consecutivas con al menos un entreno completado
  const { data: recent } = await supabase
    .from("workouts")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", new Date(Date.now() - 120 * 86400000).toISOString())
    .order("completed_at", { ascending: false })
    .limit(200);
  const weeks = new Set(
    ((recent ?? []) as any[])
      .map((r) => (r.completed_at ? Math.floor(new Date(r.completed_at).getTime() / (7 * 86400000)) : null))
      .filter((v) => v != null) as number[],
  );
  let streak = 0;
  const thisWeek = Math.floor(Date.now() / (7 * 86400000));
  for (let i = 0; i < 20; i++) {
    if (weeks.has(thisWeek - i)) streak++;
    else break;
  }
  if (streak >= 3) badges.push({ emoji: "🔥", label: `Racha de ${streak} semanas`, detail: "Semanas seguidas entrenando sin fallar." });

  return {
    compliance: { percent, label: complianceLabel(percent), planned_tss: planned, actual_tss: actual },
    records,
    badges,
    totals: { completed, season_completed: seasonDone },
    created_at: new Date().toISOString(),
  };
}

/** Texto corto para notificaciones. */
export function gamificationText(g: Gamification): string {
  const lines: string[] = [];
  if (g.compliance.percent != null) lines.push(`🎯 Cumplimiento: ${g.compliance.percent}% — ${g.compliance.label}`);
  if (g.records.length) {
    lines.push(`🏆 Récords de temporada: ${g.records.map((r) => `${r.label} ${r.watts} W${r.gain ? ` (+${r.gain})` : ""}`).join(" · ")}`);
  }
  const others = g.badges.filter((b) => b.emoji !== "🏆");
  if (others.length) lines.push(`Insignias: ${others.map((b) => `${b.emoji} ${b.label}`).join(" · ")}`);
  return lines.join("\n");
}
