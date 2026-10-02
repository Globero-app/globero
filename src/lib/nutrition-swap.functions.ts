import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  planId: z.string().uuid(),
  dayIndex: z.number().int().min(0).max(6),
  mealKey: z.enum(["desayuno", "media_manana", "comida", "merienda", "cena"]),
});

const MealSchema = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    ingredientes: { type: "array", items: { type: "string" } },
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

/** Sustituye una comida del plan semanal por otra receta con macros similares. */
export const swapWeeklyMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callAI } = await import("./ai-call.server");
    const { data: row } = await supabase.from("weekly_nutrition_plans").select("plan").eq("id", data.planId).eq("user_id", userId).maybeSingle();
    const plan = row?.plan as any;
    const original = plan?.dias?.[data.dayIndex]?.[data.mealKey];
    if (!original) throw new Error("Receta no encontrada");
    const { data: profile } = await supabase.from("profiles").select("dietary_preferences,weight_kg,language").eq("id", userId).maybeSingle();
    const { data: fb } = await supabase.from("recipe_feedback").select("recipe_name,liked").eq("user_id", userId);
    const disliked = (fb ?? []).filter((f: any) => !f.liked).map((f: any) => f.recipe_name);
    const m = original.macros ?? {};
    const prompt = `Sustituye esta receta de ${data.mealKey} por OTRA DISTINTA (ingredientes principales diferentes) con macros similares (±10%): ${Math.round(m.calorias_kcal ?? 0)} kcal, CHO ${Math.round(m.carbohidratos_g ?? 0)} g, proteína ${Math.round(m.proteinas_g ?? 0)} g, grasas ${Math.round(m.grasas_g ?? 0)} g.
Receta actual (NO repetir): ${original.nombre}
Recetas que NO le gustan (evitar): ${[original.nombre, ...disliked].join("; ")}
Peso ${profile?.weight_kg ?? 70} kg. Preferencias/intolerancias (obligatorio): ${profile?.dietary_preferences || "ninguna"}.
Ingredientes con cantidades en gramos, preparación en 2-4 frases. Responde en el mismo idioma que la receta actual.`;
    const meal = await callAI([{ role: "user", content: prompt }], MealSchema, { fn: "meal-swap", userId });
    plan.dias[data.dayIndex][data.mealKey] = meal;
    const { error } = await supabase.from("weekly_nutrition_plans").update({ plan }).eq("id", data.planId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return meal;
  });
