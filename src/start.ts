import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const err = error as any;
      await supabaseAdmin.from("error_log").insert({
        source: "server",
        message: String(err?.message ?? err).slice(0, 500),
        stack: err?.stack ? String(err.stack).slice(0, 2000) : null,
      } as any);
    } catch (e) {
      console.error("[error-log]", e);
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
