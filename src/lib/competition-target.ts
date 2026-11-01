/** Routes share the table but only explicitly marked competitions are training targets. */
import { queryOptions } from "@tanstack/react-query";

export function nextCompetitionOptions(supabase: any, userId: string, today = competitionToday()) {
  return queryOptions({
    queryKey: ["competitions", userId, "next-active", today],
    queryFn: () => getNextActiveCompetition(supabase, userId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 60_000,
  });
}

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