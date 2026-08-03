/** Cliente servidor para la API de Intervals.icu */

const BASE = "https://intervals.icu/api/v1";

export type IntervalsCreds = { athleteId: string; apiKey: string };

function authHeader(apiKey: string) {
  const token = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

function athletePath(athleteId: string) {
  return athleteId.startsWith("i") ? athleteId : `i${athleteId}`;
}

async function call(creds: IntervalsCreds, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/athlete/${athletePath(creds.athleteId)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(creds.apiKey),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Intervals.icu ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function intervalsTestConnection(creds: IntervalsCreds) {
  const profile = await call(creds, "/profile");
  return { ok: true, name: profile?.athlete?.name ?? null };
}

/** Convierte los steps del plan en el "workout doc" de Intervals.icu */
export function buildWorkoutDoc(plan: any, basis: "power" | "hr", ftp: number | null): string {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const lines: string[] = [];
  for (const s of steps) {
    const secs = Number(s.duration_seconds) || 0;
    const dur = s.duration_type === "open" || !secs ? "5m" : secs % 60 === 0 ? `${secs / 60}m` : `${secs}s`;
    let target = "";
    const low = Number(s.target_low) || 0;
    const high = Number(s.target_high) || 0;
    if (s.target === "power" && low > 0) {
      if (ftp && ftp > 0) {
        const pl = Math.round((low / ftp) * 100);
        const ph = Math.round(((high || low) / ftp) * 100);
        target = pl === ph ? `${pl}%` : `${pl}-${ph}%`;
      } else {
        target = high && high !== low ? `${low}-${high}w` : `${low}w`;
      }
    } else if (s.target === "hr" && low > 0) {
      target = high && high !== low ? `${low}-${high}bpm` : `${low}bpm`;
    } else if (s.target === "cadence" && low > 0) {
      target = `${low}rpm`;
    }
    const name = String(s.name ?? "").slice(0, 40);
    lines.push(`- ${dur} ${target}${name ? ` ${name}` : ""}`.trim());
  }
  const header = [plan?.summary, basis === "hr" ? "Base: frecuencia cardíaca" : "Base: potencia (FTP)"]
    .filter(Boolean)
    .join("\n");
  return [header, "", ...lines].join("\n").trim();
}

function eventBody(workout: any, doc: string, date: string) {
  return {
    start_date_local: `${date}T00:00:00`,
    category: "WORKOUT",
    type: "Ride",
    name: workout.plan?.title ?? workout.plan?.name ?? "Entrenamiento",
    description: doc,
    moving_time: Math.max(60, Math.round((workout.duration_minutes ?? 60) * 60)),
  };
}

export async function intervalsCreateEvent(
  creds: IntervalsCreds,
  workout: any,
  date: string,
  ftp: number | null,
): Promise<string> {
  const doc = buildWorkoutDoc(workout.plan, workout.plan?.target_basis === "hr" ? "hr" : "power", ftp);
  const created = await call(creds, "/events", {
    method: "POST",
    body: JSON.stringify(eventBody(workout, doc, date)),
  });
  return String(created?.id ?? "");
}

export async function intervalsUpdateEvent(
  creds: IntervalsCreds,
  eventId: string,
  workout: any,
  date: string,
  ftp: number | null,
) {
  const doc = buildWorkoutDoc(workout.plan, workout.plan?.target_basis === "hr" ? "hr" : "power", ftp);
  await call(creds, `/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(eventBody(workout, doc, date)),
  });
}

export async function intervalsDeleteEvent(creds: IntervalsCreds, eventId: string) {
  await call(creds, `/events/${eventId}`, { method: "DELETE" });
}

/** Lee credenciales del perfil; null si no está conectado */
export function credsFromProfile(profile: any): IntervalsCreds | null {
  if (!profile?.intervals_athlete_id || !profile?.intervals_api_key) return null;
  return { athleteId: String(profile.intervals_athlete_id), apiKey: String(profile.intervals_api_key) };
}
