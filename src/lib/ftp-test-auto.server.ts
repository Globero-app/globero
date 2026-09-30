/* Procesa un entrenamiento marcado como test de FTP: calcula umbrales,
   actualiza el perfil y genera el informe del test con zonas.
   Solo servidor. */

import { computeHrZones, computePowerZones, ftpFrom20Min, lthrFrom20Min } from "./zones";

function best20(values: number[], time: number[]): number {
  if (!values.length) return 0;
  const t = time.length === values.length ? time : values.map((_, i) => i);
  const target = 20 * 60;
  let start = 0;
  let sum = 0;
  let best = 0;
  for (let end = 0; end < values.length; end++) {
    sum += values[end] || 0;
    while (t[end]! - t[start]! >= target) {
      const avg = sum / (end - start + 1);
      if (avg > best) best = avg;
      sum -= values[start] || 0;
      start++;
    }
  }
  return best;
}

function zonesText(title: string, zones: ReturnType<typeof computePowerZones>, unit: string): string {
  if (!zones) return "";
  return `${title}\n${zones
    .map((z) => `- ${z.label}: ${z.low}${z.high === Infinity ? "+" : `-${z.high}`} ${unit}`)
    .join("\n")}`;
}

/**
 * Si el workout es un test de FTP, calcula FTP/LTHR desde la actividad,
 * actualiza umbrales y devuelve el texto del informe. null si no aplica.
 */
export async function processFtpTestWorkout(
  supabase: any,
  userId: string,
  workoutId: string,
): Promise<{ text: string; title: string } | null> {
  const { data: w } = await supabase
    .from("workouts")
    .select("id,plan,duration_minutes")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();
  const plan: any = w?.plan ?? {};
  if (!w || !plan.is_ftp_test) return null;

  const rawId = plan.intervals_activity_id ?? plan.strava_activity_id ?? null;
  const activityId = rawId ? String(rawId) : null;
  const basis: "power" | "hr" = plan.target_basis === "hr" ? "hr" : "power";
  if (!activityId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const { data: act } = await supabase
    .from("intervals_activities")
    .select("name,raw,start_date,average_watts,average_heartrate,max_heartrate,moving_time")
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle();

  let w20 = 0;
  let hr20 = 0;
  try {
    const { credsFromProfile } = await import("./intervals.server");
    const creds = credsFromProfile(profile);
    const isDevice = /^(wahoo|garmin|hammerhead|igpsport)_/.test(activityId);
    if (creds && !isDevice) {
      const { intervalsActivityStreams } = await import("./intervals-activities.server");
      const streams = await intervalsActivityStreams(creds, activityId, "watts,heartrate,time");
      const watts = streams["watts"] ?? [];
      const hr = streams["heartrate"] ?? [];
      const time = streams["time"] ?? [];
      w20 = best20(watts, time);
      hr20 = best20(hr, time);
    }
  } catch {
    /* sin streams: se usan medias */
  }
  if (!w20 && !hr20) {
    try {
      const { stravaStreamsForActivity } = await import("./strava.server");
      const st = await stravaStreamsForActivity(supabase, userId, activityId);
      const time = st["time"] ?? [];
      w20 = best20(st["watts"] ?? [], time);
      hr20 = best20(st["heartrate"] ?? [], time);
    } catch {
      /* sin Strava */
    }
  }
  // Wahoo: aproximación con NP si no hay streams
  if (!w20) {
    const s = (act as any)?.raw?.workout_summary;
    const np = Number(s?.power_bike_np_last ?? 0);
    if (np > 0) w20 = np;
  }
  if (basis === "hr") w20 = 0;
  if (!w20 && Number(act?.average_watts) > 0) w20 = Number(act!.average_watts);
  if (!hr20 && basis === "hr" && Number(act?.average_heartrate) > 0) hr20 = Number(act!.average_heartrate);
  if (!w20 && !hr20) return null;

  const prevFtp = profile?.ftp ? Number(profile.ftp) : null;
  const prevLthr = profile?.lthr ? Number(profile.lthr) : null;
  const ftp = w20 ? ftpFrom20Min(w20) : null;
  const lthr = hr20 ? lthrFrom20Min(hr20) : null;
  const maxHr = Number(act?.max_heartrate) > 0 && Number(act?.max_heartrate) > Number(profile?.max_hr ?? 0)
    ? Math.round(Number(act!.max_heartrate))
    : (profile?.max_hr ?? null);

  const testDate = String(act?.start_date ?? new Date().toISOString()).slice(0, 10);
  await supabase.from("ftp_tests").insert({
    user_id: userId,
    avg_watts_20min: w20 ? Math.round(w20) : null,
    avg_hr_20min: hr20 ? Math.round(hr20) : null,
    ftp,
    lthr,
    source: "workout",
    test_date: testDate,
  });

  const update: any = { ftp_test_completed_at: new Date().toISOString() };
  if (ftp) update.ftp = ftp;
  if (lthr) update.lthr = lthr;
  if (maxHr) update.max_hr = maxHr;
  await supabase.from("profiles").update(update).eq("id", userId);

  try {
    const { data: fresh } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { refreshAthleteProfile } = await import("./athlete-profile.server");
    await refreshAthleteProfile(supabase, userId, fresh);
  } catch {
    /* no bloquea */
  }

  const weight = Number(profile?.weight_kg) || null;
  const lines: string[] = [];
  lines.push(`Informe del test de FTP (${testDate.split("-").reverse().join("/")})`);
  if (w20) lines.push(`Mejor bloque de 20 min: ${Math.round(w20)} W`);
  if (hr20) lines.push(`FC media de esos 20 min: ${Math.round(hr20)} ppm`);
  if (ftp) {
    const diff = prevFtp ? ftp - prevFtp : null;
    lines.push(
      `FTP: ${ftp} W${weight ? ` (${(ftp / weight).toFixed(2)} W/kg)` : ""}${
        diff !== null ? ` · ${diff >= 0 ? "+" : ""}${diff} W frente al anterior (${prevFtp} W)` : ""
      }`,
    );
  }
  if (lthr) {
    const diffH = prevLthr ? lthr - prevLthr : null;
    lines.push(`Umbral de FC (LTHR): ${lthr} ppm${diffH !== null ? ` · ${diffH >= 0 ? "+" : ""}${diffH} ppm` : ""}`);
  }
  if (maxHr) lines.push(`FC máxima registrada: ${maxHr} ppm`);
  lines.push("");
  const pz = zonesText("Zonas de potencia:", computePowerZones(ftp ?? prevFtp), "W");
  const hz = zonesText("Zonas de frecuencia cardíaca:", computeHrZones(lthr ?? prevLthr, maxHr), "ppm");
  if (pz) lines.push(pz, "");
  if (hz) lines.push(hz, "");
  lines.push("Tus umbrales y zonas ya están actualizados en la aplicación y los próximos entrenamientos se generarán con estos valores.");

  const title = plan.title ?? plan.name ?? "Test de FTP";
  return { text: lines.join("\n"), title };
}
