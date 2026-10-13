import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getGarminDevice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("garmin_devices")
      .select("id, garmin_device_id, linked_at, status")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("linked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

export const claimGarminCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string }) => z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("garmin_pairing_codes")
      .select("id, garmin_device_id, user_id, expires_at")
      .eq("pairing_code", data.code)
      .maybeSingle();
    if (!row || !row.garmin_device_id) return { ok: false as const, reason: "invalid" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, reason: "expired" as const };
    if (row.user_id && row.user_id !== context.userId) return { ok: false as const, reason: "invalid" as const };
    const { error } = await supabaseAdmin.from("garmin_devices").upsert(
      { user_id: context.userId, garmin_device_id: row.garmin_device_id, status: "active", linked_at: new Date().toISOString() },
      { onConflict: "garmin_device_id" },
    );
    if (error) return { ok: false as const, reason: "error" as const };
    await supabaseAdmin.from("garmin_pairing_codes").update({ user_id: context.userId }).eq("id", row.id);
    return { ok: true as const };
  });

export const unlinkGarminDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("garmin_devices").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("No se pudo desvincular");
    return { ok: true };
  });
