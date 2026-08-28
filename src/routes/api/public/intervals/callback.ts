import { createFileRoute } from "@tanstack/react-router";

function profileRedirect(origin: string, status: "success" | "error") {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/perfil?intervals=${status}` },
  });
}

export const Route = createFileRoute("/api/public/intervals/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const appOrigin = "https://globero.app";
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state || url.searchParams.has("error")) return profileRedirect(appOrigin, "error");

        const parts = state.split(".");
        const userId = parts[0];
        const expiresAt = Number(parts[1]);
        const suppliedSignature = parts[2];
        const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
        if (!userId || !expiresAt || !suppliedSignature || !secret || expiresAt < Date.now()) {
          return profileRedirect(appOrigin, "error");
        }

        const payload = `${userId}.${expiresAt}`;
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
        const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
        if (suppliedSignature !== expectedSignature) return profileRedirect(appOrigin, "error");

        const clientId = process.env["INTERVALS_CLIENT_ID"] ?? "802";
        const clientSecret = process.env["INTERVALS_CLIENT_SECRET"];
        if (!clientSecret) return profileRedirect(appOrigin, "error");
        const response = await fetch("https://intervals.icu/api/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code }),
        });
        if (!response.ok) return profileRedirect(appOrigin, "error");
        const token = await response.json() as { access_token?: string; athlete?: { id?: string | number } };
        if (!token.access_token || token.athlete?.id == null) return profileRedirect(appOrigin, "error");

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { error } = await admin.from("profiles").update({
          intervals_athlete_id: String(token.athlete.id),
          intervals_api_key: token.access_token,
          intervals_oauth: true,
        }).eq("id", userId);
        return profileRedirect(appOrigin, error ? "error" : "success");
      },
    },
  },
});