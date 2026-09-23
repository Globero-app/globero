import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron cada 30 min. Detecta actividades de hoy en Intervals.icu y envía push
 * para pedir feedback (RPE/Feel).
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/hooks/intervals-detect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });

        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { intervalsListActivities } = await import("@/lib/intervals.server");
        const { notifyUser } = await import("@/lib/web-push.server");

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, intervals_athlete_id, intervals_api_key")
          .not("intervals_athlete_id", "is", null)
          .not("intervals_api_key", "is", null)
          .is("deactivated_at", null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }

        let detected = 0;
        let sent = 0;
        for (const u of users ?? []) {
          // ¿ya notificado hoy?
          const { data: existing } = await supabaseAdmin
            .from("daily_activities")
            .select("id")
            .eq("user_id", u.id)
            .eq("date", today)
            .eq("notification_sent", true)
            .limit(1);
          if (existing && existing.length) continue;

          let activities: any[] = [];
          try {
            activities = await intervalsListActivities(
              { athleteId: String(u.intervals_athlete_id), apiKey: String(u.intervals_api_key) },
              today,
            );
          } catch (e) {
            console.error("intervals list error", e);
            continue;
          }
          const todays = (activities ?? []).filter((a: any) =>
            String(a?.start_date_local ?? "").slice(0, 10) === today,
          );
          const act = todays[0];
          if (!act?.id) continue;

          const { error: upErr } = await supabaseAdmin
            .from("daily_activities")
            .upsert(
              { user_id: u.id, activity_id: String(act.id), date: today, notification_sent: true },
              { onConflict: "user_id,activity_id" },
            );
          if (upErr) { console.error(upErr.message); continue; }
          detected++;

          sent += await notifyUser(u.id, {
            title: "¡Entrenamiento detectado! 🚴‍♂️",
            body: "¿Cómo te has sentido hoy? Pulsa para evaluar tu esfuerzo.",
            tag: `activity-feedback-${today}`,
            url: `/?screen=feedback&activity_id=${encodeURIComponent(String(act.id))}`,
            requireInteraction: true,
          });
        }

        return new Response(JSON.stringify({ ok: true, date: today, detected, push_sent: sent }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
