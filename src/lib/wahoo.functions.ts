import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Crea la URL de autorización de Wahoo con un state firmado (HMAC). */
export const createWahooAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
    const clientId = process.env["WAHOO_CLIENT_ID"];
    if (!secret) throw new Error("Falta la configuración de seguridad del enlace");
    if (!clientId) throw new Error("Falta configurar Wahoo (Client ID)");

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = `${context.userId}.${expiresAt}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const encoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://globero.app/auth/wahoo/callback",
      response_type: "code",
      scope: "user_read workouts_read plans_read plans_write offline_data",
      state: `${payload}.${encoded}`,
    });
    return { url: `https://api.wahooligan.com/oauth/authorize?${params.toString()}` };
  });

/** Desconecta la cuenta de Wahoo del usuario. */
export const disconnectWahoo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ wahoo_user_id: null, wahoo_access_token: null, wahoo_refresh_token: null, wahoo_token_expires_at: null } as any)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
