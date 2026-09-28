import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GARMIN_REDIRECT = "https://globero.app/auth/garmin/callback";

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Indica si Garmin está configurado (claves presentes). */
export const getGarminStatus = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: !!(process.env["GARMIN_CLIENT_ID"] && process.env["GARMIN_CLIENT_SECRET"]),
}));

/** URL de autorización OAuth2 PKCE de Garmin con state firmado. */
export const createGarminAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
    const clientId = process.env["GARMIN_CLIENT_ID"];
    if (!secret) throw new Error("Falta la configuración de seguridad del enlace");
    if (!clientId || !process.env["GARMIN_CLIENT_SECRET"]) throw new Error("Próximamente. Estamos trabajando con Garmin para su implementación.");

    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const payload = `${context.userId}.${Date.now() + 10 * 60 * 1000}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
    setResponseHeader("Set-Cookie", `garmin_pkce=${verifier}; Path=/auth/garmin; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: GARMIN_REDIRECT,
      state: `${payload}.${sig}`,
    });
    return { url: `https://connect.garmin.com/oauth2Confirm?${params.toString()}` };
  });

/** Desconecta Garmin (revoca el registro en Garmin si es posible). */
export const disconnectGarmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: p } = await context.supabase.from("profiles").select("garmin_access_token").eq("id", context.userId).maybeSingle();
    const token = (p as any)?.garmin_access_token;
    if (token) {
      await fetch("https://apis.garmin.com/wellness-api/rest/user/registration", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({ garmin_user_id: null, garmin_access_token: null, garmin_refresh_token: null, garmin_token_expires_at: null } as any)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
