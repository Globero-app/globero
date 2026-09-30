import { createFileRoute } from "@tanstack/react-router";

const APP_ORIGIN = "https://coach.globero.app";
const REDIRECT = "https://coach.globero.app/auth/garmin/callback";

function back(status: "success" | "error", reason?: string) {
  const url = new URL("/ajustes", APP_ORIGIN);
  url.searchParams.set("garmin", status);
  if (reason) url.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": "garmin_pkce=; Path=/auth/garmin; Max-Age=0; HttpOnly; Secure; SameSite=Lax" },
  });
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const Route = createFileRoute("/auth/garmin/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.has("error") || !code || !state) return back("error", "authorization_denied");

        const [userId, expiresValue, supplied, ...extra] = state.split(".");
        const expiresAt = Number(expiresValue);
        const stateSecret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
        if (extra.length || !userId || !expiresAt || !supplied || !stateSecret || expiresAt < Date.now()) return back("error", "invalid_state");
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(stateSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${expiresAt}`));
        const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        if (!same(supplied, expected)) return back("error", "invalid_state");

        const verifier = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)garmin_pkce=([^;]+)/)?.[1];
        if (!verifier) return back("error", "invalid_state");

        const clientId = process.env["GARMIN_CLIENT_ID"];
        const clientSecret = process.env["GARMIN_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return back("error", "configuration");

        const { GARMIN_TOKEN_URL } = await import("@/lib/devices.server");
        const res = await fetch(GARMIN_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: REDIRECT }),
        });
        if (!res.ok) {
          console.error(`Garmin token exchange failed [${res.status}]: ${await res.text()}`);
          return back("error", "token_exchange");
        }
        const token = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
        if (!token.access_token) return back("error", "invalid_response");

        let garminUserId: string | null = null;
        try {
          const u = await fetch("https://apis.garmin.com/wellness-api/rest/user/id", { headers: { Authorization: `Bearer ${token.access_token}` } });
          if (u.ok) garminUserId = String((await u.json())?.userId ?? "") || null;
        } catch { /* opcional */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            garmin_user_id: garminUserId,
            garmin_access_token: token.access_token,
            garmin_refresh_token: token.refresh_token ?? null,
            garmin_token_expires_at: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString(),
          } as any)
          .eq("id", userId);
        if (error) return back("error", "save");
        return back("success");
      },
    },
  },
});
