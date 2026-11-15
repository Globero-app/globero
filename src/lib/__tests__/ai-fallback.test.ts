import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { unavailableModelReason } from "../ai-fallback";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), catalog: vi.fn(), upsert: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("@lovable.dev/ai-gateway", async (original) => ({
  ...await original<typeof import("@lovable.dev/ai-gateway")>(),
  generateChatCompletion: mocks.generate, listModels: mocks.catalog,
}));
vi.mock("../user-lang.server", () => ({ getUserLang: async () => "es", langInstruction: () => "Responde en español." }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({
  upsert: mocks.upsert, insert: mocks.insert,
  update: (value: unknown) => { mocks.update(value); return { eq: () => ({ eq: async () => ({}) }) }; },
}) } }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LOVABLE_API_KEY = "test";
  mocks.catalog.mockResolvedValue({ workspace_models: "included", data: [{ id: "openai/gpt-5.6-terra", supported_surfaces: ["chat-completions"] }] });
  mocks.generate.mockResolvedValue({ model: "openai/gpt-5.6-terra", choices: [{ message: { content: "listo" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
  mocks.upsert.mockResolvedValue({ error: null }); mocks.insert.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

describe("reserva automática", () => {
  it.each(["model_retired", "model_not_found", "model_unavailable"])("%s activa una sola reserva y registra ambos modelos", async (code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code } }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "hola" }], undefined, { fn: "daily-brief" })).resolves.toBe("listo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ model: "openai/gpt-5.6-terra", reasoning_effort: "none", max_completion_tokens: 4000 });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ primary_model: "openai/gpt-6-luna", fallback_model: "openai/gpt-5.6-terra", active: true }), { onConflict: "primary_model" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5.6-terra" }));
  });

  it("conserva herramientas y límite explícito, y valida el JSON de la reserva", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"model_retired"}}', { status: 410 })));
    mocks.generate.mockResolvedValue({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { arguments: '{"scheduled_date":"2026-11-16"}' } }] } }] });
    const schema = { type: "object", properties: { scheduled_date: { type: "string" } }, required: ["scheduled_date"] };
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "mañana" }], schema, { fn: "telegram-modify", maxTokens: 1200 }))
      .resolves.toEqual({ scheduled_date: "2026-11-16" });
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ max_completion_tokens: 1200, tools: [{ type: "function", function: { parameters: schema } }], tool_choice: { type: "function", function: { name: "respond" } } });
  });

  it.each([400, 402, 403, 429, 503])("no sustituye por error genérico %s ni denegación", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"permission_denied"}}', { status })));
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([], undefined, { fn: "t" }, [])).rejects.toThrow();
    expect(mocks.catalog).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("no sustituye después de un fallo de red de resultado desconocido", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([])).rejects.toThrow("network"); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each(["public_only", "public_only_invalid_key"])("no usa una reserva sin catálogo de workspace: %s", async (workspace_models) => {
    mocks.catalog.mockResolvedValue({ workspace_models, data: [{ id: "openai/gpt-5.6-terra", supported_surfaces: ["chat-completions"] }] });
    const { callFallback } = await import("../ai-fallback.server");
    await expect(callFallback([], undefined, 16000)).rejects.toThrow("reserva compatible"); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("no usa reservas ausentes o incompatibles", async () => {
    mocks.catalog.mockResolvedValue({ workspace_models: "included", data: [{ id: "openai/gpt-5.6-terra", supported_surfaces: ["responses"] }] });
    const { callFallback } = await import("../ai-fallback.server");
    await expect(callFallback([], undefined, 16000)).rejects.toThrow("reserva compatible"); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("no encadena más reservas si falla la primera", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"model_retired"}}', { status: 410 })));
    mocks.generate.mockRejectedValue(new Error("reserva fallida"));
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([])).rejects.toThrow("reserva fallida"); expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("desactiva el aviso si vuelve a funcionar el principal sin cambiar su modelo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"ok"}}]}'));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([])).resolves.toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("openai/gpt-5.6-sol");
    expect(mocks.update).toHaveBeenCalledWith({ active: false }); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("una respuesta truncada de la reserva no devuelve un plan incompleto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"model_retired"}}', { status: 410 })));
    mocks.generate.mockResolvedValue({ choices: [{ finish_reason: "length", message: { content: '{}' } }] });
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([], { type: "object" })).rejects.toThrow("No se ha guardado el plan");
  });

  it("distingue retirada de no disponibilidad sin confundir permisos", () => {
    expect(unavailableModelReason(410, { error: { message: "This model has been retired" } })).toBe("retired");
    expect(unavailableModelReason(404, { error: { code: "model_not_found" } })).toBe("unavailable");
    expect(unavailableModelReason(403, { error: { code: "model_retired" } })).toBeNull();
  });
});