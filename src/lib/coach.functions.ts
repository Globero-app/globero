import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Resumen diario del coach + alertas activas (se recalculan y guardan). */
export const getCoachToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { buildDailyBrief, runCoachAlerts } = await import("./coach.server");
    const [brief, alertsRes] = await Promise.all([
      buildDailyBrief(supabase, userId),
      runCoachAlerts(supabase, userId, false),
    ]);
    const { data: stored } = await supabase
      .from("coach_alerts")
      .select("id,kind,severity,title,message,alert_date")
      .eq("user_id", userId)
      .eq("alert_date", brief.date)
      .is("dismissed_at", null)
      .order("severity", { ascending: true });
    return { brief, alerts: stored ?? [], computed: alertsRes.alerts };
  });

export const dismissCoachAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("coach_alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    return { ok: true };
  });
