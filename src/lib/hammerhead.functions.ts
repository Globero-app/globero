import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const HAMMERHEAD_REDIRECT = "https://globero.app/auth/hammerhead/callback";

/** URL de autorización OAuth de Hammerhead con state firmado (HMAC). */
export const createHammerheadAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
    const clientId = process.env["HAMMERHEAD_CLIENT_ID"];
    if (!secret) throw new Error("Falta la configuración de seguridad del enlace");
    if (!clientId) throw new Error("Falta configurar Hammerhead (Client ID)");
    const payload = `${context.userId}.${Date.now() + 5 * 60 * 1000}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const encoded = btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: HAMMERHEAD_REDIRECT,
      response_type: "code",
      scope: "activity:read workout:write metrics:write",
      state: `${payload}.${encoded}`,
    });
    return { url: `https://api.hammerhead.io/v1/auth/oauth/authorize?${params.toString()}` };
  });

/** Desconecta Hammerhead Karoo. */
export const disconnectHammerhead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ hammerhead_user_id: null, hammerhead_access_token: null, hammerhead_refresh_token: null, hammerhead_token_expires_at: null } as any)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
