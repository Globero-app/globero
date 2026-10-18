import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { json, randomCode, deviceIdOk, randomSecret, hashSecret } = await import("@/lib/garmin-ciq.server");
  const url = new URL(request.url);
  let deviceId: unknown = url.searchParams.get("device_id");
  if (request.method === "POST") {
    try { deviceId = (await request.json())?.device_id ?? deviceId; } catch { /* sin cuerpo */ }
  }
  if (deviceId != null && !deviceIdOk(deviceId)) return json({ error: "invalid_device_id" }, 400);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("garmin_pairing_codes").delete().lt("expires_at", new Date().toISOString());
  const expires_at = new Date(Date.now() + 600_000).toISOString();
  const device_secret = randomSecret();
  const secret_hash = await hashSecret(device_secret);
  for (let i = 0; i < 8; i++) {
    const pairing_code = randomCode();
    const { error } = await supabaseAdmin.from("garmin_pairing_codes").insert({ pairing_code, expires_at, garmin_device_id: (deviceId as string) ?? null, secret_hash } as any);
    if (!error) return json({ pairing_code, device_secret, expires_in: 600 });
    if (error.code !== "23505") break;
  }
  return json({ error: "unavailable" }, 503);
}

export const Route = createFileRoute("/api/public/garmin/code")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
