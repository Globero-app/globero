import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PrefsSchema = z.object({
  availability_minutes: z.record(z.string(), z.union([z.number().min(0).max(360), z.null()])).default({}),
  preferred_hour: z.number().int().min(0).max(23).nullable().default(null),
  indoor_tolerance: z.enum(["baja", "media", "alta"]).default("media"),
  terrain: z.enum(["llano", "montana", "mixto"]).default("mixto"),
  natural_cadence: z.number().int().min(50).max(120).nullable().default(null),
});

/** Ficha individual del ciclista (solo la del usuario autenticado). */
export const getAthleteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("athlete_profile").select("*").eq("user_id", userId).maybeSingle();
    return data ?? null;
  });

/** Guarda solo las preferencias editables; nunca los campos derivados. */
export const saveAthletePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PrefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const availability: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(data.availability_minutes)) {
      if (!/^[0-6]$/.test(k)) continue;
      availability[k] = v && v > 0 ? Math.round(v) : null;
    }
    const { error } = await supabase
      .from("athlete_profile")
      .upsert(
        {
          user_id: userId,
          availability_minutes: availability,
          preferred_hour: data.preferred_hour,
          indoor_tolerance: data.indoor_tolerance,
          terrain: data.terrain,
          natural_cadence: data.natural_cadence,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recalcula la ficha derivada con los datos del propio usuario. */
export const recomputeAthleteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { refreshAthleteProfile } = await import("./athlete-profile.server");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return await refreshAthleteProfile(supabase, userId, profile);
  });
