import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/** Reprocesa el último test FTP completado del usuario autenticado (bearer). */
export const Route = createFileRoute("/api/public/hooks/ftp-reprocess")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u } = await supabase.auth.getUser(token);
        if (!u?.user) return new Response("Unauthorized", { status: 401 });
        const userId = u.user.id;
        const { data: w } = await supabase
          .from("workouts").select("id").eq("user_id", userId).eq("status", "completed")
          .eq("plan->>is_ftp_test", "true").order("completed_at", { ascending: false }).limit(1).maybeSingle();
        if (!w) return Response.json({ ok: false, reason: "no_test" });
        const { generateAndNotifyWorkoutReport } = await import("@/lib/workout-report.server");
        const ok = await generateAndNotifyWorkoutReport(supabase, userId, w.id);
        return Response.json({ ok, workoutId: w.id });
      },
    },
  },
});
