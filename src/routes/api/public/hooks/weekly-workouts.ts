import { createFileRoute } from "@tanstack/react-router";
import { weeklyWorkoutParams, weeklyWorkoutWindow } from "@/lib/weekly-workout-window";

/**
 * Cron semanal (domingo 21:00–lunes 14:00 Europa/Madrid). Genera los entrenamientos mixtos
 * de la semana siguiente para cada usuario con generación automática activada,
 * según sus días de entreno, su día de tirada larga y su progreso previo.
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-workouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const params = weeklyWorkoutParams.safeParse(Object.fromEntries(url.searchParams));
        if (!params.success) return Response.json({ error: "Invalid query parameters" }, { status: 400 });
        const { userId, limit } = params.data;
        const force = params.data.force === "1" || Boolean(userId);
        const { date: madrid, allowed, hour, mondayISO, untilSunday, from } = weeklyWorkoutWindow(new Date());
        const window = { mondayISO, untilSunday };
        if (!force && !allowed) {
          return Response.json({ ok: true, skipped: true, hour, processed: 0, window, results: [] });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateWorkoutsCore } = await import("@/lib/workouts-gen.server");

        let usersQuery = supabaseAdmin
          .from("profiles")
          .select("id, weekly_training_days, weekly_long_ride_day, weekly_bike_type, weekly_duration_minutes, weekly_target_basis, weekly_last_generated_at, nutrition_plan_enabled, nutrition_goal")
          .is("deactivated_at", null)
          .order("id");
        usersQuery = userId ? usersQuery.eq("id", userId) : usersQuery.eq("weekly_auto_enabled", true);
        const { data: users, error } = await usersQuery;
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }

        const results: any[] = [];
        let processed = 0;
        for (const u of users ?? []) {
          if (processed >= limit) break;
          const days = ((u as any).weekly_training_days ?? []).map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6);
          if (!days.length) continue;

          try {
            // Idempotencia por calendario real; una marca antigua no bloquea una semana vacía.
            if (!force) {
              const { data: existing, error: existingError } = await supabaseAdmin
                .from("workouts")
                .select("id")
                .eq("user_id", u.id)
                .gte("plan->>scheduled_date", mondayISO)
                .lte("plan->>scheduled_date", untilSunday)
                .limit(1);
              if (existingError) throw existingError;
              if (existing?.length) {
                results.push({ user: u.id, skipped: true, reason: "workouts_exist" });
                continue;
              }
            }
            processed++;
            const inserted = await generateWorkoutsCore(supabaseAdmin, u.id, {
              bike_type: (u as any).weekly_bike_type ?? "carretera",
              duration_minutes: (u as any).weekly_duration_minutes ?? 60,
              target_basis: (u as any).weekly_target_basis === "hr" ? "hr" : "power",
              training_days: days,
              long_ride_day: (u as any).weekly_long_ride_day ?? null,
              max_count: days.length,
              from,
              until: untilSunday,
              nutrition_goal: (u as any).nutrition_plan_enabled ? ((u as any).nutrition_goal ?? "mantenimiento") : null,
            });

            // Plan nutricional de la semana siguiente
            if ((u as any).nutrition_plan_enabled) {
              try {
                const { generateWeeklyNutritionCore } = await import("@/lib/nutrition-gen.server");
                await generateWeeklyNutritionCore(supabaseAdmin, u.id, {
                  goal: (u as any).nutrition_goal ?? "mantenimiento",
                  week_start: mondayISO,
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
          let restQuery = supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("weekly_auto_enabled", false)
            .is("deactivated_at", null);
          if (userId) restQuery = restQuery.eq("id", userId);
          const { data: rest } = await restQuery;
          for (const p of rest ?? []) await sendWeeklySummary(supabaseAdmin, (p as any).id);
        } catch (e) { console.error("weekly-summary-rest", e); }

        return new Response(JSON.stringify({ ok: true, date: madrid, users: processed, processed, window, results }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
