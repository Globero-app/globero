import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const n = z.coerce.number().min(0).max(100000).optional();
const Body = z.object({
  device_id: z.string().regex(/^[A-Za-z0-9_\-:.]{1,128}$/),
  activity_id: z.string().max(64).optional(),
  start_time: z.string().datetime({ offset: true }).optional(),
  duration: z.coerce.number().int().min(1).max(86400),
  distance: n, avg_power: n, max_power: n, avg_hr: n, max_hr: n, avg_cadence: n, elevation_gain: n, name: z.string().max(120).optional(),
});

export const Route = createFileRoute("/api/public/garmin/activity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, activeDeviceUser } = await import("@/lib/garmin-ciq.server");
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ error: "invalid_body" }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const userId = await activeDeviceUser(supabaseAdmin, body.device_id);
        if (!userId) return json({ error: "device_not_linked" }, 401);

        const { data: profile } = await supabaseAdmin.from("profiles").select("intervals_athlete_id,intervals_api_key,intervals_oauth").eq("id", userId).maybeSingle();
        const { credsFromProfile } = await import("@/lib/intervals.server");
        if (credsFromProfile(profile)) return json({ ok: true, stored: false, reason: "intervals" });

        const start = body.start_time ? new Date(body.start_time) : new Date(Date.now() - body.duration * 1000);
        const id = `garminciq_${body.device_id.slice(0, 40)}_${body.activity_id ?? Math.floor(start.getTime() / 1000)}`;
        const row = {
          id, user_id: userId, name: body.name ?? "Salida Garmin", type: "Ride", start_date: start.toISOString(),
          moving_time: body.duration, distance: body.distance || null, total_elevation_gain: body.elevation_gain || null,
          average_speed: body.distance ? body.distance / body.duration : null,
          average_heartrate: body.avg_hr || null, max_heartrate: body.max_hr || null, average_watts: body.avg_power || null,
          raw: { source: "garmin", ...body }, synced_at: new Date().toISOString(),
        };
        const { filterDuplicateActivities } = await import("@/lib/activity-dedupe.server");
        const rows = await filterDuplicateActivities(supabaseAdmin, userId, [row]);
        if (rows.length) {
          const { error } = await supabaseAdmin.from("intervals_activities").upsert(rows as any, { onConflict: "id" });
          if (error) return json({ error: "save" }, 500);
        }
        try {
          const { detectAndAssign } = await import("@/lib/activity-detect.server");
          await detectAndAssign(supabaseAdmin, userId, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }));
        } catch (e) { console.error("[garmin ciq activity] detect", e); }
        return json({ ok: true, stored: rows.length > 0 });
      },
    },
  },
});
