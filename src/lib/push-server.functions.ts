import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  user_agent: z.string().optional(),
});

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      user_agent: data.user_agent ?? null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const saveDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(10).max(4096), platform: z.enum(["android", "ios"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("device_push_tokens").upsert(
      { user_id: userId, token: data.token, platform: data.platform, last_used_at: new Date().toISOString() },
      { onConflict: "token" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(10).max(4096) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await supabase.from("device_push_tokens").delete().eq("token", data.token);
    return { ok: true };
  });


export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions").select("*").eq("user_id", userId);
    if (!subs || !subs.length) throw new Error("No hay suscripciones. Activa el push primero.");
    const { sendWebPush } = await import("./web-push.server");
    let sent = 0;
    for (const s of subs as any[]) {
      const ok = await sendWebPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        {
          title: "🔔 Push del servidor activo",
          body: "Recibirás avisos aunque cierres la app.",
          tag: "test-server",
          url: "/perfil",
        },
      );
      if (ok) sent++;
      else await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
    return { sent };
  });