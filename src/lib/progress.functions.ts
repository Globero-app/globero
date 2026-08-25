import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Series CTL/ATL/TSB, TSS semanal y PRs de potencia del último año. */
export const getProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { buildProgress } = await import("./progress.server");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return await buildProgress(supabase, userId, profile);
  });

/** Detección de umbrales desactualizados + propuesta de test. */
export const getThresholdStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { assessThresholds } = await import("./progress.server");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return await assessThresholds(supabase, userId, profile);
  });

/** Curva mean-max de potencia del último año (picos por duración). */
export const getPowerCurve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getPowerCurve: curve } = await import("./power-peaks.server");
    return await curve(supabase, userId, { sinceDays: 365 });
  });
