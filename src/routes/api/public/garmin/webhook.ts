// Webhook de Garmin (modo PING): recibe avisos de actividades y desautorizaciones.
// Las actividades se descargan desde la callbackURL de Garmin con el token del usuario (no se confía en el payload).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/garmin/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("bad request", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { garminTokenFor, storeGarminActivities } = await import("@/lib/devices.server");

        for (const d of (body?.deregistrations ?? []) as any[]) {
          if (!d?.userId) continue;
          // Verifica con Garmin que el usuario ya no está registrado antes de desconectar
          const token = await garminTokenFor(supabaseAdmin, String(d.userId));
          if (token) {
            const r = await fetch("https://apis.garmin.com/wellness-api/rest/user/id", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
            if (r?.ok) continue;
          }
          await supabaseAdmin
            .from("profiles")
            .update({ garmin_user_id: null, garmin_access_token: null, garmin_refresh_token: null, garmin_token_expires_at: null } as any)
            .eq("garmin_user_id" as any, String(d.userId));
        }

        const pings = [...((body?.activities ?? []) as any[]), ...((body?.activityDetails ?? []) as any[])];
        for (const p of pings) {
          try {
            if (!p?.userId || !p?.callbackURL) continue;
            const cb = new URL(p.callbackURL);
            if (cb.protocol !== "https:" || cb.hostname !== "apis.garmin.com") continue;
            const token = await garminTokenFor(supabaseAdmin, String(p.userId));
            if (!token) continue;
            const r = await fetch(cb.toString(), { headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) continue;
            const data = await r.json();
            const acts = (Array.isArray(data) ? data : [data]).map((a: any) => a?.summary ?? a);
            await storeGarminActivities(supabaseAdmin, String(p.userId), acts);
          } catch (e) {
            console.error("[garmin webhook]", e);
          }
        }
        return new Response("ok");
      },
    },
  },
});
