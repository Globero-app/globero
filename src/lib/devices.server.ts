/**
 * Integración con dispositivos (Wahoo y Garmin). Solo servidor.
 * - Envía los entrenamientos planificados al dispositivo conectado.
 * - Sin Intervals.icu, descarga las actividades del dispositivo a `intervals_activities`
 *   (tabla común de análisis) para que informes, gráficos y detección funcionen igual.
 * Garmin se activa solo con GARMIN_CLIENT_ID y GARMIN_CLIENT_SECRET configurados.
 */
import { credsFromProfile, hrRangeToLthrPct, type ZoneRefs } from "./intervals.server";

const WAHOO = "https://api.wahooligan.com";
const GARMIN_API = "https://apis.garmin.com";
export const GARMIN_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";

export function garminConfigured() {
  return !!(process.env["GARMIN_CLIENT_ID"] && process.env["GARMIN_CLIENT_SECRET"]);
}

const PROFILE_COLS =
  "id,ftp,lthr,max_hr,intervals_athlete_id,intervals_api_key,intervals_oauth,wahoo_user_id,wahoo_access_token,wahoo_refresh_token,wahoo_token_expires_at,garmin_user_id,garmin_access_token,garmin_refresh_token,garmin_token_expires_at";

async function loadProfile(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select(PROFILE_COLS).eq("id", userId).maybeSingle();
  return data as any;
}

