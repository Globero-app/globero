import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "mikigarcia25@hotmail.com";
const ADMIN_PASSWORD = "Candela2018?";

export const Route = createFileRoute("/api/public/setup-admin")({
  server: {
    handlers: {
      POST: async () => {
        try {
          // ¿Ya existe?
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const existing = list?.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

          let userId = existing?.id;
          if (!userId) {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
              email: ADMIN_EMAIL,
              password: ADMIN_PASSWORD,
              email_confirm: true,
              user_metadata: { full_name: "Miki García" },
            });
            if (error) throw error;
            userId = data.user!.id;
          }

          // Asegura rol admin
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId!, role: "admin" }, { onConflict: "user_id,role" });

          return Response.json({ ok: true, created: !existing });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
