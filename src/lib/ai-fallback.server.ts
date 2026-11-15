import { generateChatCompletion, listModels, GatewayError, type OpenAIChatMessage } from "@lovable.dev/ai-gateway";
import type { Json } from "@/integrations/supabase/types";

// Same chat surface, tools and none reasoning, unlike the default Astra contract.
export const FALLBACK_MODEL = "openai/gpt-5.6-terra";

export async function callFallback(messages: OpenAIChatMessage[], schema: Record<string, unknown> | undefined, maxTokens: number) {
  const catalog = await listModels();
  const candidate = catalog.data.find((model) => model.id === FALLBACK_MODEL);
  if (catalog.workspace_models !== "included" || !candidate?.supported_surfaces.includes("chat-completions") ||
      candidate.deprecated === true || (typeof candidate.expiration_date === "number" && candidate.expiration_date * 1000 <= Date.now())) {
    throw new Error("El modelo principal no está disponible y tampoco hay un modelo de reserva compatible. Revisa la configuración de IA.");
  }
  try {
    return await generateChatCompletion({
      model: FALLBACK_MODEL,
      messages,
      reasoning_effort: "none",
      max_completion_tokens: maxTokens,
      ...(schema ? {
        tools: [{ type: "function" as const, function: { name: "respond", description: "Respuesta estructurada", parameters: schema } }],
        tool_choice: { type: "function" as const, function: { name: "respond" } },
      } : {}),
    });
  } catch (error) {
    if (error instanceof GatewayError) console.error("AI fallback", error.toJSON());
    throw error; // SDK owns safe retries; no second inference after unknown outcomes.
  }
}

export async function recordFallback(primary: string, reason: "retired" | "unavailable") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_model_fallbacks").upsert({
    primary_model: primary, fallback_model: FALLBACK_MODEL, reason, active: true,
  }, { onConflict: "primary_model" });
  if (error) console.error("No se pudo registrar el aviso de reserva de IA", error.code);
}

export async function clearFallback(primary: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("ai_model_fallbacks").update({ active: false }).eq("primary_model", primary).eq("active", true);
}