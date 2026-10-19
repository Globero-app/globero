/** Construye el contexto (entrenos, menú, zonas, perfil) que se envía a la IA del bot. */
import { formatMeal } from "./telegram-schemas.server";

export type TelegramContext = {
  context: string;
  workout: any | null;
  todayMenu: any | null;
  nutriPlan: any | null;
  nutriRow: any | null;
  weekStart: string;
};

export async function buildTelegramContext(
  supabaseAdmin: any,
  profile: any,
  today: string,
): Promise<TelegramContext> {
  const userId = profile.id as string;
  const { pickTodayWorkout, READINESS_LABELS } = await import("./readiness.server");

  const { data: pending } = await supabaseAdmin
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const workout = pickTodayWorkout((pending ?? []) as any[], today);

  const { data: readinessToday } = await supabaseAdmin
    .from("readiness_entries")
    .select("score,note,ai_message")
    .eq("user_id", userId)
    .eq("entry_date", today)
    .maybeSingle();

  // Entrenos de la semana (pendientes + completados recientes)
  const { weekStartISO } = await import("./nutrition-gen.server");
  const weekStart = weekStartISO(new Date(`${today}T12:00:00Z`));
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);

  const { data: allWorkouts } = await supabaseAdmin
    .from("workouts")
    .select("id,status,duration_minutes,bike_type,plan,completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);

  const weekWorkouts = ((allWorkouts ?? []) as any[])
    .map((w) => ({ ...w, date: w.plan?.scheduled_date ?? null }))
    .filter((w) => w.date && w.date >= weekStart && w.date <= weekEndISO)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(
      (w) =>
        `${w.date}: ${w.plan?.title ?? "—"} · ${w.duration_minutes} min · ${w.bike_type} · ${w.status}${w.plan?.summary ? ` — ${w.plan.summary}` : ""}`,
    );

  // Plan nutricional de la semana / día
  const { data: nutriRow } = await supabaseAdmin
    .from("weekly_nutrition_plans")
    .select("week_start,goal,plan")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const nutriPlan = (nutriRow as any)?.plan ?? null;
  const todayMenu = nutriPlan?.dias?.find((d: any) => d.fecha === today) ?? null;
  const menuText = todayMenu
    ? [
        `Objetivos: ${Math.round(todayMenu.objetivo_calorias_kcal ?? 0)} kcal · HC ${Math.round(todayMenu.objetivo_carbohidratos_g ?? 0)}g · P ${Math.round(todayMenu.objetivo_proteinas_g ?? 0)}g`,
        formatMeal("Desayuno", todayMenu.desayuno),
        formatMeal("Media mañana", todayMenu.media_manana),
        formatMeal("Comida", todayMenu.comida),
        formatMeal("Merienda", todayMenu.merienda),
        formatMeal("Cena", todayMenu.cena),
      ]
        .filter(Boolean)
        .join("\n")
    : "sin plan nutricional para hoy";

  // Zonas
  const { computePowerZones, computeHrZones } = await import("./zones");
  const pz = computePowerZones(profile.ftp);
  const hz = computeHrZones(profile.lthr, profile.max_hr);
  const zonesText = [
    pz ? `Potencia: ${pz.map((z) => `${z.label} ${z.low}-${z.high === Infinity ? "∞" : z.high}W`).join(" | ")}` : "Potencia: sin FTP",
    hz ? `FC: ${hz.map((z) => `${z.label} ${z.low}-${z.high === Infinity ? "∞" : z.high}bpm`).join(" | ")}` : "FC: sin LTHR/FCmáx",
  ].join("\n");

  const p: any = profile;
  const context = `FECHA: ${today} (semana ${weekStart} → ${weekEndISO})
PERFIL: ${p.full_name ?? "—"} · edad ${p.age ?? "n/a"} · sexo ${p.gender ?? "n/a"} · peso ${p.weight_kg ?? "n/a"}kg · altura ${p.height_cm ?? "n/a"}cm · FTP ${p.ftp ?? "n/a"}W · FCmáx ${p.max_hr ?? "n/a"} · LTHR ${p.lthr ?? "n/a"}
AJUSTES: bici ${p.weekly_bike_type} · nutrición ${p.nutrition_plan_enabled ? p.nutrition_goal : "off"} · dieta: ${p.dietary_preferences || "ninguna"}
READINESS DE HOY: ${readinessToday ? `${(readinessToday as any).score}/5 — ${READINESS_LABELS[(readinessToday as any).score]}` : "sin registrar"}
ENTRENO DE HOY: ${workout ? `${workout.plan?.title ?? "—"} · ${workout.duration_minutes} min · ${workout.bike_type}${workout.plan?.summary ? ` — ${workout.plan.summary}` : ""}${Array.isArray(workout.plan?.steps) ? `\nBloques: ${workout.plan.steps.map((st: any) => `${st.name ?? st.type ?? "-"} ${st.duration_minutes ?? st.minutes ?? ""}′${st.zone ? ` ${st.zone}` : ""}`).join(" | ")}` : ""}` : "no hay entreno pendiente"}
ENTRENOS DE LA SEMANA:
${weekWorkouts.length ? weekWorkouts.join("\n") : "sin entrenos esta semana"}
MENÚ DE HOY:
${menuText}
RESUMEN NUTRICIONAL SEMANAL: ${nutriPlan?.resumen ?? "n/a"}
ZONAS DE ENTRENAMIENTO:
${zonesText}`;

  return { context, workout, todayMenu, nutriPlan, nutriRow, weekStart };
}
