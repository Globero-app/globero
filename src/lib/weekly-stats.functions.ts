import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Resumen por semana: km, horas, vatios medios y carga (TSS), con comparativa. */
export const getWeeklyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { buildWeeklyStats } = await import("./weekly-stats.server");
    return await buildWeeklyStats(supabase, userId, 12);
  });
