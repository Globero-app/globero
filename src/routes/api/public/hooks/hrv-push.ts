import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron horario. Envía push a los usuarios cuya hora de aviso HRV (en Europa/Madrid)
 * coincida con la hora actual de Madrid y que aún no hayan registrado el HRV de hoy.
 *
 * Auth: header `apikey` debe coincidir con SUPABASE_PUBLISHABLE_KEY (misma clave
 * pública que ya usa la app).
 */
export const Route = createFileRoute("/api/public/hooks/hrv-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Hora y fecha actuales en España peninsular
        const now = new Date();
        const madridHour = Number(
          new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(now),
        );
        const madridDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Usuarios con aviso a esta hora
        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .eq("hrv_push_enabled", true)
          .eq("hrv_push_hour", madridHour);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }
        if (!users || users.length === 0) {
          return new Response(JSON.stringify({ ok: true, matched: 0, hour: madridHour }), { headers: { "content-type": "application/json" } });
        }

        // Quita los que ya han registrado HRV hoy
        const ids = users.map((u) => u.id);
        const { data: already } = await supabaseAdmin
          .from("hrv_entries")
          .select("user_id")
          .eq("entry_date", madridDate)
          .in("user_id", ids);
        const done = new Set((already ?? []).map((r: any) => r.user_id));
        const targets = users.filter((u) => !done.has(u.id));

        const { notifyUser } = await import("@/lib/web-push.server");
        let sent = 0;
        for (const u of targets) {
          const n = await notifyUser(u.id, {
            title: "💓 Registra tu HRV de hoy",
            body: "Buenos días. Mide tu HRV al despertar para que la IA ajuste tu sesión.",
            tag: `hrv-${madridDate}`,
            url: "/hrv",
            requireInteraction: false,
          });
          sent += n;
        }

        return new Response(
          JSON.stringify({ ok: true, hour: madridHour, matched: users.length, notified_users: targets.length, push_sent: sent }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
