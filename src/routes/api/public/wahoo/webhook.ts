// Webhook de Wahoo: notifica cuando un usuario desautoriza la app.
// Documentación: POST JSON { user_id, ... } desde api.wahooligan.com.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wahoo/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { user_id?: number | string; event?: string };
          const wahooUserId = body?.user_id != null ? String(body.user_id) : null;
          if (!wahooUserId) return Response.json({ ok: false, error: "missing_user_id" }, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ wahoo_user_id: null, wahoo_access_token: null, wahoo_refresh_token: null, wahoo_token_expires_at: null } as any)
            .eq("wahoo_user_id", wahooUserId);
          if (error) {
            console.error(`Wahoo webhook update failed: ${error.message}`);
            return Response.json({ ok: false }, { status: 500 });
          }
          return Response.json({ ok: true });
        } catch {
          return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
        }
      },
    },
  },
});
