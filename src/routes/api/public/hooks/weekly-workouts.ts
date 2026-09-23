import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron semanal (domingos 21:00 Europa/Madrid). Genera los entrenamientos mixtos
 * de la semana siguiente para cada usuario con generación automática activada,
 * según sus días de entreno, su día de tirada larga y su progreso previo.
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-workouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });

        const now = new Date();
        const madrid = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);

        const madridHour = Number(
          new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(now),
        );
        const url = new URL(request.url);
        if (url.searchParams.get("force") !== "1" && madridHour !== 23 && madridHour !== 0) {
          return new Response(JSON.stringify({ ok: true, skipped: true, hour: madridHour }), { headers: { "content-type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateWorkoutsCore } = await import("@/lib/workouts-gen.server");

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, weekly_training_days, weekly_long_ride_day, weekly_bike_type, weekly_duration_minutes, weekly_target_basis, weekly_last_generated_at, nutrition_plan_enabled, nutrition_goal")
          .eq("weekly_auto_enabled", true)
          .is("deactivated_at", null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }

        const results: any[] = [];
        for (const u of users ?? []) {
          const days = ((u as any).weekly_training_days ?? []).map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6);
          if (!days.length) continue;

          // Idempotencia: no repetir si ya se generó hoy
          const last = (u as any).weekly_last_generated_at ? new Date((u as any).weekly_last_generated_at) : null;
          if (last) {
            const lastMadrid = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
            }).format(last);
            if (lastMadrid === madrid) continue;
          }

          try {
            const inserted = await generateWorkoutsCore(supabaseAdmin, u.id, {
              bike_type: (u as any).weekly_bike_type ?? "carretera",
              duration_minutes: (u as any).weekly_duration_minutes ?? 60,
              target_basis: (u as any).weekly_target_basis === "hr" ? "hr" : "power",
              training_days: days,
              long_ride_day: (u as any).weekly_long_ride_day ?? null,
              max_count: days.length,
              until: (() => {
                const base = new Date(`${madrid}T12:00:00Z`);
                const dow = base.getUTCDay(); // domingo = 0
                const toNextSunday = dow === 0 ? 7 : 7 - dow + 7;
                return new Date(base.getTime() + toNextSunday * 86400000).toISOString().slice(0, 10);
              })(),
              nutrition_goal: (u as any).nutrition_plan_enabled ? ((u as any).nutrition_goal ?? "mantenimiento") : null,
            });

            // Plan nutricional de la semana siguiente
            if ((u as any).nutrition_plan_enabled) {
              try {
                const { generateWeeklyNutritionCore, weekStartISO } = await import("@/lib/nutrition-gen.server");
                await generateWeeklyNutritionCore(supabaseAdmin, u.id, {
                  goal: (u as any).nutrition_goal ?? "mantenimiento",
                  week_start: weekStartISO(new Date(), true),
                });
              } catch (e) { console.error("weekly-nutrition", e); }
            }

            // Subida automática a Intervals.icu si está conectado
            let synced = 0;
            const { syncWorkoutEvent } = await import("@/lib/intervals.server");
            for (const w of inserted ?? []) {
              try {
                if (await syncWorkoutEvent(supabaseAdmin, u.id, w)) synced++;
              } catch { /* ignora errores por entrenamiento */ }
            }

            await supabaseAdmin
              .from("profiles")
              .update({ weekly_last_generated_at: new Date().toISOString() })
              .eq("id", u.id);

            // Resumen semanal: cumplimiento + objetivos de la semana siguiente
            let summary = false;
            try {
              const { sendWeeklySummary } = await import("@/lib/weekly-summary.server");
              summary = await sendWeeklySummary(supabaseAdmin, u.id);
            } catch (e) { console.error("weekly-summary", e); }

            results.push({ user: u.id, created: inserted?.length ?? 0, intervals_synced: synced, summary });
          } catch (e: any) {
            results.push({ user: u.id, error: e?.message ?? "error" });
          }
        }

        // Resumen semanal también para quienes no tienen generación automática
        try {
          const { sendWeeklySummary } = await import("@/lib/weekly-summary.server");
          const { data: rest } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("weekly_auto_enabled", false);
          for (const p of rest ?? []) await sendWeeklySummary(supabaseAdmin, (p as any).id);
        } catch (e) { console.error("weekly-summary-rest", e); }

        return new Response(JSON.stringify({ ok: true, date: madrid, users: results.length, results }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
