import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export type BikeRow = {
  id: string;
  name: string;
  current_km: number;
};

export type ComponentRow = {
  id: string;
  bike_id: string;
  component_type: string;
  name: string | null;
  install_km: number;
  lifespan_km: number;
  active: boolean;
};

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

export const COMPONENT_LABELS: Record<string, string> = {
  cadena: "Cadena",
  cassette: "Cassette",
  platos: "Platos",
  transmision: "Transmisión",
  pastillas_del: "Pastillas del.",
  pastillas_tras: "Pastillas tras.",
  cubierta_del: "Cubierta del.",
  cubierta_tras: "Cubierta tras.",
  rodamientos: "Rodamientos",
  cables: "Cables",
  otros: "Otros",
};

export function computeAlerts(bikes: BikeRow[], components: ComponentRow[]): MaintenanceAlert[] {
  const byBike = new Map(bikes.map((b) => [b.id, b]));
  const alerts: MaintenanceAlert[] = [];
  for (const c of components) {
    if (!c.active) continue;
    const bike = byBike.get(c.bike_id);
    if (!bike) continue;
    const used = Math.max(0, bike.current_km - c.install_km);
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
  // danger first, then closer-to-end first
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
    return a.remaining - b.remaining;
  });
  return alerts;
}

export function useMaintenanceAlerts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["maintenance_alerts", user?.id],
    queryFn: async () => {
      const [bikesRes, compsRes] = await Promise.all([
        supabase.from("bikes").select("id,name,current_km"),
        supabase.from("bike_components").select("id,bike_id,component_type,name,install_km,lifespan_km,active"),
      ]);
      if (bikesRes.error) throw bikesRes.error;
      if (compsRes.error) throw compsRes.error;
      return computeAlerts((bikesRes.data ?? []) as BikeRow[], (compsRes.data ?? []) as ComponentRow[]);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
