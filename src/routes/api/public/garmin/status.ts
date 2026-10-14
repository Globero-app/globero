import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/garmin/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { json, deviceIdOk, activeDeviceUser } = await import("@/lib/garmin-ciq.server");
        const url = new URL(request.url);
        const code = url.searchParams.get("code")?.trim().toUpperCase();
        const deviceId = url.searchParams.get("device_id");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (code) {
          if (!/^[A-Z0-9]{4}$/.test(code)) return json({ error: "invalid_code" }, 400);
          const { data } = await supabaseAdmin.from("garmin_pairing_codes").select("user_id, expires_at").eq("pairing_code", code).maybeSingle();
          if (data?.user_id) return json({ status: "linked", linked: true });
          if (!data || new Date(data.expires_at).getTime() < Date.now()) return json({ status: "expired", linked: false });
          return json({ status: "pending", linked: false });
        }
        if (deviceIdOk(deviceId)) {
          const linked = !!(await activeDeviceUser(supabaseAdmin, deviceId));
          return json({ status: linked ? "linked" : "pending", linked });
        }
        return json({ error: "missing_code" }, 400);
      },
    },
  },
});
