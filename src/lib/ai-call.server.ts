/* Llamada única al AI Gateway: modelo por defecto, tool-calling opcional
   y registro de uso en ai_usage_log para medir el gasto mensual. */

const MODEL = "openai/gpt-5.6-sol";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface AiCallMeta {
  fn: string; // nombre corto de la función que llama (p.ej. "readiness-adapt")
  userId?: string | null;
}

function logUsage(meta: AiCallMeta | undefined, usage: any) {
  try {
    const run = async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_usage_log").insert({
        user_id: meta?.userId ?? null,
        fn: meta?.fn ?? "unknown",
        model: MODEL,
        prompt_tokens: Number(usage?.prompt_tokens ?? 0) || 0,
        completion_tokens: Number(usage?.completion_tokens ?? 0) || 0,
      });
    };
    void run().catch(() => {});
  } catch {
    /* nunca romper la llamada por el log */
  }
}

export async function callAI(messages: any[], schema?: any, meta?: AiCallMeta): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY no configurada");
  const { getUserLang, langInstruction } = await import("./user-lang.server");
  const li = langInstruction(await getUserLang(meta?.userId));
  const body: any = {
    model: MODEL,
    messages: li ? [...messages, { role: "system", content: li }] : messages,
    // GPT-5.6 en chat/completions exige reasoning_effort "none" cuando hay tools.
    reasoning_effort: "none",
  };
  if (schema) {
    body.tools = [{ type: "function", function: { name: "respond", description: "Respuesta estructurada", parameters: schema } }];
    body.tool_choice = { type: "function", function: { name: "respond" } };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Demasiadas peticiones a la IA. Espera unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de IA disponibles.");
    throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  logUsage(meta, json.usage);
  const msg = json.choices?.[0]?.message;
  if (schema && msg?.tool_calls?.[0]?.function?.arguments) {
    return JSON.parse(msg.tool_calls[0].function.arguments);
  }
  return msg?.content ?? "";
}
