/** Safe to call during SSR; inspect the runtime only after hydration or in handlers. */
export function isMobileContainer(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & {
    Capacitor?: { getPlatform?: () => string };
  }).Capacitor;
  return !!capacitor && typeof capacitor.getPlatform === "function" && capacitor.getPlatform() !== "web";
}

export const EXTERNAL_SUBSCRIPTION_URL = "https://coach.globero.app/perfil?tab=subscription";

export async function openExternalSubscription(): Promise<void> {
  if (typeof window === "undefined" || isMobileContainer()) return;
  window.open(EXTERNAL_SUBSCRIPTION_URL, "_blank", "noopener,noreferrer");
}
