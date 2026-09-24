/* Idioma preferido del usuario para contenido generado (IA, avisos). */
const NAMES: Record<string, string> = { es: "castellano", ca: "catalán", fr: "francés", en: "inglés", de: "alemán" };

export async function getUserLang(userId?: string | null): Promise<string> {
  if (!userId) return "es";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("language").eq("id", userId).maybeSingle();
    return ((data as any)?.language as string) || "es";
  } catch {
    return "es";
  }
}

export function langInstruction(lang: string): string | null {
  if (!lang || lang === "es") return null;
  return `IDIOMA OBLIGATORIO: escribe TODOS los textos visibles para el usuario (títulos, descripciones, resúmenes, consejos, mensajes) en ${NAMES[lang] ?? lang}. Mantén los valores de enumeraciones y claves técnicas del esquema tal cual.`;
}
