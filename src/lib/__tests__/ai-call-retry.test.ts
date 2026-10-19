import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserLang } = vi.hoisted(() => ({ getUserLang: vi.fn().mockResolvedValue("es") }));
vi.mock("../user-lang.server", async (original) => ({
  ...await original<typeof import("../user-lang.server")>(), getUserLang,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({}) }) },
}));

function response(status: number, body: any = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ok = (content: string) =>
  response(200, { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });

beforeEach(() => {
  process.env.LOVABLE_API_KEY = "test-key";
  getUserLang.mockResolvedValue("es");
});

afterEach(() => vi.unstubAllGlobals());

describe("reintentos de callAI", () => {
  it("reintenta 429 y 503 con backoff y devuelve la respuesta al recuperar", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(ok("listo"));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "hola" }], undefined, { fn: "t" }, [1, 2, 4]))
      .resolves.toBe("listo");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("espera 1s, 2s y 4s y propaga el error tras agotar los tres reintentos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503, { error: "caído" }));
    const sleeps: number[] = [];
    vi.stubGlobal("fetch", fetchMock);
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      sleeps.push(Number(ms ?? 0));
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as any);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "hola" }], undefined, { fn: "t" }))
      .rejects.toThrow("AI 503:");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    timeout.mockRestore();
  });

  it("no reintenta errores terminales como 400 o 402", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(402, { message: "sin créditos" }));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "hola" }], undefined, { fn: "t" }, [1, 2, 4]))
      .rejects.toThrow("Sin créditos de IA disponibles.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respeta Retry-After cuando el gateway lo indica", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "3" } }))
      .mockResolvedValueOnce(ok("ok"));
    const waits: number[] = [];
    vi.stubGlobal("fetch", fetchMock);
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      waits.push(Number(ms ?? 0));
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as any);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "hola" }], undefined, { fn: "t" }, [1000, 2000, 4000]))
      .resolves.toBe("ok");
    expect(waits).toEqual([3000]);
    timeout.mockRestore();
  });
});
