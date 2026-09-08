import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  bikeTotalKm,
  componentUsedKm,
  COMPONENT_LABELS_CALC,
  type CalcBike,
  type CalcComponent,
  type RideKm,
} from "@/lib/maintenance-calc";

export type BikeRow = CalcBike;
export type ComponentRow = CalcComponent;

export type MaintenanceAlert = {
  bikeId: string;
  bikeName: string;
  componentId: string;
  componentLabel: string;
  used: number;
  lifespan: number;
  remaining: number;
  pct: number;
  severity: "warn" | "danger";
};

export const COMPONENT_LABELS = COMPONENT_LABELS_CALC;

export function computeAlerts(bikes: BikeRow[], components: ComponentRow[], rides: RideKm[] = []): MaintenanceAlert[] {
  const byBike = new Map(bikes.map((b) => [b.id, b]));
  const alerts: MaintenanceAlert[] = [];
  for (const c of components) {
    if (!c.active) continue;
    const bike = byBike.get(c.bike_id);
    if (!bike) continue;
    const used = componentUsedKm(bike, c, rides);
    const remaining = c.lifespan_km - used;
    const pct = c.lifespan_km > 0 ? (used / c.lifespan_km) * 100 : 0;
    if (pct < 85) continue;
    alerts.push({
      bikeId: bike.id,
      bikeName: bike.name,
      componentId: c.id,
      componentLabel: (COMPONENT_LABELS[c.component_type] ?? c.component_type) + (c.name ? ` · ${c.name}` : ""),
      used,
      lifespan: c.lifespan_km,
      remaining,
      pct,
      severity: remaining <= 0 ? "danger" : "warn",
    });
  }
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
    return a.remaining - b.remaining;
  });
  return alerts;
}

/** Rides (km) from Intervals.icu activities for the current user. */
export function useRideKm() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ride_km", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intervals_activities")
        .select("start_date,distance,type")
        .not("distance", "is", null)
        .order("start_date", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as { start_date: string | null; distance: number | null; type: string | null }[])
        .filter((a) => !!a.start_date && (a.type ?? "").toLowerCase().includes("ride"))
        .map((a) => ({ date: a.start_date as string, km: Number(a.distance ?? 0) / 1000 })) as RideKm[];
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export { bikeTotalKm, componentUsedKm };

export function useMaintenanceAlerts() {
  const { user } = useAuth();
  const ridesQ = useRideKm();
  return useQuery({
    queryKey: ["maintenance_alerts", user?.id, ridesQ.data?.length ?? 0],
    queryFn: async () => {
      const [bikesRes, compsRes] = await Promise.all([
        supabase.from("bikes").select("id,name,current_km,km_base_date"),
        supabase.from("bike_components").select("id,bike_id,component_type,name,install_km,lifespan_km,installed_at,active"),
      ]);
      if (bikesRes.error) throw bikesRes.error;
      if (compsRes.error) throw compsRes.error;
      return computeAlerts(
        (bikesRes.data ?? []) as BikeRow[],
        (compsRes.data ?? []) as ComponentRow[],
        ridesQ.data ?? [],
      );
    },
    enabled: !!user && ridesQ.isSuccess,
    staleTime: 60_000,
  });
}
