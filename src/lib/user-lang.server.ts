/* Idioma preferido del usuario para contenido generado (IA, avisos). */
const NAMES: Record<string, string> = { es: "castellano", ca: "catalán", fr: "francés", en: "inglés", de: "alemán" };

export type UserLang = "es" | "ca" | "fr" | "en" | "de";

export function normalizeUserLang(lang?: string | null): UserLang {
  return lang === "ca" || lang === "fr" || lang === "en" || lang === "de" ? lang : "es";
}

export async function getUserLang(userId?: string | null): Promise<UserLang> {
  if (!userId) return "es";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("language").eq("id", userId).maybeSingle();
    return normalizeUserLang((data as any)?.language as string | undefined);
  } catch {
    return "es";
  }
}

export function langInstruction(lang: string): string {
  const normalized = normalizeUserLang(lang);
  return `IDIOMA OBLIGATORIO: escribe TODOS los textos visibles para el usuario (títulos, descripciones, resúmenes, consejos, mensajes) en ${NAMES[normalized]}. Mantén los valores de enumeraciones y claves técnicas del esquema tal cual.`;
}
