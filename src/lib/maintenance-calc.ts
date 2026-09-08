export type RideKm = { date: string; km: number };

export type CalcBike = {
  id: string;
  name: string;
  current_km: number;
  km_base_date?: string | null;
};

export type CalcComponent = {
  id: string;
  bike_id: string;
  component_type: string;
  name: string | null;
  install_km: number;
  lifespan_km: number;
  installed_at: string;
  active: boolean;
};

export const COMPONENT_LABELS_CALC: Record<string, string> = {
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

const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);

/** Km ridden strictly after a given instant. */
export function kmSince(rides: RideKm[], fromISO: string | null | undefined): number {
  const from = t(fromISO);
  let sum = 0;
  for (const r of rides) if (t(r.date) >= from) sum += r.km;
  return sum;
}

/** Bike km = manual baseline + km ridden since that baseline was set. */
export function bikeTotalKm(bike: CalcBike, rides: RideKm[]): number {
  return Number(bike.current_km ?? 0) + kmSince(rides, bike.km_base_date ?? null);
}

/** Km used by a component, counted from its installation date. */
export function componentUsedKm(bike: CalcBike, comp: CalcComponent, rides: RideKm[]): number {
  const base = t(bike.km_base_date ?? null);
  const installed = t(`${comp.installed_at}T00:00:00`);
  const from = installed > base ? `${comp.installed_at}T00:00:00` : (bike.km_base_date ?? null);
  const manual = installed <= base ? Math.max(0, Number(bike.current_km ?? 0) - Number(comp.install_km ?? 0)) : 0;
  return manual + kmSince(rides, from);
}
