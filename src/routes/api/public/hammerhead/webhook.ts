// Webhook de Hammerhead: firma HMAC-SHA256 del cuerpo con HAMMERHEAD_WEBHOOK_SECRET.
// Los datos se descargan de la API con el token del usuario, no se confía en el payload.
import { createFileRoute } from "@tanstack/react-router";

async function validSignature(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...mac));
  const got = header.replace(/^sha256=/, "").trim();
  const cmp = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  return cmp(got, hex) || cmp(got, b64);
}

export const Route = createFileRoute("/api/public/hammerhead/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        const secret = process.env["HAMMERHEAD_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        const sig = request.headers.get("x-hammerhead-signature") ?? request.headers.get("x-signature");
        if (!(await validSignature(raw, sig, secret))) return new Response("Unauthorized", { status: 401 });
        let body: any;
        try { body = JSON.parse(raw); } catch { return Response.json({ ok: false }, { status: 400 }); }
        const hhUser = body?.userId ?? body?.user_id ?? body?.data?.userId;
        if (hhUser == null) return Response.json({ ok: false, error: "missing_user_id" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: p } = await supabaseAdmin.from("profiles").select("id").eq("hammerhead_user_id" as any, String(hhUser)).maybeSingle();
        if (!p) return Response.json({ ok: true, ignored: true });
        const { pullHammerheadActivities } = await import("@/lib/devices.server");
        const activityId = body?.activityId ?? body?.data?.activityId ?? body?.data?.id;
        const n = await pullHammerheadActivities(supabaseAdmin, (p as any).id, activityId ? String(activityId) : undefined);
        return Response.json({ ok: true, stored: n });
      },
    },
  },
});
