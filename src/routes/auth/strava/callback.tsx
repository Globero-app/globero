import { tr } from "@/lib/i18n";import { createFileRoute } from "@tanstack/react-router";

function redirectToProfile(status: "success" | "error", reason?: string, origin = "https://coach.globero.app") {
  const url = new URL("/ajustes", origin);
  url.searchParams.set("strava", status);
  if (reason) url.searchParams.set("reason", reason);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

function signaturesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export const Route = createFileRoute("/auth/strava/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.has("error") || !code || !state) {
          return redirectToProfile("error", "authorization_denied", url.origin);
        }

        const [userId, expiresValue, suppliedSignature, ...extra] = state.split(".");
        const expiresAt = Number(expiresValue);
        const stateSecret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
        if (extra.length || !userId || !expiresAt || !suppliedSignature || !stateSecret || expiresAt < Date.now()) {
          return redirectToProfile("error", "invalid_state", url.origin);
        }

        const payload = `${userId}.${expiresAt}`;
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(stateSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
        const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).
        replaceAll("+", "-").
        replaceAll("/", "_").
        replaceAll("=", "");
        if (!signaturesMatch(suppliedSignature, expectedSignature)) {
          return redirectToProfile("error", "invalid_state", url.origin);
        }

        const clientId = process.env["STRAVA_CLIENT_ID"];
        const clientSecret = process.env["STRAVA_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return redirectToProfile("error", "configuration", url.origin);

        const response = await fetch("https://www.strava.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code"
          })
        });
        if (!response.ok) {
          console.error(`Strava OAuth token exchange failed with status ${response.status}`);
          return redirectToProfile("error", "token_exchange", url.origin);
        }

        const token = (await response.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          athlete?: {id?: string | number;};
        };
        if (!token.access_token) return redirectToProfile("error", "invalid_response", url.origin);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.
        from("profiles").
        update({
          strava_athlete_id: token.athlete?.id != null ? Number(token.athlete.id) : null,
          strava_access_token: token.access_token,
          strava_refresh_token: token.refresh_token ?? null,
          strava_token_expires_at: token.expires_at ? new Date(token.expires_at * 1000).toISOString() : null
        }).
        eq("id", userId);
        if (error) {
          console.error(`Strava OAuth profile update failed: ${error.message}`);
          return redirectToProfile("error", "profile_update", url.origin);
        }
        return redirectToProfile("success", url.origin);
      }
    }
  },
  component: StravaCallback,
  head: () => ({
    meta: [
    { title: "Vinculando Strava · Globero IA" },
    { name: "description", content: "Finalizando la conexión de tu cuenta de Strava con Globero IA." },
    { property: "og:title", content: "Vinculando Strava · Globero IA" },
    { property: "og:description", content: "Finalizando la conexión de tu cuenta de Strava con Globero IA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }]

  })
});

function StravaCallback() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-8">
      <p className="text-sm text-muted-foreground">{tr("Vinculando tu cuenta de Strava…")}</p>
    </div>);

}
