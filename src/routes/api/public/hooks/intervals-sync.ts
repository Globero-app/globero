import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron cada 15 min. Sincronización bidireccional con Intervals.icu:
 * lee cambios de fecha, eventos borrados y sesiones ejecutadas.
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/hooks/intervals-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reconcileIntervalsEvents } = await import("@/lib/intervals-pull.server");

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, intervals_athlete_id, intervals_api_key")
          .not("intervals_athlete_id", "is", null)
          .not("intervals_api_key", "is", null)
          .is("deactivated_at", null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const totals = { moved: 0, removed: 0, completed: 0, users: 0, skipped: 0 };
        const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
        const to = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        for (const u of users ?? []) {
          try {
            // Skip barato: sin entrenos vinculados próximos ni actividad reciente, no hay nada que reconciliar.
            const { data: pending } = await supabaseAdmin
              .from("workouts")
              .select("plan")
              .eq("user_id", u.id)
              .eq("status", "pending")
              .not("plan->intervals_event_id", "is", null)
              .limit(50);
            const near = ((pending ?? []) as any[]).some((w) => {
              const d = String(w?.plan?.scheduled_date ?? "");
              return d >= from && d <= to;
            });
            if (!near) {
              totals.skipped++;
              continue;
            }
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
