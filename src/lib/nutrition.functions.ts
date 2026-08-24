import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GoalEnum = z.enum(["perdida_peso", "mantenimiento", "masa_muscular"]);

const Input = z.object({
  goal: GoalEnum,
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Genera el plan nutricional semanal (Menús) adaptado a los entrenos de la semana. */
export const generateWeeklyNutrition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateWeeklyNutritionCore } = await import("./nutrition-gen.server");

    await supabase
      .from("profiles")
      .update({ nutrition_plan_enabled: true, nutrition_goal: data.goal })
      .eq("id", userId);

    return generateWeeklyNutritionCore(supabase, userId, {
      goal: data.goal,
      week_start: data.week_start,
    });
  });
