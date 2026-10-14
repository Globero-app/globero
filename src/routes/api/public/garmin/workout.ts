import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/garmin/workout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { json, deviceIdOk, activeDeviceUser, compactWorkout } = await import("@/lib/garmin-ciq.server");
        const deviceId = request.headers.get("x-device-id") ?? new URL(request.url).searchParams.get("device_id");
        if (!deviceIdOk(deviceId)) return json({ error: "invalid_device_id" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const userId = await activeDeviceUser(supabaseAdmin, deviceId);
        if (!userId) return json({ error: "device_not_linked" }, 401);
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
        const { data } = await supabaseAdmin.from("workouts").select("id, plan, duration_minutes, training_type, status")
          .eq("user_id", userId).eq("plan->>scheduled_date", today).neq("status", "completed").limit(1).maybeSingle();
        if (!data) return json({ has_workout: false });
        return json(compactWorkout(data));
      },
    },
  },
});
