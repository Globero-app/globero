// Utilidades para la app Garmin Connect IQ (solo servidor).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1

export function randomCode(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });

export const deviceIdOk = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_\-:.]{1,128}$/.test(v);

export async function activeDeviceUser(admin: any, deviceId: string): Promise<string | null> {
  const { data } = await admin.from("garmin_devices").select("user_id").eq("garmin_device_id", deviceId).eq("status", "active").maybeSingle();
  return data?.user_id ?? null;
}

const TYPE: Record<string, string> = { warmup: "warmup", cooldown: "cooldown", rest: "rest", recovery: "rest", active: "active", interval: "active" };

/** Convierte plan.steps en JSON compacto para Connect IQ. */
export function compactWorkout(w: any) {
  const plan = w.plan ?? {};
  const steps = (Array.isArray(plan.steps) ? plan.steps : []).map((s: any) => {
    const t = s.target === "power" ? "w" : s.target === "hr" ? "hr" : s.target === "cadence" ? "rpm" : null;
    const o: any = { t: TYPE[s.intensity] ?? "active", n: String(s.name ?? "").slice(0, 15), d: s.duration_type === "open" ? 0 : Math.round(Number(s.duration_seconds) || 0) };
    if (t && (Number(s.target_low) || Number(s.target_high))) o.tg = { k: t, min: Math.round(Number(s.target_low) || 0), max: Math.round(Number(s.target_high) || 0) };
    return o;
  });
  const total = steps.reduce((a: number, s: any) => a + s.d, 0) || Number(w.duration_minutes) * 60;
  return { has_workout: true, id: w.id, title: String(plan.name ?? plan.title ?? w.training_type ?? "Entreno").slice(0, 30), duration: total, steps };
}
