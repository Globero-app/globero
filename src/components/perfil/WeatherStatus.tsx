import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWeatherStatus } from "@/lib/weather-alerts.functions";
import { MapPin, RefreshCw } from "lucide-react";

/** Muestra la localidad detectada y los avisos meteorológicos vigentes. */
export function WeatherStatus({ city }: { city?: string | null }) {
  const fetchStatus = useServerFn(getWeatherStatus);
  const q = useQuery({
    queryKey: ["weather-status", city ?? ""],
    queryFn: () => fetchStatus({ data: undefined }),
    enabled: !!city,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (!city) return null;

  return (
    <div className="rounded-lg border bg-surface p-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <MapPin className="size-3.5" />
          {q.isFetching ? "Detectando localidad…" : (q.data?.located ?? "No se ha podido localizar esta población")}
        </span>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold hover:bg-muted"
        >
          <RefreshCw className="size-3" /> Actualizar
        </button>
      </div>
      {q.data?.weather && (
        <p className="text-muted-foreground">
          Hoy: {q.data.weather.summary} · {Math.round(q.data.weather.temp_max_c)} °C · viento{" "}
          {Math.round(q.data.weather.wind_kmh)} km/h · lluvia {q.data.weather.precip_mm} mm
        </p>
      )}
      {q.data?.alert ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="font-semibold">{q.data.alert.title}</p>
          <p className="whitespace-pre-line text-muted-foreground">{q.data.alert.body}</p>
        </div>
      ) : (
        q.data?.located && <p className="text-muted-foreground">Sin avisos meteorológicos vigentes ahora mismo.</p>
      )}
    </div>
  );
}
