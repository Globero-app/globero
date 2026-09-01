import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const emailSchema = z.object({ email: z.string().trim().email().max(255) });

/** Comprueba si el email pertenece a un usuario existente (sin exponer datos). */
export const emailExists = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => emailSchema.parse(d))
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    return { exists: !!row };
  });

/** Desactiva la cuenta del usuario actual: corta conexiones y detiene automatismos. */
export const deactivateMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        deactivated_at: new Date().toISOString(),
        telegram_chat_id: null,
        linking_code: null,
        intervals_api_key: null,
        intervals_athlete_id: null,
        intervals_oauth: false,
        intervals_refresh_token: null,
        intervals_token_expires_at: null,
        weekly_auto_enabled: false,
        nutrition_plan_enabled: false,
        readiness_push_enabled: false,
        notify_daily_brief: false,
        notify_fatigue_alerts: false,
        notify_training_push: false,
        notify_prerace_push: false,
        notify_maintenance_push: false,
        notify_strava_push: false,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    await supabase.from("push_subscriptions").delete().eq("user_id", userId);
    return { ok: true };
  });
