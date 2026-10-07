const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type BeaconAlertKind = "start" | "sos" | "ended" | "stale";

export async function sendBeaconEmails(opts: {
  kind: BeaconAlertKind;
  riderName: string;
  link: string;
  beacon: { last_lat: number | null; last_lon: number | null; battery_pct: number | null; last_seen_at?: string | null };
  contacts: { email: string }[];
}) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) throw new Error("Email no configurado");
  const { kind, link, beacon } = opts;
  const rider = esc(opts.riderName || "Un ciclista");
  const maps = beacon.last_lat != null ? `https://maps.google.com/?q=${beacon.last_lat},${beacon.last_lon}` : null;
  const urgent = kind === "sos" || kind === "stale";
  const subject = kind === "sos" ? `🚨 SOS: ${rider} necesita ayuda`
    : kind === "stale" ? `⚠️ ${rider} ha dejado de enviar su posición`
    : kind === "start" ? `${rider} ha iniciado una salida` : `${rider} ha terminado su salida`;
  const lastSeen = beacon.last_seen_at ? new Date(beacon.last_seen_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : null;
  const intro = kind === "sos"
    ? `<p style="color:#b91c1c;font-weight:700">${rider} ha activado el SOS en su baliza de seguridad Globero.</p><p>Si no puedes contactar con él/ella, llama al <strong>112</strong> y facilita su última posición.</p>`
    : kind === "stale"
    ? `<p style="color:#b45309;font-weight:700">La baliza de ${rider} lleva más de 15 minutos sin enviar su posición${lastSeen ? ` (última: ${lastSeen})` : ""}.</p><p>Puede deberse a falta de cobertura o batería. Intenta contactar con él/ella; si no responde, llama al <strong>112</strong>.</p>`
    : kind === "start" ? `<p>${rider} ha iniciado una salida en bici y te ha añadido como contacto de emergencia. Puedes seguir su posición en directo.</p>`
    : `<p>${rider} ha finalizado su salida sin incidencias.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">${intro}
    ${kind !== "ended" ? `<p><a href="${link}" style="background:#e11d48;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver posición en directo</a></p>` : ""}
    ${urgent && maps ? `<p>Última posición: <a href="${maps}">${beacon.last_lat!.toFixed(5)}, ${beacon.last_lon!.toFixed(5)}</a>${beacon.battery_pct != null ? ` · Batería ${beacon.battery_pct}%` : ""}</p>` : ""}
    <p style="color:#94a3b8;font-size:12px">Globero · Baliza de seguridad</p></div>`;

  let sent = 0;
  for (const c of opts.contacts) {
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": resendKey },
      body: JSON.stringify({ from: process.env["RESEND_FROM"] || "Globero <onboarding@resend.dev>", to: [c.email], subject, html }),
    });
    if (res.ok) sent++;
    else console.error(`Resend [${res.status}]: ${await res.text()}`);
  }
  return sent;
}
