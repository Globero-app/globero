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
  const athlete = await call(creds, "");
  return { ok: true, name: athlete?.name ?? athlete?.athlete?.name ?? null };
}

export type ZoneRefs = { ftp: number | null; lthr: number | null; maxHr: number | null };

/** Zonas de FC (Friel) en % de LTHR, para steps definidos por zona. */
const HR_ZONE_PCT: Record<string, [number, number]> = {
  z1: [65, 81],
  z2: [82, 88],
  z3: [89, 93],
  z4: [94, 99],
  z5: [100, 106],
  z5a: [100, 102],
  z5b: [103, 106],
  z5c: [107, 115],
  z6: [107, 115],
  z7: [116, 125],
};

function zoneKeyFrom(s: any): string | null {
  const raw = String(s?.zone ?? s?.hr_zone ?? s?.target_zone ?? s?.name ?? "").toLowerCase();
  const m = raw.match(/\bz\s*([1-7])\s*([abc])?\b/);
  if (!m) return null;
  const key = `z${m[1]}${m[2] ?? ""}`;
  return HR_ZONE_PCT[key] ? key : HR_ZONE_PCT[`z${m[1]}`] ? `z${m[1]}` : null;
}

/**
 * Devuelve el rango de FC en % de LTHR, sea cual sea la definición del step:
 * bpm absolutos, % de FC máx, % de LTHR o zona (Z1-Z7).
 */
export function hrRangeToLthrPct(
  s: any,
  refs: ZoneRefs,
): { low: number; high: number } | null {
  const hrRef = refs.lthr && refs.lthr > 0 ? refs.lthr : refs.maxHr && refs.maxHr > 0 ? Math.round(refs.maxHr * 0.92) : null;
  if (!hrRef) return null;

  const unit = String(s?.target_unit ?? s?.unit ?? "").toLowerCase().replace(/\s|_/g, "");
  let low = Number(s?.target_low) || 0;
  let high = Number(s?.target_high) || low;
  if (high < low) [low, high] = [high, low];

  // 1) Definido por zona y sin valores numéricos utilizables
  if (!low) {
    const zk = zoneKeyFrom(s);
    if (zk) return { low: HR_ZONE_PCT[zk][0], high: HR_ZONE_PCT[zk][1] };
    return null;
  }

  const isPctMax = unit.includes("maxhr") || unit.includes("%max") || unit.includes("hrmax") || unit.includes("fcmax");
  const isPctLthr = unit.includes("lthr") || unit.includes("threshold") || unit.includes("umbral");
  const isBpm = unit.includes("bpm") || unit.includes("ppm");

  // Heurística: valores pequeños (<=100) sin unidad clara son porcentajes
  const looksPct = !isBpm && high <= 100;

  if (isPctMax || (looksPct && refs.maxHr && refs.maxHr > 0 && !isPctLthr && unit === "")) {
    // % de FC máx -> bpm -> % LTHR
    const maxHr = refs.maxHr && refs.maxHr > 0 ? refs.maxHr : Math.round(hrRef / 0.92);
    const bpmLow = (low / 100) * maxHr;
    const bpmHigh = (high / 100) * maxHr;
    return { low: Math.round((bpmLow / hrRef) * 100), high: Math.round((bpmHigh / hrRef) * 100) };
  }

  if (isPctLthr || looksPct) return { low: Math.round(low), high: Math.round(high) };

  // bpm absolutos
  return { low: Math.round((low / hrRef) * 100), high: Math.round((high / hrRef) * 100) };
}

