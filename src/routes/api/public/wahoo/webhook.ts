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

        const wahooUserId = body?.user?.id ?? body?.user_id;
        if (wahooUserId == null) return Response.json({ ok: false, error: "missing_user_id" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body?.event_type === "workout_summary") {
          const { data: p } = await supabaseAdmin.from("profiles").select("id").eq("wahoo_user_id" as any, String(wahooUserId)).maybeSingle();
          if (!p) return Response.json({ ok: true, ignored: true });
          const { pullDeviceActivities } = await import("@/lib/devices.server");
          const n = await pullDeviceActivities(supabaseAdmin, (p as any).id);
          return Response.json({ ok: true, stored: n });
        }

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ wahoo_user_id: null, wahoo_access_token: null, wahoo_refresh_token: null, wahoo_token_expires_at: null } as any)
          .eq("wahoo_user_id" as any, String(wahooUserId));
        if (error) {
          console.error(`Wahoo webhook update failed: ${error.message}`);
          return Response.json({ ok: false }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
