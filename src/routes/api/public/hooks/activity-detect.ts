import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron cada 15 min: detecta actividades nuevas en Strava, asigna las de alta confianza
 * y avisa por push/Telegram del resto. A las 20:xx (Madrid) recuerda entrenos pendientes.
 * Auth: header `apikey` = SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/hooks/activity-detect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { acquireJobLock, releaseJobLock, detectAndAssign, remindPendingWorkout } = await import(
          "@/lib/activity-detect.server"
        );

        const JOB = "activity-detect";
        const got = await acquireJobLock(supabaseAdmin, JOB, 600);
        if (!got) {
          return new Response(JSON.stringify({ ok: true, skipped: "locked" }), {
            headers: { "content-type": "application/json" },
          });
        }

        const fmt = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Madrid",
          hour: "2-digit",
          hour12: false,
        });
        const madridHour = Number(fmt.format(new Date()));
        const todayISO = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        let auto = 0;
        let asked = 0;
        let reminded = 0;
        try {
          const { data: users } = await supabaseAdmin
            .from("profiles")
            .select("id, notify_strava_push, notify_training_push")
            .not("strava_refresh_token", "is", null)
            .limit(200);

          for (const u of (users ?? []) as any[]) {
            try {
              const r = await detectAndAssign(supabaseAdmin, u.id, todayISO);
              auto += r.auto;
              asked += r.asked;
              if (madridHour === 20 && u.notify_training_push) {
                if (await remindPendingWorkout(supabaseAdmin, u.id, todayISO)) reminded++;
              }
            } catch (e) {
              console.error("[activity-detect] user", u.id, e);
            }
          }
        } finally {
          await releaseJobLock(supabaseAdmin, JOB, { auto, asked, reminded, at: new Date().toISOString() });
        }

        return new Response(JSON.stringify({ ok: true, auto, asked, reminded }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