/** Convierte los steps del plan en el "workout doc" de Intervals.icu */
export function buildWorkoutDoc(plan: any, basis: "power" | "hr", refs: ZoneRefs): string {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const ftp = refs.ftp;
  // En rodillo (VirtualRide) Intervals usa un FTP propio que puede ser 0:
  // se envían vatios absolutos para que el render no dependa de ese ajuste.
  const indoor = !!plan?.indoor;
  const lines: string[] = [];
  for (const s of steps) {
    const secs = Number(s.duration_seconds) || 0;
    const dur = s.duration_type === "open" || !secs ? "5m" : secs % 60 === 0 ? `${secs / 60}m` : `${secs}s`;
    // En rodillo se eliminan tokens de zona del nombre (Z2, Z5a...) porque
    // Intervals los interpreta como objetivo y los resuelve con el FTP de
    // VirtualRide (a menudo 0), mostrando "(0-0w)".
    let name = String(s.name ?? "").slice(0, 40);
    if (indoor) name = name.replace(/\bz\s*[1-7][abc]?\b/gi, "").replace(/\s{2,}/g, " ").trim();
    const low = Number(s.target_low) || 0;
    const high = Number(s.target_high) || 0;

    const isHrStep =
      s.target === "hr" ||
      s.target === "heart_rate" ||
      s.target === "hr_zone" ||
      (basis === "hr" && s.target !== "power" && s.target !== "cadence");

    if (isHrStep) {
      const pct = hrRangeToLthrPct(s, refs);
      let target: string;
      if (pct) {
        target = pct.low === pct.high ? `${pct.low}% LTHR` : `${pct.low}-${pct.high}% LTHR`;
      } else if (low > 0) {
        target = high && high !== low ? `${low}-${high}bpm` : `${low}bpm`;
      } else {
        target = "";
      }
      if (!target && !name) continue;
      lines.push(`- ${[name, dur, target].filter(Boolean).join(" ")}`);
      continue;
    }


    let target = "";
    if (s.target === "power" && low > 0) {
      if (!indoor && ftp && ftp > 0) {
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
    type: workout?.plan?.indoor || workout?.bike_type === "rodillo" ? "VirtualRide" : "Ride",
    name: workout.plan?.title ?? workout.plan?.name ?? "Entrenamiento",
    description: doc,
    workout_doc: null,
    moving_time: Math.max(60, Math.round((workout.duration_minutes ?? 60) * 60)),
    icu_training_load: workout.planned_tss ?? null,
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

/** Lista actividades desde una fecha (YYYY-MM-DD) */
export async function intervalsListActivities(creds: IntervalsCreds, oldest: string): Promise<any[]> {
  const res = await call(creds, `/activities?oldest=${oldest}`);
  return Array.isArray(res) ? res : [];
}

/** Actualiza campos de una actividad (RPE / Feel) */
export async function intervalsUpdateActivity(
  creds: IntervalsCreds,
  activityId: string,
  fields: { rpe?: number; feel?: number },
) {
  await call(creds, `/activities/${activityId}`, { method: "PUT", body: JSON.stringify(fields) });
}

/** Lee credenciales del perfil; null si no está conectado */
export function credsFromProfile(profile: any): IntervalsCreds | null {
  if (!profile?.intervals_athlete_id || !profile?.intervals_api_key) return null;
  return { athleteId: String(profile.intervals_athlete_id), apiKey: String(profile.intervals_api_key) };
}

/** Crea o actualiza el evento de un entrenamiento en Intervals.icu. Devuelve el event id o null. */
export async function syncWorkoutEvent(
  supabase: any,
  userId: string,
  workout: any,
  options: { strict?: boolean } = {},
): Promise<string | null> {
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
      try {
        await intervalsUpdateEvent(creds, existing, workout, date, refs);
        return existing;
      } catch (e) {
        // El evento ya no existe en Intervals: se recrea en lugar de duplicar/fallar
        console.error("intervals update fallback", e);
      }
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
    if (options.strict) throw e;
    return null;
  }
}

/** Elimina el evento asociado a un entrenamiento en Intervals.icu (si existe). */
export async function removeWorkoutEvent(
  supabase: any,
  userId: string,
  workout: any,
  options: { strict?: boolean } = {},
): Promise<void> {
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
    if (options.strict) throw e;
  }
}

/** Sincroniza umbrales y zonas (Ride) con Intervals.icu */
export async function intervalsPushZones(supabase: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("intervals_athlete_id,intervals_api_key,ftp,lthr,max_hr")
    .eq("id", userId)
    .maybeSingle();
  const creds = credsFromProfile(profile);
  if (!creds) return false;

  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;
  const maxHr = profile?.max_hr ?? null;
  const body: Record<string, unknown> = {};
  if (ftp) body.ftp = ftp;
  if (lthr) body.lthr = lthr;
  if (maxHr) body.max_hr = maxHr;
  if (!Object.keys(body).length) return false;

  // El PUT necesita el id numérico de los ajustes del deporte, no el nombre "Ride".
  // Se actualizan Ride y VirtualRide (rodillo) para que el FTP sea coherente en ambos.
  const settings = await call(creds, "/sport-settings");
  const list = Array.isArray(settings) ? settings : [];
  const targets = list.filter((s: any) =>
    (s?.types ?? []).some((t: string) => ["ride", "virtualride"].includes(String(t).toLowerCase())),
  );
  if (!targets.length && list[0]) targets.push(list[0]);
  if (!targets.length) throw new Error("No se encontraron ajustes de Ride en Intervals.icu");

  const powerZones = [55, 75, 90, 105, 120, 150, 999];
  const powerZoneNames = ["Recuperación", "Resistencia", "Tempo", "Umbral", "VO₂ máx", "Anaeróbico", "Neuromuscular"];
  const hrRef = lthr || (maxHr ? Math.round(maxHr * 0.92) : null);
  const hrZoneNames = ["Recuperación", "Resistencia", "Tempo", "Umbral", "VO₂ bajo", "VO₂ alto", "Máxima"];
  for (const target of targets) {
    const hrZones = hrRef
      ? [...[81, 88, 93, 99, 102, 106].map((pct) => Math.round((pct / 100) * hrRef)), maxHr || 220]
      : target?.hr_zones;
    await call(creds, `/sport-settings/${target.id}?recalcHrZones=false`, {
      method: "PUT",
      body: JSON.stringify({
        ...target,
        ...body,
        power_zones: powerZones,
        power_zone_names: powerZoneNames,
        ...(hrZones ? { hr_zones: hrZones, hr_zone_names: hrZoneNames } : {}),
      }),
    });
  }
  return true;
}