// ---------------- tokens ----------------
async function refreshToken(
  supabase: any,
  profile: any,
  kind: "wahoo" | "garmin",
): Promise<string | null> {
  const access = profile?.[`${kind}_access_token`];
  if (!access) return null;
  const exp = profile?.[`${kind}_token_expires_at`] ? new Date(profile[`${kind}_token_expires_at`]).getTime() : 0;
  if (exp && exp - Date.now() > 120_000) return access;
  const refresh = profile?.[`${kind}_refresh_token`];
  if (!refresh) return access;
  const clientId = process.env[kind === "wahoo" ? "WAHOO_CLIENT_ID" : "GARMIN_CLIENT_ID"];
  const clientSecret = process.env[kind === "wahoo" ? "WAHOO_CLIENT_SECRET" : "GARMIN_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return access;
  const res = await fetch(kind === "wahoo" ? `${WAHOO}/oauth/token` : GARMIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refresh }),
  });
  if (!res.ok) {
    console.error(`[devices] ${kind} refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return access;
  }
  const t = (await res.json()) as any;
  if (!t?.access_token) return access;
  const upd: any = {
    [`${kind}_access_token`]: t.access_token,
    [`${kind}_refresh_token`]: t.refresh_token ?? refresh,
    [`${kind}_token_expires_at`]: new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString(),
  };
  await supabase.from("profiles").update(upd).eq("id", profile.id);
  Object.assign(profile, upd);
  return t.access_token;
}

// ---------------- conversión de pasos ----------------
function refsOf(p: any): ZoneRefs {
  return { ftp: p?.ftp ?? null, lthr: p?.lthr ?? null, maxHr: p?.max_hr ?? null };
}
function hrRef(refs: ZoneRefs) {
  return refs.lthr && refs.lthr > 0 ? refs.lthr : refs.maxHr && refs.maxHr > 0 ? Math.round(refs.maxHr * 0.92) : null;
}
function isHr(s: any) {
  return s?.target === "hr" || s?.target === "heart_rate" || s?.target === "hr_zone";
}
function stepKind(s: any, i: number, n: number): "wu" | "cd" | "recover" | "active" {
  const name = String(s?.name ?? "").toLowerCase();
  if (s?.intensity === "warmup" || (i === 0 && /calent|warm/.test(name))) return "wu";
  if (s?.intensity === "cooldown" || (i === n - 1 && /enfri|vuelta|cool/.test(name))) return "cd";
  if (s?.intensity === "recovery" || s?.intensity === "rest" || /recup|recov|descans/.test(name)) return "recover";
  return "active";
}

function wahooPlanJson(workout: any, refs: ZoneRefs) {
  const steps: any[] = Array.isArray(workout?.plan?.steps) ? workout.plan.steps : [];
  const intervals = steps.map((s, i) => {
    const secs = Number(s.duration_seconds) || 300;
    const low = Number(s.target_low) || 0;
    const high = Number(s.target_high) || low;
    let targets: any[] = [];
    if (isHr(s)) {
      const pct = hrRangeToLthrPct(s, refs);
      if (pct) targets = [{ type: "threshold_hr", low: pct.low / 100, high: pct.high / 100 }];
    } else if (s.target === "power" && low > 0) {
      targets = [{ type: "watts", low: Math.round(low), high: Math.round(high) }];
    } else if (s.target === "cadence" && low > 0) {
      targets = [{ type: "rpm", low, high }];
    }
    return {
      name: String(s.name ?? `Paso ${i + 1}`).slice(0, 40),
      exit_trigger_type: "time",
      exit_trigger_value: secs,
      intensity_type: stepKind(s, i, steps.length),
      targets,
    };
  });
  return {
    header: {
      name: String(workout?.plan?.title ?? workout?.plan?.name ?? "Globero").slice(0, 60),
      version: "1.0.0",
      description: String(workout?.plan?.summary ?? "").slice(0, 500),
      workout_type_family: 0,
      workout_type_location: workout?.plan?.indoor || workout?.bike_type === "rodillo" ? 1 : 0,
      ...(refs.ftp ? { ftp: refs.ftp } : {}),
    },
    intervals,
  };
}

function garminWorkoutJson(workout: any, refs: ZoneRefs) {
  const steps: any[] = Array.isArray(workout?.plan?.steps) ? workout.plan.steps : [];
  const ref = hrRef(refs);
  const INT: Record<string, string> = { wu: "WARMUP", cd: "COOLDOWN", recover: "RECOVERY", active: "ACTIVE" };
  return {
    workoutName: String(workout?.plan?.title ?? workout?.plan?.name ?? "Globero").slice(0, 60),
    description: String(workout?.plan?.summary ?? "").slice(0, 500),
    sport: "CYCLING",
    workoutProvider: "Globero",
    workoutSourceId: "Globero",
    steps: steps.map((s, i) => {
      const low = Number(s.target_low) || 0;
      const high = Number(s.target_high) || low;
      let targetType = "OPEN";
      let targetValueLow: number | null = null;
      let targetValueHigh: number | null = null;
      if (isHr(s)) {
        const pct = hrRangeToLthrPct(s, refs);
        if (pct && ref) {
          targetType = "HEART_RATE";
          targetValueLow = Math.round((pct.low / 100) * ref);
          targetValueHigh = Math.round((pct.high / 100) * ref);
        }
      } else if (s.target === "power" && low > 0) {
        targetType = "POWER";
        targetValueLow = Math.round(low);
        targetValueHigh = Math.round(high);
      } else if (s.target === "cadence" && low > 0) {
        targetType = "CADENCE";
        targetValueLow = low;
        targetValueHigh = high;
      }
      return {
        type: "WorkoutStep",
        stepOrder: i + 1,
        intensity: INT[stepKind(s, i, steps.length)],
        description: String(s.name ?? "").slice(0, 100),
        durationType: "TIME",
        durationValue: Number(s.duration_seconds) || 300,
        targetType,
        targetValueLow,
        targetValueHigh,
      };
    }),
  };
}

// ---------------- Wahoo: planificados ----------------
async function wahooDeletePlanned(token: string, plan: any) {
  if (plan?.wahoo_workout_id) {
    await fetch(`${WAHOO}/v1/workouts/${plan.wahoo_workout_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  if (plan?.wahoo_plan_id) {
    await fetch(`${WAHOO}/v1/plans/${plan.wahoo_plan_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

/** Elimina entrenos planificados (sin realizar) del mismo día creados por otra vía (p. ej. Intervals.icu). */
async function wahooDeleteStaleSameDay(token: string, date: string, keepId: string) {
  const res = await fetch(`${WAHOO}/v1/workouts?page=1&per_page=50`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return;
  const list = ((await res.json().catch(() => null))?.workouts ?? []) as any[];
  for (const w of list) {
    if (String(w.id) === keepId || w.workout_summary) continue;
    if (!String(w.starts ?? "").startsWith(date)) continue;
    await fetch(`${WAHOO}/v1/workouts/${w.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    if (w.plan_id) await fetch(`${WAHOO}/v1/plans/${w.plan_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

async function wahooCreatePlanned(token: string, workout: any, refs: ZoneRefs, date: string) {
  const json = JSON.stringify(wahooPlanJson(workout, refs));
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  const pRes = await fetch(`${WAHOO}/v1/plans`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "plan[file]": `data:application/json;base64,${b64}`,
      "plan[filename]": "plan.json",
      "plan[external_id]": `${workout.id}-${Date.now()}`,
      "plan[provider_updated_at]": new Date().toISOString(),
    }),
  });
  if (!pRes.ok) throw new Error(`Wahoo plan ${pRes.status}: ${(await pRes.text()).slice(0, 200)}`);
  const planId = String((await pRes.json())?.id ?? "");
  const wRes = await fetch(`${WAHOO}/v1/workouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "workout[name]": String(workout?.plan?.title ?? workout?.plan?.name ?? "Globero").slice(0, 60),
      "workout[workout_type_id]": "0",
      "workout[starts]": `${date}T06:00:00.000Z`,
      "workout[minutes]": String(Math.max(1, Math.round(workout.duration_minutes ?? 60))),
      "workout[workout_token]": String(workout.id),
      "workout[plan_id]": planId,
    }),
  });
  if (!wRes.ok) throw new Error(`Wahoo workout ${wRes.status}: ${(await wRes.text()).slice(0, 200)}`);
  return { wahoo_plan_id: planId, wahoo_workout_id: String((await wRes.json())?.id ?? "") };
}

// ---------------- Garmin: planificados ----------------
async function garminDeletePlanned(token: string, plan: any) {
  if (plan?.garmin_workout_id) {
    await fetch(`${GARMIN_API}/training-api/workout/v2/${plan.garmin_workout_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

async function garminCreatePlanned(token: string, workout: any, refs: ZoneRefs, date: string) {
  const res = await fetch(`${GARMIN_API}/training-api/workout/v2`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(garminWorkoutJson(workout, refs)),
  });
  if (!res.ok) throw new Error(`Garmin workout ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const workoutId = String((await res.json())?.workoutId ?? "");
  const sRes = await fetch(`${GARMIN_API}/training-api/schedule`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workoutId: Number(workoutId), date }),
  });
  const scheduleId = sRes.ok ? String((await sRes.json().catch(() => null)) ?? "") : "";
  return { garmin_workout_id: workoutId, garmin_schedule_id: scheduleId || null };
}

/** Crea/recrea el entreno en Wahoo/Garmin. Actualiza `workout.plan` con los ids. */
export async function syncWorkoutToDevices(supabase: any, userId: string, workout: any) {
  const date = workout?.plan?.scheduled_date;
  if (!date || !workout?.id) return;
  const profile = await loadProfile(supabase, userId);
  if (!profile) return;
  const refs = refsOf(profile);
  let plan = { ...(workout.plan ?? {}) };
  let changed = false;

  const wToken = await refreshToken(supabase, profile, "wahoo");
  if (wToken) {
    try {
      await wahooDeletePlanned(wToken, plan);
      plan = { ...plan, ...(await wahooCreatePlanned(wToken, workout, refs, date)) };
      changed = true;
      await wahooDeleteStaleSameDay(wToken, date, String(plan.wahoo_workout_id ?? ""));
    } catch (e) {
      console.error("[devices] wahoo sync", e);
    }
  }
  if (garminConfigured()) {
    const gToken = await refreshToken(supabase, profile, "garmin");
    if (gToken) {
      try {
        await garminDeletePlanned(gToken, plan);
        plan = { ...plan, ...(await garminCreatePlanned(gToken, workout, refs, date)) };
        changed = true;
      } catch (e) {
        console.error("[devices] garmin sync", e);
      }
    }
  }
  if (changed) {
    workout.plan = plan;
    await supabase.from("workouts").update({ plan }).eq("id", workout.id).eq("user_id", userId);
  }
}

/** Elimina el entreno planificado de Wahoo/Garmin. */
export async function removeWorkoutFromDevices(supabase: any, userId: string, workout: any) {
  const plan = workout?.plan ?? {};
  if (!plan.wahoo_workout_id && !plan.wahoo_plan_id && !plan.garmin_workout_id) return;
  const profile = await loadProfile(supabase, userId);
  if (!profile) return;
  const wToken = await refreshToken(supabase, profile, "wahoo");
  if (wToken) await wahooDeletePlanned(wToken, plan);
  if (garminConfigured()) {
    const gToken = await refreshToken(supabase, profile, "garmin");
    if (gToken) await garminDeletePlanned(gToken, plan);
  }
}

// ---------------- actividades realizadas ----------------
function estimateLoad(durSec: number, np: number, avgHr: number, refs: ZoneRefs) {
  if (np > 0 && refs.ftp) {
    const ifv = np / refs.ftp;
    return { load: Math.round(((durSec * np * ifv) / (refs.ftp * 3600)) * 100), intensity: Math.round(ifv * 100) };
  }
  const ref = hrRef(refs);
  if (avgHr > 0 && ref) {
    const ifv = avgHr / ref;
    return { load: Math.round((durSec / 3600) * 100 * ifv * ifv), intensity: Math.round(ifv * 100) };
  }
  return { load: null, intensity: null };
}

function wahooRow(w: any, userId: string, refs: ZoneRefs) {
  const s = w?.workout_summary;
  if (!s) return null;
  const dur = Number(s.duration_active_accum ?? s.duration_total_accum ?? 0);
  if (!dur) return null;
  const np = Number(s.power_bike_np_last ?? 0);
  const avgHr = Number(s.heart_rate_avg ?? 0);
  const est = estimateLoad(dur, np || Number(s.power_avg ?? 0), avgHr, refs);
  const tss = Number(s.power_bike_tss_last ?? 0);
  const indoor = [12, 61].includes(Number(w.workout_type_id));
  return {
    id: `wahoo_${w.id}`,
    user_id: userId,
    name: w.name ?? "Wahoo",
    type: indoor ? "VirtualRide" : "Ride",
    start_date: new Date(w.starts ?? s.created_at).toISOString(),
    moving_time: Math.round(dur),
    distance: Number(s.distance_accum ?? 0) || null,
    total_elevation_gain: Number(s.ascent_accum ?? 0) || null,
    average_speed: Number(s.speed_avg ?? 0) || null,
    average_heartrate: avgHr || null,
    max_heartrate: null,
    average_watts: Number(s.power_avg ?? 0) || null,
    icu_training_load: tss > 0 ? Math.round(tss) : est.load,
    icu_intensity: est.intensity,
    raw: { source: "wahoo", ...w },
    synced_at: new Date().toISOString(),
  };
}

export function garminRow(a: any, userId: string, refs: ZoneRefs) {
  const type = String(a?.activityType ?? "").toUpperCase();
  if (!type.includes("CYCL") && !type.includes("BIK") && !type.includes("RIDE")) return null;
  const dur = Number(a.movingDurationInSeconds ?? a.durationInSeconds ?? 0);
  if (!dur) return null;
  const np = Number(a.normalizedPowerInWatts ?? a.averagePowerInWatts ?? 0);
  const avgHr = Number(a.averageHeartRateInBeatsPerMinute ?? 0);
  const est = estimateLoad(dur, np, avgHr, refs);
  return {
    id: `garmin_${a.activityId ?? a.summaryId}`,
    user_id: userId,
    name: a.activityName ?? "Garmin",
    type: type.includes("INDOOR") || type.includes("VIRTUAL") ? "VirtualRide" : "Ride",
    start_date: new Date(Number(a.startTimeInSeconds) * 1000).toISOString(),
    moving_time: Math.round(dur),
    distance: Number(a.distanceInMeters ?? 0) || null,
    total_elevation_gain: Number(a.totalElevationGainInMeters ?? 0) || null,
    average_speed: Number(a.averageSpeedInMetersPerSecond ?? 0) || null,
    average_heartrate: avgHr || null,
    max_heartrate: Number(a.maxHeartRateInBeatsPerMinute ?? 0) || null,
    average_watts: Number(a.averagePowerInWatts ?? 0) || null,
    icu_training_load: Number(a.trainingStressScore ?? 0) || est.load,
    icu_intensity: est.intensity,
    raw: { source: "garmin", ...a },
    synced_at: new Date().toISOString(),
  };
}

/** Descarga actividades de Wahoo si el usuario NO tiene Intervals.icu. */
export async function pullDeviceActivities(supabase: any, userId: string): Promise<number> {
  const profile = await loadProfile(supabase, userId);
  if (!profile || credsFromProfile(profile)) return 0; // Intervals manda cuando está conectado
  const refs = refsOf(profile);
  const token = await refreshToken(supabase, profile, "wahoo");
  if (!token) return 0;
  const res = await fetch(`${WAHOO}/v1/workouts?page=1&per_page=30`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`[devices] wahoo list ${res.status}`);
    return 0;
  }
  const list = ((await res.json())?.workouts ?? []) as any[];
  const rows = list.map((w) => wahooRow(w, userId, refs)).filter(Boolean);
  if (!rows.length) return 0;
  const { error } = await supabase.from("intervals_activities").upsert(rows, { onConflict: "id" });
  if (error) console.error("[devices] upsert", error);
  return error ? 0 : rows.length;
}

