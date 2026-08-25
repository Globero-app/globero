import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StepIn = z.object({
  name: z.string().max(60).optional().default(""),
  duration_seconds: z.number().int().min(5).max(21600),
  low_pct: z.number().min(0.2).max(2.5),
  high_pct: z.number().min(0.2).max(2.5),
  intensity: z.string().max(20).optional().default("active"),
});

const SessionIn = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(120),
  bike_type: z.string().max(20).optional().default("carretera"),
  duration_minutes: z.number().int().min(10).max(600),
  estimated_tss: z.number().min(0).max(600).nullable().optional(),
  summary: z.string().max(800).optional().default(""),
  steps: z.array(StepIn).max(120).optional(),
});

const ImportInput = z.object({
  sessions: z.array(SessionIn).min(1).max(90),
  upload_to_intervals: z.boolean().optional().default(true),
});

const BIKE_TYPES = ["carretera", "gravel", "montana", "electrica", "rodillo"];

export const importWorkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,lthr,max_hr")
      .eq("id", userId)
      .maybeSingle();
    const ftp = profile?.ftp && profile.ftp > 0 ? profile.ftp : 200;

    const { estimatePlanTss } = await import("./training-load.server");

    const rows = data.sessions.map((s) => {
      const bike = BIKE_TYPES.includes(s.bike_type) ? s.bike_type : "carretera";
      const steps = (s.steps ?? []).map((st) => ({
        name: (st.name || "Bloque").slice(0, 40),
        description: "",
        duration_type: "time" as const,
        duration_seconds: st.duration_seconds,
        target: "power" as const,
        target_low: Math.round(st.low_pct * ftp),
        target_high: Math.round(st.high_pct * ftp),
        intensity: st.intensity || "active",
      }));
      const plan: any = {
        name: s.title.slice(0, 15),
        title: s.title,
        summary: s.summary || "Sesión importada",
        focus: "mixto",
        scheduled_date: s.scheduled_date,
        target_basis: "power",
        imported: true,
        steps,
      };
      const tss =
        s.estimated_tss ??
        (steps.length
          ? estimatePlanTss(plan, ftp, profile?.lthr ?? null, profile?.max_hr ?? null, s.duration_minutes)
          : null);
      plan.estimated_tss = tss;
      return {
        user_id: userId,
        training_type: "mixto",
        bike_type: bike,
        duration_minutes: s.duration_minutes,
        plan,
        status: "pending",
        planned_tss: tss,
      };
    });

    const { data: inserted, error } = await supabase.from("workouts").insert(rows).select();
    if (error) throw new Error(error.message);

    let uploaded = 0;
    if (data.upload_to_intervals) {
      const { syncWorkoutEvent } = await import("./intervals.server");
      for (const w of inserted ?? []) {
        try {
          if (await syncWorkoutEvent(supabase, userId, w)) uploaded++;
        } catch (e) {
          console.error("import intervals sync", e);
        }
      }
    }

    return { ok: true, imported: (inserted ?? []).length, uploaded };
  });
