import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/hooks/trial-account-notice")({
  server: { handlers: { POST: async ({ request }) => {
    const { verifyCronRequest } = await import("@/lib/cron-auth.server");
    if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });
    const parsed = z.object({ userId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid request", { status: 400 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin.from("profiles")
      .select("full_name,trial_ends_at,subscription_status,admin_grant_active,deactivated_at")
      .eq("id", parsed.data.userId).maybeSingle();
    if (error) return new Response("Account check failed", { status: 503 });
    if (!profile) return Response.json({ skipped: true });
    const { trialEmailDue } = await import("@/lib/trial-email");
    const kind = trialEmailDue(profile);
    if (!kind) return Response.json({ skipped: true });
    const { data: auth, error: authError } = await supabaseAdmin.auth.admin.getUserById(parsed.data.userId);
    if (authError) return new Response("Account check failed", { status: 503 });
    if (!auth.user?.email || !auth.user.email_confirmed_at) return Response.json({ skipped: true });
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    try {
      const result = await sendTemplateEmail(kind, auth.user.email, {
        templateData: { name: profile.full_name?.slice(0, 150), trialEnd: new Date(profile.trial_ends_at).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) },
        idempotencyKey: `${kind}:${parsed.data.userId}:${profile.trial_ends_at}`,
      });
      return Response.json({ sent: result.sent });
    } catch {
      return new Response("Notification temporarily unavailable", { status: 503 });
    }
  } } },
});