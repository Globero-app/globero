export type SubscriptionAccess = {
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  admin_grant_active?: boolean;
  deactivated_at?: string | null;
};

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