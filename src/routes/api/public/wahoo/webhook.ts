// Webhook de Wahoo: `workout_summary` (actividad nueva) y desautorización.
// Los datos de la actividad NO se toman del payload: se descargan de la API de Wahoo con el token del usuario.
// Si existe el secreto WAHOO_WEBHOOK_TOKEN se valida `webhook_token`.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wahoo/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
        }
        const expected = process.env["WAHOO_WEBHOOK_TOKEN"];
        if (expected && body?.webhook_token !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleWahooEvent } = await import("@/lib/wahoo-webhook");
        try {
          const { status, ...res } = await handleWahooEvent(body, {
            findProfile: async (wid) => (await supabaseAdmin.from("profiles").select("*").eq("wahoo_user_id" as any, wid).maybeSingle()).data,
            pullActivities: async (uid) => (await import("@/lib/devices.server")).pullDeviceActivities(supabaseAdmin, uid),
            refreshPmc: async (uid, p) => {
              await supabaseAdmin.from("profiles").update({ daily_brief_cache: null } as any).eq("id", uid);
              const { refreshAthleteProfile } = await import("@/lib/athlete-profile.server");
              await refreshAthleteProfile(supabaseAdmin, uid, p);
            },
            deauthorize: async (wid) => {
              const { error } = await supabaseAdmin
                .from("profiles")
                .update({ wahoo_user_id: null, wahoo_access_token: null, wahoo_refresh_token: null, wahoo_token_expires_at: null } as any)
                .eq("wahoo_user_id" as any, wid);
              if (error) throw new Error(error.message);
            },
          });
          return Response.json(res, { status });
        } catch (e: any) {
          console.error(`Wahoo webhook failed: ${e?.message}`);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
