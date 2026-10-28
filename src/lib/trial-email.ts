export const SUBSCRIPTION_EMAIL_URL = "https://coach.globero.app/perfil?tab=subscription";

export function trialEmailDue(profile: {
  trial_ends_at: string;
  subscription_status: string;
  admin_grant_active: boolean;
  deactivated_at: string | null;
}, now = Date.now()): "trial-day-25" | "trial-expired" | null {
  if (profile.deactivated_at || profile.admin_grant_active || profile.subscription_status === "active") return null;
  const end = Date.parse(profile.trial_ends_at);
  if (!Number.isFinite(end)) return null;
  const day = 86400000;
  if (now >= end && now < end + day) return "trial-expired";
  if (now >= end - 5 * day && now < end - 4 * day) return "trial-day-25";
  return null;
}