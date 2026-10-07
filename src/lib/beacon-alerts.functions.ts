import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const notifyBeaconContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ beaconId: z.string().uuid(), kind: z.enum(["start", "sos", "ended"]), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) throw new Error("Email no configurado");

    const { data: beacon } = await supabase.from("safety_beacons")
      .select("id,share_token,last_lat,last_lon,battery_pct").eq("id", data.beaconId).eq("user_id", userId).maybeSingle();
    if (!beacon) throw new Error("Baliza no encontrada");
    let q = supabase.from("emergency_contacts").select("name,email").eq("user_id", userId);
    if (data.kind !== "sos") q = q.eq("notify_on_start", true);
    const { data: contacts } = await q;
    if (!contacts?.length) return { sent: 0 };
    const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle();
    const rider = esc(prof?.full_name || prof?.email || "Un ciclista");

    const origin = new URL(data.origin).origin;
    const link = `${origin}/live/${beacon.share_token}`;
    const maps = beacon.last_lat != null ? `https://maps.google.com/?q=${beacon.last_lat},${beacon.last_lon}` : null;
    const subject = data.kind === "sos" ? `🚨 SOS: ${rider} necesita ayuda` : data.kind === "start" ? `${rider} ha iniciado una salida` : `${rider} ha terminado su salida`;
    const intro = data.kind === "sos"
      ? `<p style="color:#b91c1c;font-weight:700">${rider} ha activado el SOS en su baliza de seguridad Globero.</p><p>Si no puedes contactar con él/ella, llama al <strong>112</strong> y facilita su última posición.</p>`
      : data.kind === "start" ? `<p>${rider} ha iniciado una salida en bici y te ha añadido como contacto de emergencia. Puedes seguir su posición en directo.</p>`
      : `<p>${rider} ha finalizado su salida sin incidencias.</p>`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">${intro}
      ${data.kind !== "ended" ? `<p><a href="${link}" style="background:#e11d48;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver posición en directo</a></p>` : ""}
      ${data.kind === "sos" && maps ? `<p>Última posición: <a href="${maps}">${beacon.last_lat.toFixed(5)}, ${beacon.last_lon.toFixed(5)}</a>${beacon.battery_pct != null ? ` · Batería ${beacon.battery_pct}%` : ""}</p>` : ""}
      <p style="color:#94a3b8;font-size:12px">Globero · Baliza de seguridad</p></div>`;

    let sent = 0;
    for (const c of contacts) {
      const res = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": resendKey },
        body: JSON.stringify({ from: process.env["RESEND_FROM"] || "Globero <onboarding@resend.dev>", to: [c.email], subject, html }),
      });
      if (res.ok) sent++;
      else console.error(`Resend [${res.status}]: ${await res.text()}`);
    }
    return { sent, total: contacts.length };
  });
