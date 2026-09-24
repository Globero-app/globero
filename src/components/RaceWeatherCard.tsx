import { tr } from "@/lib/i18n";import { CloudSun, Droplets, Wind, Thermometer, RefreshCw, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { fetchRaceWeather } from "@/lib/weather.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";

const RISK_STYLES: Record<string, string> = {
  bajo: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  moderado: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  alto: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  extremo: "bg-destructive/15 text-destructive border-destructive/30"
};

export function RaceWeatherCard({ competition }: {competition: any;}) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchRaceWeather);
  const forecast = competition.weather_forecast as any;
  const hydration = competition.hydration_plan as any;
  const hasTrack = (competition.track_points as any[] | null ?? []).length > 0;

  const daysAway = differenceInCalendarDays(new Date(competition.date), new Date());
  const inRange = daysAway >= 0 && daysAway <= 3;

  const mut = useMutation({
    mutationFn: async () => fetchFn({ data: { competitionId: competition.id } }),
    onSuccess: () => {
      toast.success(tr("Previsión actualizada"));
      qc.invalidateQueries({ queryKey: ["competition", competition.id] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">{tr("Clima e hidratación")}</p>
          <h2 className="font-display text-xl font-bold uppercase">{tr("Previsión para la ruta")}</h2>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !hasTrack || !inRange}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
          
          <RefreshCw className={`size-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
          {mut.isPending ? "Consultando…" : forecast ? "Actualizar" : "Consultar previsión"}
        </button>
      </div>

      {!hasTrack &&
      <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4"> {tr("Sube el GPX de la ruta para localizarla y consultar el clima previsto.")} 

      </p>
      }
      {hasTrack && !inRange && !forecast &&
      <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          {daysAway < 0 ?
        "Esta ruta ya ha pasado." :
        "La previsión puede no ser correcta con tanta antelación: solo está disponible desde 3 días antes hasta el mismo día de la ruta."}
        </p>
      }

      {forecast &&
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

      {hydration &&
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
