import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron cada 15 min. Sincronización bidireccional con Intervals.icu:
 * lee cambios de fecha, eventos borrados y sesiones ejecutadas.
 *
 * Auth: header `apikey` debe coincidir con SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/hooks/intervals-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reconcileIntervalsEvents } = await import("@/lib/intervals-pull.server");

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, intervals_athlete_id, intervals_api_key")
          .not("intervals_athlete_id", "is", null)
          .not("intervals_api_key", "is", null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const totals = { moved: 0, removed: 0, completed: 0, users: 0 };
        for (const u of users ?? []) {
          try {
            const r = await reconcileIntervalsEvents(supabaseAdmin, u.id, {
              athleteId: String(u.intervals_athlete_id),
              apiKey: String(u.intervals_api_key),
            });
            totals.moved += r.moved;
            totals.removed += r.removed;
            totals.completed += r.completed;
            totals.users++;
          } catch (e) {
            console.error("intervals-sync user", u.id, e);
          }
        }

        return new Response(JSON.stringify(totals), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
