import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const REDIRECT_URI = "https://globero.app/auth/intervals/callback";

/** Intercambia el code de OAuth de Intervals.icu y guarda el token en el perfil. */
export const intervalsOAuthExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(512) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clientId = process.env["INTERVALS_CLIENT_ID"] ?? "802";
    const clientSecret = process.env["INTERVALS_CLIENT_SECRET"];
    if (!clientSecret) throw new Error("Falta INTERVALS_CLIENT_SECRET");

    const basic = btoa(`${clientId}:${clientSecret}`);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: data.code,
      redirect_uri: REDIRECT_URI,
    });
    const res = await fetch("https://intervals.icu/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Intervals.icu OAuth ${res.status}: ${text.slice(0, 200)}`);
    const token = text ? JSON.parse(text) : {};
    const accessToken: string | undefined = token.access_token;
    if (!accessToken) throw new Error("Intervals.icu no devolvió access_token");

    let athleteId: string | null =
      token.athlete_id != null ? String(token.athlete_id) : token.athlete?.id != null ? String(token.athlete.id) : null;

    if (!athleteId) {
      const me = await fetch("https://intervals.icu/api/v1/athlete", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (me.ok) {
        const j = await me.json().catch(() => null);
        if (j?.id != null) athleteId = String(j.id);
      }
    }
    if (!athleteId) throw new Error("No se pudo obtener el ID de atleta de Intervals.icu");

    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        intervals_athlete_id: athleteId,
        intervals_api_key: accessToken,
        intervals_oauth: true,
        intervals_refresh_token: token.refresh_token ?? null,
        intervals_token_expires_at: expiresAt,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    try {
      const { intervalsPushZones } = await import("./intervals.server");
      await intervalsPushZones(supabase, userId);
    } catch { /* no bloquea la vinculación */ }

    return { ok: true, athlete_id: athleteId };
  });
