/** Esquemas de IA y etiquetas usados por el bot de Telegram. */

export const IntentSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["chat", "set_readiness", "modify_workout", "delete_workout", "update_profile", "swap_meal"],
      description:
        "set_readiness si indica cómo se encuentra hoy; delete_workout si pide eliminar, borrar, cancelar o saltarse el entreno de hoy (descansar sin reprogramar); modify_workout si pide cambiar, aplazar o mover a otro día el entreno de hoy; update_profile si pide cambiar un dato de su perfil (peso, altura, edad, FTP, FCmáx, LTHR, objetivo nutricional, duración por defecto, base de entreno potencia/fc, hora del aviso de readiness); swap_meal si pide cambiar/sustituir una comida del menú de hoy; chat en el resto (incluidas preguntas sobre menú, recetas, zonas, FTP, métricas)",
    },

    readiness_score: { type: "number", description: "1-5 solo si intent=set_readiness" },
    change_request: { type: "string", description: "Qué cambio pide en el entreno, solo si intent=modify_workout" },
    new_scheduled_date: {
      type: "string",
      description:
        "Solo si intent=modify_workout y pide mover/aplazar el entreno a otro día. Fecha absoluta en formato YYYY-MM-DD calculada a partir de la FECHA del contexto (por ejemplo 'mañana' = FECHA + 1 día)",
    },
    meal_key: {
      type: "string",
      enum: ["desayuno", "media_manana", "comida", "merienda", "cena"],
      description: "Comida a sustituir, solo si intent=swap_meal",
    },
    meal_request: { type: "string", description: "Preferencias para la nueva comida, solo si intent=swap_meal" },
    profile_updates: {
      type: "object",
      description: "Solo si intent=update_profile. Incluye únicamente los campos a cambiar",
      properties: {
        weight_kg: { type: "number" },
        height_cm: { type: "number" },
        age: { type: "number" },
        ftp: { type: "number" },
        max_hr: { type: "number" },
        lthr: { type: "number" },
        nutrition_goal: { type: "string", enum: ["perdida_peso", "mantenimiento", "masa_muscular"] },
        nutrition_plan_enabled: { type: "boolean" },
        weekly_duration_minutes: { type: "number" },
        weekly_target_basis: { type: "string", enum: ["power", "hr"] },
        readiness_push_hour: { type: "number" },
        zones_display_mode: { type: "string", enum: ["watts", "hr"] },
      },
    },
    reply: { type: "string", description: "Respuesta breve en español para el chat (se usa si intent=chat)" },
  },
  required: ["intent", "reply"],
};

export const MealSchema = {
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

export const PROFILE_LABELS: Record<string, string> = {
  weight_kg: "Peso (kg)",
  height_cm: "Altura (cm)",
  age: "Edad",
  ftp: "FTP (W)",
  max_hr: "FC máx (bpm)",
  lthr: "Umbral FC (bpm)",
  nutrition_goal: "Objetivo nutricional",
  nutrition_plan_enabled: "Plan nutricional",
  weekly_duration_minutes: "Duración por defecto (min)",
  weekly_target_basis: "Base del entreno",
  readiness_push_hour: "Hora del aviso de readiness",
  zones_display_mode: "Zonas mostradas en",
};

export function formatMeal(key: string, meal: any): string {
  if (!meal) return "";
  const m = meal.macros ?? {};
  return `${key}: ${meal.nombre} — ${Math.round(m.calorias_kcal ?? 0)} kcal · HC ${Math.round(m.carbohidratos_g ?? 0)}g · P ${Math.round(m.proteinas_g ?? 0)}g · G ${Math.round(m.grasas_g ?? 0)}g`;
}
