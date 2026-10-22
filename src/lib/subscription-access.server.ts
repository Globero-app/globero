import { canGenerate } from "./subscription-access";

export async function requireGenerationAccess(supabase: any, userId: string) {
  const { data, error } = await supabase.from("profiles")
    .select("trial_ends_at,subscription_status,admin_grant_active,deactivated_at")
    .eq("id", userId).maybeSingle();
  if (error) throw new Error("No se pudo comprobar la suscripción");
  if (!canGenerate(data)) throw new Error("Tu prueba gratuita ha finalizado. Activa una suscripción en Ajustes para generar entrenamientos y menús.");
}