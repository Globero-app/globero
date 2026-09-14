import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron diario (07:00 Madrid): repasa el plan de cada usuario — suaviza la sesión
 * del día si la frescura o el readiness son bajos, marca los entrenos no realizados
 * y propone reubicarlos, y avisa si el FTP está desfasado.
 * Auth: header `apikey` = SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/hooks/daily-adjust")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { acquireJobLock, releaseJobLock } = await import("@/lib/activity-detect.server");
        const { dailyReview } = await import("@/lib/daily-adjust.server");

        const JOB = "daily-adjust";
        const got = await acquireJobLock(supabaseAdmin, JOB, 900);
        if (!got) {
          return new Response(JSON.stringify({ ok: true, skipped: "locked" }), {
            headers: { "content-type": "application/json" },
          });
        }

        let processed = 0;
        try {
          const { data: users } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .is("deactivated_at", null)
            .limit(500);
          for (const u of (users ?? []) as any[]) {
            try {
              await dailyReview(supabaseAdmin, u.id);
              processed++;
            } catch (e) {
              console.error("[daily-adjust] user", u.id, e);
            }
          }
        } finally {
          await releaseJobLock(supabaseAdmin, JOB, { processed, at: new Date().toISOString() });
        }

        return new Response(JSON.stringify({ ok: true, processed }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
