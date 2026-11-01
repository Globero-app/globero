/** Routes share the table but only explicitly marked competitions are training targets. */
export function competitionToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export async function getNextActiveCompetition(supabase: any, userId: string, today = competitionToday()) {
  const { data, error } = await supabase.from("competitions")
    .select("id,name,date,type,distance_km,elevation_m,duration_hours,intensity,notes")
    .eq("user_id", userId)
    .eq("intensity", "competicion")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}