import { createFileRoute } from "@tanstack/react-router";

/** Cron cada 5 min: avisa a los contactos si una baliza activa/SOS lleva >30 min sin posición. */
export const Route = createFileRoute("/api/public/hooks/beacon-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendBeaconEmails } = await import("@/lib/beacon-email.server");
        const now = new Date();
        const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
        const { data: beacons } = await (supabaseAdmin as any).from("safety_beacons")
          .select("id,user_id,share_token,last_lat,last_lon,last_seen_at,battery_pct,started_at")
          .in("status", ["active", "sos"]).gt("expires_at", now.toISOString()).is("stale_alerted_at", null)
          .or(`last_seen_at.lt.${cutoff},and(last_seen_at.is.null,started_at.lt.${cutoff})`);
        let alerted = 0;
        for (const b of beacons ?? []) {
          await (supabaseAdmin as any).from("safety_beacons").update({ stale_alerted_at: now.toISOString() }).eq("id", b.id);
          const { data: contacts } = await (supabaseAdmin as any).from("emergency_contacts").select("email").eq("user_id", b.user_id);
          if (!contacts?.length) continue;
          const { data: prof } = await supabaseAdmin.from("profiles").select("full_name,email").eq("id", b.user_id).maybeSingle();
          try {
            await sendBeaconEmails({ kind: "stale", riderName: prof?.full_name || prof?.email || "", beacon: b, contacts, link: `https://coach.globero.app/live/${b.share_token}` });
            alerted++;
          } catch (e) { console.error("[beacon-watchdog]", e); }
        }
        return Response.json({ checked: beacons?.length ?? 0, alerted });
      },
    },
  },
});
