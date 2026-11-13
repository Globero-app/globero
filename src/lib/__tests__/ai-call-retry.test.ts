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

describe("selección de modelo de callAI", () => {
  it.each(["telegram-intent", "daily-brief", "meal-swap", "recipe-swap", "telegram-meal", "telegram-modify"])(
    "%s usa GPT-6 Luna",
    async (fn) => {
      const { resolveModel, callAI } = await import("../ai-call.server");
      expect(resolveModel({ fn })).toBe("openai/gpt-6-luna");
      const fetchMock = vi.fn().mockResolvedValue(ok("listo"));
      vi.stubGlobal("fetch", fetchMock);
      await callAI([{ role: "user", content: "hola" }], undefined, { fn });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("openai/gpt-6-luna");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe("none");
    },
  );

  it.each(["workouts-gen", "nutrition-week", "menu-gen", "workout-custom", "workout-report", "unknown"])(
    "%s conserva el modelo complejo",
    async (fn) => {
      const { resolveModel } = await import("../ai-call.server");
      expect(resolveModel({ fn })).toBe("openai/gpt-5.6-sol");
    },
  );

  it("respeta el modelo explícito y el modelo por defecto sin metadatos", async () => {
    const { resolveModel } = await import("../ai-call.server");
    expect(resolveModel({ fn: "recipe-swap", model: "openai/gpt-5.6-sol" })).toBe("openai/gpt-5.6-sol");
    expect(resolveModel()).toBe("openai/gpt-5.6-sol");
  });

  it.each(["telegram-intent", "telegram-modify"])(
    "%s admite herramientas estructuradas con GPT-6 Luna sin minimal",
    async (fn) => {
      const fetchMock = vi.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        if (body.reasoning_effort !== "none") {
          return Promise.resolve(response(400, { error: { message: "Unsupported reasoning_effort" } }));
        }
        return Promise.resolve(response(200, {
          choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { arguments: '{"scheduled_date":"2026-11-14"}' } }] } }],
        }));
      });
      vi.stubGlobal("fetch", fetchMock);
      const { callAI } = await import("../ai-call.server");
      const schema = {
        type: "object", properties: { scheduled_date: { type: "string" } }, required: ["scheduled_date"],
      };
      await expect(callAI([{ role: "user", content: "Cambia el entrenamiento de hoy a mañana" }], schema, {
        fn, model: "openai/gpt-6-luna",
      })).resolves.toEqual({ scheduled_date: "2026-11-14" });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("openai/gpt-6-luna");
      expect(body.reasoning_effort).toBe("none");
      expect(body.max_completion_tokens).toBe(4000);
      expect(body.tool_choice).toEqual({ type: "function", function: { name: "respond" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

describe("reintentos de callAI", () => {
  it("rechaza una respuesta truncada sin reintentar ni devolver JSON parcial", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      choices: [{ finish_reason: "length", message: { tool_calls: [{ function: { arguments: '{"workouts":[]}' } }] } }],
      usage: { completion_tokens: 16000 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("../ai-call.server");
    await expect(callAI([{ role: "user", content: "plan" }], { type: "object" }, { fn: "workouts-gen" }))
      .rejects.toThrow("No se ha guardado el plan");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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
