import { trialEmailDue } from "./trial-email";

export async function sendTrialAccountNotice(userId: string, expected?: { kind: "trial-day-25" | "trial-expired"; trialEnd: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin.from("profiles")
    .select("full_name,trial_ends_at,subscription_status,admin_grant_active,deactivated_at")
    .eq("id", userId).maybeSingle();
  if (error) throw new Error("Account check failed");
  if (!profile) return { skipped: true };
  const kind = trialEmailDue(profile);
  if (!kind || (expected && (expected.kind !== kind || Date.parse(expected.trialEnd) !== Date.parse(profile.trial_ends_at)))) return { skipped: true };
  const { data: auth, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError) throw new Error("Account check failed");
  if (!auth.user?.email || !auth.user.email_confirmed_at) return { skipped: true };
  const { sendTemplateEmail } = await import("./email-templates/send-email");
  const result = await sendTemplateEmail(kind, auth.user.email, {
    templateData: { name: profile.full_name?.slice(0, 150), trialEnd: new Date(profile.trial_ends_at).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) },
    idempotencyKey: `${kind}:${userId}:${profile.trial_ends_at}`,
  });
  return { sent: result.sent };
}