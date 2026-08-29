import { callAI } from "./ai-call.server";

export const NUTRITION_GOALS = ["perdida_peso", "mantenimiento", "masa_muscular"] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];

export const GOAL_LABEL: Record<string, string> = {
  perdida_peso: "Pérdida de peso",
  mantenimiento: "Mantenimiento",
  masa_muscular: "Ganar masa muscular",
};

const GOAL_RULES: Record<string, string> = {
  perdida_peso:
    "Déficit calórico moderado (-15/-20% sobre el gasto), proteína alta (1,8-2,2 g/kg), carbohidratos concentrados alrededor del entreno, grasas moderadas. Nunca bajar de ~1.500 kcal/día.",
  mantenimiento:
    "Calorías en equilibrio con el gasto del día, proteína 1,6-1,8 g/kg, carbohidratos periodizados según carga del entrenamiento del día.",
  masa_muscular:
    "Superávit ligero (+10/+15%), proteína 2,0-2,2 g/kg repartida en las 5 tomas, carbohidratos altos alrededor del entreno y una toma proteica en la cena.",
};

const MealSchema = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    ingredientes: { type: "array", items: { type: "string" }, description: "Ingredientes con cantidades en gramos" },
    preparacion: { type: "string" },
    macros: {
      type: "object",
      properties: {
        carbohidratos_g: { type: "number" },
        proteinas_g: { type: "number" },
        grasas_g: { type: "number" },
        calorias_kcal: { type: "number" },
      },
      required: ["carbohidratos_g", "proteinas_g", "grasas_g", "calorias_kcal"],
    },
  },
  required: ["nombre", "ingredientes", "preparacion", "macros"],
};

const DaySchema = {
  type: "object",
  properties: {
    fecha: { type: "string", description: "YYYY-MM-DD" },
    dia_semana: { type: "string", description: "lunes, martes, miércoles…" },
    entrenamiento: { type: "string", description: "Resumen del entreno de ese día o 'Descanso'" },
    objetivo_calorias_kcal: { type: "number" },
    objetivo_carbohidratos_g: { type: "number" },
    objetivo_proteinas_g: { type: "number" },
    desayuno: MealSchema,
    media_manana: MealSchema,
    comida: MealSchema,
    merienda: MealSchema,
    cena: MealSchema,
  },
  required: ["fecha", "dia_semana", "entrenamiento", "objetivo_calorias_kcal", "objetivo_carbohidratos_g", "objetivo_proteinas_g", "desayuno", "media_manana", "comida", "merienda", "cena"],
};

const WeekSchema = {
  type: "object",
  properties: {
    dias: { type: "array", items: DaySchema },
    resumen: { type: "string" },
  },
  required: ["dias", "resumen"],
};

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Lunes de la semana que contiene `from` (o el próximo lunes si `next`). */
export function weekStartISO(from = new Date(), next = false): string {
  const d = new Date(from);
  d.setUTCHours(12, 0, 0, 0);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff + (next ? 7 : 0));
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Genera (o regenera) el plan nutricional semanal adaptado a los entrenamientos de esa semana. */
export async function generateWeeklyNutritionCore(
  supabase: any,
  userId: string,
  opts: { goal: string; week_start?: string },
) {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) throw new Error("Perfil no encontrado");

  const weekStart = opts.week_start ?? weekStartISO(new Date());
  const start = new Date(`${weekStart}T12:00:00Z`);
  const days: { date: string; dow: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({ date: d.toISOString().slice(0, 10), dow: d.getUTCDay() });
  }
  const weekEnd = days[6].date;

  const { data: workouts } = await supabase
    .from("workouts")
    .select("training_type,duration_minutes,plan,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(120);

  const inWeek = (workouts ?? []).filter((w: any) => {
    const d = w.plan?.scheduled_date;
    return d && d >= weekStart && d <= weekEnd;
  });

  const { data: comps } = await supabase
    .from("competitions")
    .select("name,date,distance_km,elevation_m,intensity")
    .eq("user_id", userId)
    .gte("date", weekStart)
    .lte("date", addDaysISO(weekEnd, 5));

  const goal = opts.goal in GOAL_RULES ? opts.goal : "mantenimiento";

  const upcoming = (comps ?? []).filter((c: any) => c.date > weekEnd);
  const preRaceBlock = upcoming.length
    ? `\nCOMPETICIONES PRÓXIMAS (adaptar los 5 días previos):\n${upcoming
        .map((c: any) => `- ${c.name} el ${c.date} (${c.distance_km} km, ${c.elevation_m} m, intensidad ${c.intensity ?? "n/a"})`)
        .join("\n")}`
    : "";

  const daysBlock = days
    .map((d) => {
      const w = inWeek.find((x: any) => x.plan?.scheduled_date === d.date);
      const c = (comps ?? []).find((x: any) => x.date === d.date);
      const desc = c
        ? `COMPETICIÓN: ${c.name} (${c.distance_km} km, ${c.elevation_m} m)`
        : w
          ? `${w.plan?.title ?? w.training_type} · ${w.duration_minutes} min${w.plan?.long_ride ? " · TIRADA LARGA" : ""}`
          : "Descanso";
      return `- ${d.date} (${DAY_NAMES[d.dow]}): ${desc}`;
    })
    .join("\n");

  const prompt = `Eres un nutricionista deportivo especializado en ciclismo. Crea el PLAN NUTRICIONAL SEMANAL (7 días) para este ciclista.

PERFIL:
- Edad: ${profile.age ?? "n/a"} · Sexo: ${profile.gender ?? "n/a"} · Peso: ${profile.weight_kg ?? "n/a"} kg · Altura: ${profile.height_cm ?? "n/a"} cm
- FTP: ${profile.ftp ?? "n/a"} W · FC máx: ${profile.max_hr ?? "n/a"} ppm
- Preferencias / intolerancias (OBLIGATORIO respetarlas): ${profile.dietary_preferences || "ninguna"}

OBJETIVO DEL PLAN: ${GOAL_LABEL[goal]}
REGLAS DEL OBJETIVO: ${GOAL_RULES[goal]}

ENTRENAMIENTOS DE LA SEMANA (${weekStart} a ${weekEnd}):
${daysBlock}
${preRaceBlock}

INSTRUCCIONES:
1. Devuelve EXACTAMENTE 7 días, en orden, con la fecha indicada arriba y su día de la semana en español.
2. Cada día con 5 tomas: desayuno, media mañana (media_manana), comida, merienda y cena.
3. Ajusta calorías y carbohidratos al entreno de cada día: más CHO en días de tirada larga/intensidad, menos en descanso, manteniendo siempre el objetivo (${GOAL_LABEL[goal]}).
4. Si algún día de la semana está dentro de los 5 días previos a una competición, adapta ese día a la carrera: carga progresiva de carbohidratos, digestión fácil, hidratación y sal, evitando exceso de fibra y grasas la víspera. Respeta SIEMPRE las preferencias / intolerancias.
5. Si hay competición ese día, prioriza energía disponible (CHO altos, digestión fácil).
6. Ingredientes SIEMPRE con cantidades en gramos. Preparación en 2-4 frases.
7. Macros realistas y coherentes con los objetivos diarios.
8. Recetas variadas entre días, prácticas y fáciles. TODO en ESPAÑOL.`;

  const result = await callAI([{ role: "user", content: prompt }], WeekSchema, { fn: "nutrition-week" });

  const { data: saved, error } = await supabase
    .from("weekly_nutrition_plans")
    .upsert(
      { user_id: userId, week_start: weekStart, goal, plan: result },
      { onConflict: "user_id,week_start" },
    )
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return saved;
}
