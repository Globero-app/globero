import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Devuelve la fecha "hoy" en Europa/Madrid como YYYY-MM-DD. */
function madridToday(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

const SaveInput = z.object({
  value: z.number().int().min(1).max(300),
  note: z.string().max(500).optional().nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const saveHrv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const date = data.entry_date ?? madridToday();
    const { error } = await supabase.from("hrv_entries").upsert({
      user_id: userId,
      entry_date: date,
      value: data.value,
      note: data.note ?? null,
    }, { onConflict: "user_id,entry_date" });
    if (error) throw new Error(error.message);
    return { ok: true, entry_date: date };
  });

export const getRecentHrv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("hrv_entries")
      .select("entry_date,value,note")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(14);
    return data ?? [];
  });
