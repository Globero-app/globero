import { tr } from "@/lib/i18n";import { CloudSun, Droplets, Wind, Thermometer, RefreshCw, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { fetchRaceWeather } from "@/lib/weather.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { activeLang, localeCode } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteClothingForecast } from "./RouteClothingForecast";
import { clothingText } from "@/lib/route-clothing-i18n";
import { estimatedRouteHours, forecastAvailability, routeDeparture, routeWeatherSignature, type RouteForecast } from "@/lib/route-weather";

const RISK_STYLES: Record<string, string> = {
  bajo: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  moderado: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  alto: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  extremo: "bg-destructive/15 text-destructive border-destructive/30"
};

export function RaceWeatherCard({ competition }: {competition: any;}) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchRaceWeather);
  const [fresh, setFresh] = useState<{ id: string; weather: any; hydration: any } | null>(null);
  const forecast = fresh && fresh.id === competition.id ? fresh.weather : competition.weather_forecast as any;
  const hydration = fresh && fresh.id === competition.id ? fresh.hydration : competition.hydration_plan as any;
  const hasTrack = (competition.track_points as any[] | null ?? []).filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).length >= 2;
  const hourly = forecast?.route_hourly as RouteForecast | undefined;
  const text = (key: string) => clothingText(key, activeLang());
  const [departure, setDeparture] = useState(hourly?.departureTime ?? "08:00");
  const [duration, setDuration] = useState(String(hourly?.durationHours ?? Math.round(estimatedRouteHours(competition) * 100) / 100));
  const edited = useRef(false);
  const attempted = useRef("");
  useEffect(() => {
    edited.current = false;
    attempted.current = "";
    setDeparture(hourly?.departureTime ?? "08:00");
    setDuration(String(hourly?.durationHours ?? Math.round(estimatedRouteHours(competition) * 100) / 100));
  }, [competition.id]);
  const durationHours = Number(duration);
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(departure) && Number.isFinite(durationHours) && durationHours >= 0.1 && durationHours <= 24;
  const signature = routeWeatherSignature(competition.track_points ?? [], competition.date, durationHours);
  const currentHourly = hourly?.date === competition.date && hourly?.departureTime === departure && hourly?.durationHours === durationHours && hourly?.signature === signature;
  let arrival = "";
  if (valid) {
    try {
      arrival = new Intl.DateTimeFormat(localeCode(), { timeZone: hourly?.timeZone ?? "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(routeDeparture(competition.date, departure, hourly?.timeZone ?? "Europe/Madrid") + durationHours * 3600000));
    } catch { /* Invalid local time during a daylight-saving transition. */ }
  }

  const availability = forecastAvailability(competition.date);
  const inRange = availability === "available";

  const mut = useMutation({
    mutationFn: async (input: { competitionId: string; departureTime: string; durationHours: number; automatic?: boolean }) => fetchFn({ data: { competitionId: input.competitionId, departureTime: input.departureTime, durationHours: input.durationHours } }),
    onSuccess: (result, input) => {
      setFresh({ id: input.competitionId, weather: { ...result.weather, route_hourly: result.routeHourly }, hydration: result.hydration });
      if (!input.automatic) toast.success(tr("Previsión actualizada"));
      qc.invalidateQueries({ queryKey: ["competition", input.competitionId] });
    },
    onError: (e: any) => toast.error(e.message)
  });
  const requestKey = `${competition.id}:${signature}:${departure}`;
  const { mutate, isPending } = mut;
  useEffect(() => {
    if (!edited.current || !valid || !arrival || !hasTrack || !inRange || currentHourly || isPending || attempted.current === requestKey) return;
    const timer = setTimeout(() => {
      attempted.current = requestKey;
      mutate({ competitionId: competition.id, departureTime: departure, durationHours, automatic: true });
    }, 600);
    return () => clearTimeout(timer);
  }, [requestKey, competition.id, departure, durationHours, valid, arrival, hasTrack, inRange, currentHourly, isPending, mutate]);
  const clothingStatus = !hasTrack ? "no_track" : !inRange ? availability === "past" ? "past" : "far" : !valid || !arrival ? "invalid" : !currentHourly ? mut.isError && attempted.current === requestKey ? "error" : mut.isPending || edited.current ? "loading" : "pending" : undefined;

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">{tr("Clima e hidratación")}</p>
          <h2 className="font-display text-xl font-bold uppercase">{tr("Previsión para la ruta")}</h2>
        </div>
        <Button type="button" size="sm"
          onClick={() => { attempted.current = requestKey; mut.mutate({ competitionId: competition.id, departureTime: departure, durationHours }); }}
          disabled={mut.isPending || !hasTrack || !inRange || !valid || !arrival}
          className="text-xs">
          
          <RefreshCw className={`size-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
          {mut.isPending ? text("loading") : text("update")}
        </Button>
      </div>

      {hasTrack && <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1 min-w-0 text-xs font-semibold">{text("departure")}<Input type="time" value={departure} onChange={e => { edited.current = true; setDeparture(e.target.value); }} /></label>
          <label className="space-y-1 min-w-0 text-xs font-semibold">{text("duration")}<Input type="number" min="0.1" max="24" step="0.1" value={duration} onChange={e => { edited.current = true; setDuration(e.target.value); }} /></label>
        </div>
        {!valid && <p role="alert" className="text-xs text-destructive">{text("invalid")}</p>}
        {arrival && <p className="text-xs text-muted-foreground">{text("arrival")}: {arrival} · {text("zone")} ({hourly?.timeZone ?? "Europe/Madrid"})</p>}
      </div>}

      {!hasTrack &&
      <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4"> {tr("Sube el GPX de la ruta para localizarla y consultar el clima previsto.")} 

      </p>
      }
      {hasTrack && !inRange &&
      <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          {text(availability === "past" ? "past" : "far")}
        </p>
      }

      {hasTrack && forecast && forecast.date === competition.date && inRange &&
      <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric icon={Thermometer} label={tr("Sensación máx.")} value={`${Math.round(forecast.apparent_max_c)}°C`} sub={`${Math.round(forecast.temp_min_c)}–${Math.round(forecast.temp_max_c)}°C`} />
            <Metric icon={Droplets} label={tr("Humedad")} value={`${Math.round(forecast.humidity_pct)}%`} />
            <Metric icon={Wind} label={tr("Viento máx.")} value={`${Math.round(forecast.wind_kmh)} km/h`} />
            <Metric icon={CloudSun} label={tr("Precipitación")} value={`${forecast.precip_mm.toFixed(1)} mm`} />
          </div>
          <p className="text-sm">{forecast.summary}</p>
        </>
      }

      <RouteClothingForecast forecast={currentHourly && inRange && hasTrack ? hourly : undefined} generalWeather={hasTrack && inRange && valid && arrival && !isPending && forecast?.date === competition.date && (currentHourly || (!hourly && !edited.current)) ? forecast : undefined} status={clothingStatus} />

      {hasTrack && hydration && forecast?.date === competition.date && inRange && currentHourly && !clothingStatus &&
      <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Plan de hidratación ajustado al clima")}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${RISK_STYLES[hydration.heat_risk]}`}> {tr("Riesgo térmico")} 
            {hydration.heat_risk}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label={tr("Líquido")} value={`${hydration.fluid_ml_per_hour} ml/h`} sub={`${hydration.total_fluid_ml} ml totales`} />
            <Metric label={tr("Sodio")} value={`${hydration.sodium_mg_per_hour} mg/h`} sub={`${hydration.total_sodium_mg} mg totales`} />
            <Metric label={tr("Bidones 500 ml")} value={`${hydration.bottles_500ml}`} sub="a llevar / recoger" />
            <Metric label={tr("Sales por bidón")} value={`${Math.round(hydration.sodium_mg_per_hour / hydration.fluid_ml_per_hour * 500)} mg`} sub="~500 ml" />
          </div>
          {hydration.recommendations?.length > 0 &&
        <ul className="text-xs space-y-1.5 pt-1">
              {hydration.recommendations.map((r: string, i: number) =>
          <li key={i} className="flex gap-2"><span className="text-primary">▸</span><span>{r}</span></li>
          )}
            </ul>
        }
        </div>
      }
    </div>);

}

function Metric({
  icon: Icon,
  label,
  value,
  sub





}: {icon?: any;label: string;value: string;sub?: string;}) {
  return (
    <div className="rounded-lg border p-3 bg-background">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-muted-foreground">
        {Icon && <Icon className="size-3" />} {label}
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>);

}