/** Guarda actividades de Garmin (desde webhook ping). Ignora si hay Intervals.icu. */
export async function storeGarminActivities(supabase: any, garminUserId: string, acts: any[]) {
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLS).eq("garmin_user_id", garminUserId).maybeSingle();
  if (!profile || credsFromProfile(profile)) return 0;
  const rows = acts.map((a) => garminRow(a, profile.id, refsOf(profile))).filter(Boolean);
  if (!rows.length) return 0;
  await supabase.from("intervals_activities").upsert(rows, { onConflict: "id" });
  return rows.length;
}

/** Token válido de Garmin para un usuario de Garmin (para seguir callbacks ping). */
export async function garminTokenFor(supabase: any, garminUserId: string): Promise<string | null> {
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLS).eq("garmin_user_id", garminUserId).maybeSingle();
  return profile ? refreshToken(supabase, profile, "garmin") : null;
}

/** Envía FTP y zonas de potencia (Coggan) a Wahoo. La API de Wahoo no admite zonas de FC. */
export async function pushZonesToWahoo(supabase: any, userId: string): Promise<boolean> {
  return (await pushZonesToWahooDetailed(supabase, userId)).ok;
}

export async function pushZonesToWahooDetailed(supabase: any, userId: string): Promise<{ ok: boolean; status: number; response: string }> {
  const profile = await loadProfile(supabase, userId);
  const ftp = Number(profile?.ftp) || 0;
  if (!profile?.wahoo_access_token) return { ok: false, status: 0, response: "Wahoo no conectado" };
  if (ftp <= 0) return { ok: false, status: 0, response: "Sin FTP en el perfil" };
  const token = await refreshToken(supabase, profile, "wahoo");
  if (!token) return { ok: false, status: 0, response: "No se pudo renovar el token de Wahoo" };
  const pct = [55, 75, 90, 105, 120, 150];
  const body = new URLSearchParams({ "power_zone[ftp]": String(ftp), "power_zone[zone_count]": "7", "power_zone[zone_1]": "0" });
  pct.forEach((p, i) => body.set(`power_zone[zone_${i + 2}]`, String(Math.round((p / 100) * ftp) + 1)));
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" };
  const list = await fetch(`${WAHOO}/v1/power_zones`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  const existing = list?.ok ? ((await list.json())?.power_zones ?? [])[0] : null;
  const res = await fetch(existing?.id ? `${WAHOO}/v1/power_zones/${existing.id}` : `${WAHOO}/v1/power_zones`, {
    method: existing?.id ? "PUT" : "POST", headers, body,
  });
  const response = await res.text().catch(() => "");
  if (!res.ok) console.error(`[devices] wahoo zones ${res.status} ${response}`);
  return { ok: res.ok, status: res.status, response: response.slice(0, 2000) };
}
