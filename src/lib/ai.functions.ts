import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(messages: any[], schema?: any): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY no configurada");
  const body: any = {
    model: MODEL,
    messages,
  };
  if (schema) {
    body.tools = [{ type: "function", function: { name: "respond", description: "Devuelve la respuesta estructurada", parameters: schema } }];
    body.tool_choice = { type: "function", function: { name: "respond" } };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Demasiadas peticiones a la IA. Espera unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de IA disponibles.");
    throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  if (schema && msg?.tool_calls?.[0]?.function?.arguments) {
    return JSON.parse(msg.tool_calls[0].function.arguments);
  }
  return msg?.content ?? "";
}

const MenuInput = z.object({
  competitionId: z.string().uuid(),
});

const RecipeSchema = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    ingredientes: { type: "array", items: { type: "string" }, description: "Ingredientes con cantidades en gramos, ej '80g de arroz'" },
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

const DayMenuSchema = {
  type: "object",
  properties: {
    dia_label: { type: "string", description: "Ej: 'Día -3', 'Día previo'" },
    objetivo_carbohidratos_g: { type: "number" },
    objetivo_calorias_kcal: { type: "number" },
    desayuno: RecipeSchema,
    comida: RecipeSchema,
    merienda: RecipeSchema,
    cena: RecipeSchema,
  },
  required: ["dia_label", "objetivo_carbohidratos_g", "objetivo_calorias_kcal", "desayuno", "comida", "merienda", "cena"],
};

const MenuSchema = {
  type: "object",
  properties: {
    dias: { type: "array", items: DayMenuSchema },
    resumen: { type: "string" },
  },
  required: ["dias", "resumen"],
};

export const generateMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MenuInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { data: comp } = await supabase.from("competitions").select("*").eq("id", data.competitionId).maybeSingle();
    if (!profile || !comp) throw new Error("Datos no encontrados");

    // Datos de Strava (últimas 10 si las hay) para personalizar
    const { data: stravaAct } = await supabase
      .from("intervals_activities")
      .select("name,distance,moving_time,total_elevation_gain,average_watts,icu_training_load,start_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(10);

    const stravaContext = stravaAct && stravaAct.length
      ? `\nDatos recientes de Strava (10 actividades): ${JSON.stringify(stravaAct)}`
      : "";

    const days = profile.pre_race_days ?? 3;
    const weight = profile.weight_kg ?? 70;

    const prompt = `Eres un nutricionista deportivo especializado en CICLISMO. Genera un menú PRE-CARRERA de ${days} días para un ciclista con este perfil:
- Edad: ${profile.age ?? "n/a"}, Sexo: ${profile.gender ?? "n/a"}, Peso: ${weight}kg, Altura: ${profile.height_cm ?? "n/a"}cm
- FTP: ${profile.ftp ?? "n/a"}W
- Preferencias/intolerancias: ${profile.dietary_preferences || "ninguna"}
- Foco nutricional: ${profile.nutrition_focus || "carbohidratos"}

Competición objetivo: "${comp.name}" el ${comp.date}
- Distancia: ${comp.distance_km} km, Desnivel: ${comp.elevation_m} m
- Tipo: ${comp.type}, Intensidad: ${comp.intensity}
${stravaContext}

INSTRUCCIONES:
1. Genera EXACTAMENTE ${days} días, etiquetados como "Día -${days}" hasta "Día -1 (víspera)".
2. Los últimos 2 días aplica carga de carbohidratos (8-10 g/kg).
3. Cada día con desayuno, comida, merienda y cena.
4. CADA receta debe incluir ingredientes CON CANTIDADES en gramos (ej: "80g de arroz blanco", "120g de pechuga de pollo").
5. Preparación en 2-4 frases.
6. Macros calculados realistamente.
7. TODO en ESPAÑOL.
8. Recetas variadas, prácticas, fáciles de cocinar.`;

    const result = await callAI([{ role: "user", content: prompt }], MenuSchema);

    // Guarda
    await supabase.from("competitions").update({ menu_plan: result }).eq("id", data.competitionId);

    return result;
  });

const SwapInput = z.object({
  competitionId: z.string().uuid(),
  dayIndex: z.number().int().min(0),
  mealKey: z.enum(["desayuno", "comida", "merienda", "cena"]),
});

export const swapRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SwapInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { data: comp } = await supabase.from("competitions").select("menu_plan").eq("id", data.competitionId).maybeSingle();
    if (!comp?.menu_plan) throw new Error("No hay menú generado");

    const menu = comp.menu_plan as any;
    const day = menu.dias[data.dayIndex];
    const original = day[data.mealKey];

    const prompt = `Sustituye esta receta de ${data.mealKey} por OTRA DISTINTA con macros similares (±10%).
Perfil ciclista: peso ${profile?.weight_kg ?? 70}kg, preferencias: ${profile?.dietary_preferences || "ninguna"}
Receta a sustituir: ${JSON.stringify(original)}
Macros objetivo: carbohidratos ${original.macros.carbohidratos_g}g, calorías ${original.macros.calorias_kcal}.
Incluye cantidades en gramos en cada ingrediente. TODO en ESPAÑOL.`;

    const newRecipe = await callAI([{ role: "user", content: prompt }], RecipeSchema);
    menu.dias[data.dayIndex][data.mealKey] = newRecipe;
    await supabase.from("competitions").update({ menu_plan: menu }).eq("id", data.competitionId);
    return newRecipe;
  });
