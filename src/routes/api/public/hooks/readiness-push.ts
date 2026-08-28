import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron cada 5 min. La hora base la marca `readiness_push_hour` (Europa/Madrid):
 *  - minuto 0-4  → notificación de Readiness
 *  - minuto 5-9  → 1ª notificación adicional activada
 *  - minuto 10-14 → 2ª notificación adicional… (escalonadas cada 5 min)
 *
 * Auth: header `apikey` debe coincidir con SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/hooks/readiness-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false,
        }).formatToParts(now);
        const madridHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
        const madridMinute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
        const slot = Math.floor(madridMinute / 5); // 0 = readiness, 1..n = extras
        const madridDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { notifyUser } = await import("@/lib/web-push.server");

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, readiness_push_enabled, notify_training_push, notify_prerace_push, notify_maintenance_push, notify_daily_brief, notify_fatigue_alerts")
          .eq("readiness_push_hour", madridHour);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }
        if (!users || users.length === 0) {
          return new Response(JSON.stringify({ ok: true, matched: 0, hour: madridHour, slot }), { headers: { "content-type": "application/json" } });
        }

        // ── Slot 0: Readiness ─────────────────────────────────────────────
        if (slot === 0) {
          const enabled = users.filter((u: any) => u.readiness_push_enabled);
          if (!enabled.length) {
            return new Response(JSON.stringify({ ok: true, slot, notified_users: 0 }), { headers: { "content-type": "application/json" } });
          }
          const ids = enabled.map((u: any) => u.id);
          const { data: already } = await supabaseAdmin
            .from("readiness_entries")
            .select("user_id")
            .eq("entry_date", madridDate)
            .in("user_id", ids);
          const done = new Set((already ?? []).map((r: any) => r.user_id));
          const targets = enabled.filter((u: any) => !done.has(u.id));

          let sent = 0;
          for (const u of targets) {
            sent += await notifyUser(u.id, {
              title: "🚴 ¿Cómo te encuentras hoy?",
              body: "1 Nada preparado · 2 Paseo relajado · 3 Entreno normal · 4 Entreno exigente · 5 Dar lo máximo",
              tag: `readiness-${madridDate}`,
              url: "/readiness",
              requireInteraction: true,
              actions: [
                { action: "readiness-1", title: "1" },
                { action: "readiness-3", title: "3" },
                { action: "readiness-5", title: "5" },
              ],
            });
          }
          return new Response(
            JSON.stringify({ ok: true, slot, hour: madridHour, matched: users.length, notified_users: targets.length, push_sent: sent }),
            { headers: { "content-type": "application/json" } },
          );
        }

        // ── Slots 1..n: notificaciones adicionales, en orden fijo ─────────
        const ORDER = ["notify_daily_brief", "notify_prerace_push", "notify_maintenance_push", "notify_fatigue_alerts"] as const;
        let sent = 0;
        let notified = 0;

        for (const u of users as any[]) {
          const active = ORDER.filter((k) => u[k]);
          const key = active[slot - 1];
          if (!key) continue;

          if (key === "notify_daily_brief") {
            const { sendDailyBrief } = await import("@/lib/coach.server");
            const ok = await sendDailyBrief(supabaseAdmin, u.id);
            if (ok) { sent += 1; notified++; }
          } else if (key === "notify_fatigue_alerts") {
            const { runCoachAlerts } = await import("@/lib/coach.server");
            const res = await runCoachAlerts(supabaseAdmin, u.id, true);
            if (res.notified) { sent += res.notified; notified++; }
          } else if (key === "notify_prerace_push") {
            const { data: comps } = await supabaseAdmin
              .from("competitions")
              .select("id, name, date, hydration_plan, weather_forecast")
              .eq("user_id", u.id)
              .gte("date", madridDate)
              .order("date", { ascending: true })
              .limit(1);
            const c: any = comps?.[0];
            if (!c) continue;
            const days = Math.round(
              (new Date(`${c.date}T00:00:00Z`).getTime() - new Date(`${madridDate}T00:00:00Z`).getTime()) / 86400000,
            );
            if (days < 0 || days > 3) continue;
            const when = days === 0 ? "hoy" : days === 1 ? "mañana" : `${days} días`;
            const hp = c.hydration_plan as any;
            const wf = c.weather_forecast as any;
            const body = hp
              ? `${c.name} ${days === 0 ? "es hoy" : `en ${when}`}. Plan: ${hp.fluid_ml_per_hour} ml/h + ${hp.sodium_mg_per_hour} mg sodio${wf ? ` · ${Math.round(wf.apparent_max_c)}°C` : ""}.`
              : `${c.name} ${days === 0 ? "es hoy" : `en ${when}`}. Revisa hidratación y avituallamiento.`;
            sent += await notifyUser(u.id, {
              title: "💧 Recordatorio pre-carrera",
              body,
              tag: `prerace-${c.id}-${madridDate}`,
              url: `/competiciones/${c.id}`,
            });
            notified++;
          } else if (key === "notify_maintenance_push") {
            const [{ data: bikes }, { data: comps }] = await Promise.all([
              supabaseAdmin.from("bikes").select("id, name, current_km").eq("user_id", u.id),
              supabaseAdmin.from("bike_components").select("id, bike_id, component_type, name, install_km, lifespan_km, active").eq("user_id", u.id),
            ]);
            const byBike = new Map((bikes ?? []).map((b: any) => [b.id, b]));
            const alerts = ((comps ?? []) as any[])
              .filter((c) => c.active && byBike.has(c.bike_id))
              .map((c) => {
                const bike: any = byBike.get(c.bike_id);
                const used = Math.max(0, Number(bike.current_km) - Number(c.install_km));
                const remaining = Number(c.lifespan_km) - used;
                const pct = Number(c.lifespan_km) > 0 ? (used / Number(c.lifespan_km)) * 100 : 0;
                return { bikeName: bike.name, componentLabel: c.name ?? c.component_type, remaining, pct };
              })
              .filter((a) => a.pct >= 85)
              .sort((a, b) => a.remaining - b.remaining);
            if (!alerts.length) continue;
            const top = alerts[0]!;
            sent += await notifyUser(u.id, {
              title: "🔧 Mantenimiento de material",
              body: `${top.bikeName} · ${top.componentLabel}: ${top.remaining <= 0 ? "vencido" : `quedan ${Math.round(top.remaining)} km`}${alerts.length > 1 ? ` (+${alerts.length - 1} más)` : ""}`,
              tag: `maintenance-${madridDate}`,
              url: "/material",
            });
            notified++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, slot, hour: madridHour, matched: users.length, notified_users: notified, push_sent: sent }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
