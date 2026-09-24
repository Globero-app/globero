import { tr } from "@/lib/i18n";import { createFileRoute } from "@tanstack/react-router";

const APP_ORIGIN = "https://globero.app";

function redirectToProfile(status: "success" | "error", reason?: string) {
  const url = new URL("/ajustes", APP_ORIGIN);
  url.searchParams.set("intervals", status);
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

export const Route = createFileRoute("/auth/intervals/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.has("error") || !code || !state) {
          return redirectToProfile("error", "authorization_denied");
        }

        const [userId, expiresValue, suppliedSignature, ...extra] = state.split(".");
        const expiresAt = Number(expiresValue);
        const stateSecret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
        if (extra.length || !userId || !expiresAt || !suppliedSignature || !stateSecret || expiresAt < Date.now()) {
          return redirectToProfile("error", "invalid_state");
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
          return redirectToProfile("error", "invalid_state");
        }

        const clientId = process.env["INTERVALS_CLIENT_ID"] ?? "802";
        const clientSecret = process.env["INTERVALS_CLIENT_SECRET"];
        if (!clientSecret) return redirectToProfile("error", "configuration");

        const response = await fetch("https://intervals.icu/api/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code })
        });
        if (!response.ok) {
          console.error(`Intervals.icu OAuth token exchange failed with status ${response.status}`);
          return redirectToProfile("error", "token_exchange");
        }

        const token = (await response.json()) as {
          access_token?: string;
          athlete?: {id?: string | number;};
          refresh_token?: string;
          expires_in?: number;
        };
        if (!token.access_token || token.athlete?.id == null) {
          return redirectToProfile("error", "invalid_response");
        }

        const expiresAtIso = token.expires_in ?
        new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() :
        null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("profiles").update({
          intervals_athlete_id: String(token.athlete.id),
          intervals_api_key: token.access_token,
          intervals_oauth: true,
          intervals_refresh_token: token.refresh_token ?? null,
          intervals_token_expires_at: expiresAtIso
        }).eq("id", userId);
        if (error) {
          console.error(`Intervals.icu OAuth profile update failed: ${error.message}`);
          return redirectToProfile("error", "profile_update");
        }
        return redirectToProfile("success");
      }
    }
  },
  component: IntervalsCallback,
  head: () => ({
    meta: [
    { title: "Vinculando Intervals.icu · Globero IA" },
    { name: "description", content: "Finalizando la conexión de tu cuenta de Intervals.icu con Globero IA." },
    { property: "og:title", content: "Vinculando Intervals.icu · Globero IA" },
    { property: "og:description", content: "Finalizando la conexión de tu cuenta de Intervals.icu con Globero IA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }]

  })
});

function IntervalsCallback() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-8">
      <p className="text-sm text-muted-foreground">{tr("Vinculando tu cuenta de Intervals.icu…")}</p>
    </div>);

}
