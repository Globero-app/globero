import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveInput = z.object({
  avg_watts_20min: z.number().positive().nullable().optional(),
  avg_hr_20min: z.number().positive().nullable().optional(),
  ftp: z.number().positive().nullable().optional(),
  lthr: z.number().positive().nullable().optional(),
  source: z.string().default("manual"),
});

/** Guarda un test de FTP: historial + perfil + recálculo de la ficha del atleta. */
export const saveFtpTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.ftp && !data.lthr) throw new Error("Introduce la potencia o la FC media de los 20 min.");

    const nowIso = new Date().toISOString();
    const { error: insErr } = await supabase.from("ftp_tests").insert({
      user_id: userId,
      avg_watts_20min: data.avg_watts_20min ?? null,
      avg_hr_20min: data.avg_hr_20min ?? null,
      ftp: data.ftp ?? null,
      lthr: data.lthr ?? null,
      source: data.source ?? "manual",
    });
    if (insErr) throw new Error(insErr.message);

    const update: any = { ftp_test_completed_at: nowIso };
    if (data.ftp) update.ftp = data.ftp;
    if (data.lthr) update.lthr = data.lthr;
    const { error: upErr } = await supabase.from("profiles").update(update).eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    // Recalcula techo de carga, umbrales y curva con el nuevo FTP
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      const { refreshAthleteProfile } = await import("./athlete-profile.server");
      await refreshAthleteProfile(supabase, userId, profile);
    } catch {
      /* no bloquea el guardado */
    }

    return { ok: true, ftp: data.ftp ?? null, lthr: data.lthr ?? null };
  });

/** Historial de tests de FTP del usuario (más antiguo primero). */
export const getFtpTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("ftp_tests")
      .select("id,test_date,ftp,lthr,avg_watts_20min,avg_hr_20min,source")
      .eq("user_id", userId)
      .order("test_date", { ascending: true })
      .limit(50);
    return { items: (data ?? []) as any[] };
  });
