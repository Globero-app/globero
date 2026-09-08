import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FtpTestInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basis: z.enum(["power", "hr"]),
});

function buildFtpTestSteps(basis: "power" | "hr", ftp: number, hrRef: number) {
  const p = (pct: number) => Math.round((pct / 100) * ftp);
  const h = (pct: number) => Math.round((pct / 100) * hrRef);
  const v = (pctPower: number, pctHr: number) =>
    basis === "hr"
      ? { target: "hr", target_low: h(pctHr), target_high: h(pctHr + 6) }
      : { target: "power", target_low: p(pctPower), target_high: p(pctPower + 15) };

  const steps: any[] = [
    { name: "Calentamiento", description: "Z1-Z2, cadencia 85-95 rpm", duration_type: "time", duration_seconds: 600, intensity: "warmup", ...v(45, 60) },
  ];
  for (let i = 0; i < 3; i++) {
    steps.push({ name: `Acel ${i + 1}`, description: "1 min alta cadencia 100-110 rpm", duration_type: "time", duration_seconds: 60, intensity: "interval", ...v(75, 82) });
    steps.push({ name: "Recuperacion", description: "1 min suave", duration_type: "time", duration_seconds: 60, intensity: "recovery", ...v(50, 65) });
  }
  steps.push({ name: "Rodaje", description: "Baja pulsaciones antes del bloque duro", duration_type: "time", duration_seconds: 300, intensity: "active", ...v(45, 62) });
  steps.push({
    name: "Test 20 min",
    description: basis === "hr"
      ? "Máximo esfuerzo sostenible 20 min. Apunta la FC media (LTHR ≈ 95% de esa media)."
      : "Máximo esfuerzo sostenible 20 min. Apunta la potencia media (FTP ≈ 95% de esa media).",
    duration_type: "time", duration_seconds: 1200, intensity: "interval", ...v(95, 95),
  });
  steps.push({ name: "Vuelta calma", description: "Z1 muy suave", duration_type: "time", duration_seconds: 600, intensity: "cooldown", ...v(40, 55) });
  return steps;
}

/** Programar el Test de FTP en el calendario (+ Intervals.icu) */
export const scheduleFtpTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FtpTestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,max_hr,lthr,intervals_athlete_id")
      .eq("id", userId)
      .maybeSingle();

    const ftp = profile?.ftp && profile.ftp > 0 ? profile.ftp : 200;
    const lthr = (profile as any)?.lthr ?? null;
    const maxHr = (profile as any)?.max_hr ?? null;
    const hrRef = lthr && lthr > 0 ? lthr : maxHr && maxHr > 0 ? Math.round(maxHr * 0.92) : 165;

    const steps = buildFtpTestSteps(data.basis, ftp, hrRef);
    const totalSec = steps.reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0);

    const plan = {
      name: "Test FTP",
      title: data.basis === "hr" ? "Test de umbral 20 min (FC)" : "Test de FTP 20 min (potencia)",
      summary: data.basis === "hr"
        ? `Protocolo de 20 min para estimar tu LTHR por frecuencia cardíaca. Referencia actual: ${hrRef} ppm. LTHR ≈ 95% de la FC media de los 20 min.`
        : `Protocolo Coggan de 20 min para estimar tu FTP. Referencia actual: ${ftp} W. FTP ≈ 95% de la potencia media de los 20 min.`,
      focus: "intervalos",
      steps,
      target_basis: data.basis,
      scheduled_date: data.date,
      is_ftp_test: true,
    };

    const { data: inserted, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        training_type: "intervalos",
        bike_type: "carretera",
        duration_minutes: Math.round(totalSec / 60),
        plan,
        status: "pending",
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    let synced = false;
    if (profile?.intervals_athlete_id) {
      const { syncWorkoutEvent } = await import("./intervals.server");
      synced = !!(await syncWorkoutEvent(supabase, userId, inserted));
    }
    return { ok: true, workout: inserted, intervals_synced: synced };
  });
