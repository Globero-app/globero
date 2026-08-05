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

export type ZoneRefs = { ftp: number | null; lthr: number | null; maxHr: number | null };

/** Convierte los steps del plan en el "workout doc" de Intervals.icu */
export function buildWorkoutDoc(plan: any, basis: "power" | "hr", refs: ZoneRefs): string {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const ftp = refs.ftp;
  // Referencia de FC para porcentajes en Intervals.icu (% del umbral de FC)
  const hrRef = refs.lthr && refs.lthr > 0 ? refs.lthr : refs.maxHr && refs.maxHr > 0 ? Math.round(refs.maxHr * 0.92) : null;
  const lines: string[] = [];
  for (const s of steps) {
    const secs = Number(s.duration_seconds) || 0;
    const dur = s.duration_type === "open" || !secs ? "5m" : secs % 60 === 0 ? `${secs / 60}m` : `${secs}s`;
    const name = String(s.name ?? "").slice(0, 40);
    const low = Number(s.target_low) || 0;
    const high = Number(s.target_high) || 0;

    if (s.target === "hr" && low > 0) {
      // Formato que Intervals.icu interpreta como bloque: "Nombre 5m 76-81% HR"
      let target: string;
      if (hrRef) {
        const pl = Math.round((low / hrRef) * 100);
        const ph = Math.round(((high || low) / hrRef) * 100);
        target = pl === ph ? `${pl}% HR` : `${pl}-${ph}% HR`;
      } else {
        target = high && high !== low ? `${low}-${high}bpm` : `${low}bpm`;
      }
      lines.push(`- ${[name, dur, target].filter(Boolean).join(" ")}`);
      continue;
    }

    let target = "";
    if (s.target === "power" && low > 0) {
      if (ftp && ftp > 0) {
        const pl = Math.round((low / ftp) * 100);
        const ph = Math.round(((high || low) / ftp) * 100);
        target = pl === ph ? `${pl}%` : `${pl}-${ph}%`;
      } else {
        target = high && high !== low ? `${low}-${high}w` : `${low}w`;
      }
    } else if (s.target === "cadence" && low > 0) {
      target = `${low}rpm`;
    }
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
  refs: ZoneRefs,
): Promise<string> {
  const doc = buildWorkoutDoc(workout.plan, workout.plan?.target_basis === "hr" ? "hr" : "power", refs);
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
  refs: ZoneRefs,
) {
  const doc = buildWorkoutDoc(workout.plan, workout.plan?.target_basis === "hr" ? "hr" : "power", refs);
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

/** Crea o actualiza el evento de un entrenamiento en Intervals.icu. Devuelve el event id o null. */
export async function syncWorkoutEvent(supabase: any, userId: string, workout: any): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("intervals_athlete_id,intervals_api_key,ftp,lthr,max_hr")
    .eq("id", userId)
    .maybeSingle();
  const creds = credsFromProfile(profile);
  if (!creds) return null;
  const date = workout?.plan?.scheduled_date;
  if (!date) return null;
  const existing = workout?.plan?.intervals_event_id ? String(workout.plan.intervals_event_id) : null;
  const refs: ZoneRefs = {
    ftp: profile?.ftp ?? null,
    lthr: profile?.lthr ?? null,
    maxHr: profile?.max_hr ?? null,
  };
  try {
    if (existing) {
      await intervalsUpdateEvent(creds, existing, workout, date, refs);
      return existing;
    }
    const id = await intervalsCreateEvent(creds, workout, date, refs);
    if (id) {
      await supabase
        .from("workouts")
        .update({ plan: { ...(workout.plan ?? {}), intervals_event_id: id } })
        .eq("id", workout.id)
        .eq("user_id", userId);
    }
    return id || null;
  } catch (e) {
    console.error("intervals sync error", e);
    return null;
  }
}

/** Elimina el evento asociado a un entrenamiento en Intervals.icu (si existe). */
export async function removeWorkoutEvent(supabase: any, userId: string, workout: any): Promise<void> {
  const eventId = workout?.plan?.intervals_event_id;
  if (!eventId) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("intervals_athlete_id,intervals_api_key")
    .eq("id", userId)
    .maybeSingle();
  const creds = credsFromProfile(profile);
  if (!creds) return;
  try {
    await intervalsDeleteEvent(creds, String(eventId));
  } catch (e) {
    console.error("intervals delete error", e);
  }
}
