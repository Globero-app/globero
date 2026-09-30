import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";

const APP_ORIGIN = "https://coach.globero.app";

function back(status: "success" | "error", reason?: string) {
  const url = new URL("/ajustes", APP_ORIGIN);
  url.searchParams.set("hammerhead", status);
  if (reason) url.searchParams.set("reason", reason);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const Route = createFileRoute("/auth/hammerhead/callback")({
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

        const clientId = process.env["HAMMERHEAD_CLIENT_ID"];
        const clientSecret = process.env["HAMMERHEAD_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return back("error", "configuration");

        const res = await fetch("https://api.hammerhead.io/v1/auth/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: "https://coach.globero.app/auth/hammerhead/callback",
          }),
        });
        if (!res.ok) {
          console.error(`Hammerhead token exchange failed [${res.status}]: ${await res.text()}`);
          return back("error", "token_exchange");
        }
        const token = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; created_at?: number };
        if (!token.access_token) return back("error", "invalid_response");

        const hammerheadUserId: string | null = (token as any).user_id != null ? String((token as any).user_id) : null;

        const created = token.created_at ? token.created_at * 1000 : Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            hammerhead_user_id: hammerheadUserId,
            hammerhead_access_token: token.access_token,
            hammerhead_refresh_token: token.refresh_token ?? null,
            hammerhead_token_expires_at: token.expires_in ? new Date(created + token.expires_in * 1000).toISOString() : null,
          } as any)
          .eq("id", userId);
        if (error) {
          console.error(`Hammerhead profile update failed: ${error.message}`);
          return back("error", "profile_update");
        }
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const { data: pending } = await supabaseAdmin
          .from("workouts")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "pending")
          .limit(120);
        const { syncWorkoutToDevices } = await import("@/lib/devices.server");
        for (const workout of pending ?? []) {
          if (String((workout.plan as any)?.scheduled_date ?? "") < today) continue;
          await syncWorkoutToDevices(supabaseAdmin, userId, workout);
        }
        return back("success");
      },
    },
  },
  component: () => (
    <div className="min-h-[60vh] grid place-items-center p-8">
      <p className="text-sm text-muted-foreground">{tr("Vinculando tu cuenta de Hammerhead…")}</p>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Vinculando Hammerhead · Globero IA" },
      { name: "description", content: "Finalizando la conexión de tu cuenta de Hammerhead con Globero IA." },
      { property: "og:title", content: "Vinculando Hammerhead · Globero IA" },
      { property: "og:description", content: "Finalizando la conexión de tu cuenta de Hammerhead con Globero IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
