export type SubscriptionAccess = {
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  admin_grant_active?: boolean;
  deactivated_at?: string | null;
};

/** Preventive notice during the final five days of the 30-day trial. */
export function trialWarningDays(profile: SubscriptionAccess | null, now = new Date()): number | null {
  if (!profile || profile.deactivated_at || profile.admin_grant_active || profile.subscription_status === "active" || !profile.trial_ends_at) return null;
  const remaining = new Date(profile.trial_ends_at).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 5 * 86400000) return null;
  return Math.ceil(remaining / 86400000);
}

export function canGenerate(profile: SubscriptionAccess | null, now = new Date()): boolean {
  if (!profile || profile.deactivated_at) return false;
  return profile.admin_grant_active === true || profile.subscription_status === "active" ||
    (!!profile.trial_ends_at && new Date(profile.trial_ends_at).getTime() > now.getTime());
}

export function subscriptionLabel(profile: SubscriptionAccess): string {
  if (profile.admin_grant_active) return "Gratuita (administrador)";
  if (profile.subscription_status === "active") return "Suscripción activa";
  if (canGenerate(profile)) return "Prueba gratuita";
  return "Sin suscripción activa";
}