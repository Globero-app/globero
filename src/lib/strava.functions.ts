import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Crea la URL de autorización de Strava con un state firmado (HMAC). */
export const createStravaAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
    const clientId = process.env["STRAVA_CLIENT_ID"];
    if (!secret) throw new Error("Falta la configuración de seguridad del enlace");
    if (!clientId) throw new Error("Falta configurar Strava (Client ID)");

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = `${context.userId}.${expiresAt}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://coach.globero.app/auth/strava/callback",
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read_all,activity:write",
      state: `${payload}.${encodedSignature}`,
    });
    return { url: `https://www.strava.com/oauth/authorize?${params.toString()}` };
  });

/** Desconecta la cuenta de Strava del usuario. */
export const disconnectStrava = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        strava_athlete_id: null,
        strava_access_token: null,
        strava_refresh_token: null,
        strava_token_expires_at: null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
