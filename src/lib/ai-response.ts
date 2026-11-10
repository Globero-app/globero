export class IncompleteAIResponseError extends Error {
  readonly code = "AI_RESPONSE_INCOMPLETE";
  constructor() {
    super("La IA devolvió una respuesta truncada o incompleta. No se ha guardado el plan; vuelve a intentarlo.");
    this.name = "IncompleteAIResponseError";
  }
}

type Schema = {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
};

/** Validate the actual output, not just the schema sent to the provider. */
export function assertAIShape(value: unknown, schema: Schema): void {
  const fail = () => { throw new IncompleteAIResponseError(); };
  if (schema.enum && !schema.enum.includes(value)) fail();
  switch (schema.type) {
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in record)) fail();
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (key in record) assertAIShape(record[key], child);
      }
      break;
    }
    case "array":
      if (!Array.isArray(value)) return fail();
      if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) fail();
      if (schema.items) for (const item of value) assertAIShape(item, schema.items);
      break;
    case "string":
      if (typeof value !== "string" || value.length > (schema.maxLength ?? Infinity)) fail();
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail();
      break;
    case "boolean":
      if (typeof value !== "boolean") fail();
      break;
  }
}

export function assertPlanDates(value: unknown, key: string, dateKey: string, dates: string[]): void {
  const items = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : null;
  if (!Array.isArray(items) || items.length !== dates.length || items.some((item, i) =>
    !item || typeof item !== "object" || item[dateKey] !== dates[i])) {
    throw new IncompleteAIResponseError();
  }
}

export function parseAIResponse(response: {
  choices?: Array<{ finish_reason?: string | null; message?: {
    content?: string | null;
    tool_calls?: Array<{ function?: { arguments?: string }; custom?: { input: string; name: string } }> | null;
  } }>;
}, schema?: Schema): unknown {
  const choice = response.choices?.[0];
  if (!choice?.message || (choice.finish_reason && !["stop", "tool_calls", "function_call"].includes(choice.finish_reason))) {
    throw new IncompleteAIResponseError();
  }
  if (!schema) {
    if (!choice.message.content?.trim()) throw new IncompleteAIResponseError();
    return choice.message.content;
  }
  const argumentsJson = choice.message.tool_calls?.[0]?.function?.arguments;
  if (!argumentsJson) throw new IncompleteAIResponseError();
  let value: unknown;
  try { value = JSON.parse(argumentsJson); } catch { throw new IncompleteAIResponseError(); }
  assertAIShape(value, schema);
  return value;
}