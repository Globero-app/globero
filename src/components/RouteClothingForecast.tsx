import { activeLang, localeCode } from "@/lib/i18n";
import { clothingText } from "@/lib/route-clothing-i18n";
import { clothingFromForecast, clothingFromWeather, type RouteForecast } from "@/lib/route-weather";
import type { WeatherDay } from "@/lib/weather";
import { Shirt, Wind, Droplets, AlertTriangle, Layers, Thermometer, LoaderCircle } from "lucide-react";
import kitImage from "@/assets/route-cycling-kit.jpg";

export function RouteClothingForecast({ forecast, generalWeather, status }: { forecast?: RouteForecast; generalWeather?: WeatherDay; status?: string }) {
  const lang = activeLang();
  const text = (key: string) => clothingText(key, lang);
  const hourlyRecommendation = status ? null : clothingFromForecast(forecast);
  const recommendation = hourlyRecommendation ?? (!status || status === "pending" || status === "error" ? clothingFromWeather(generalWeather) : null);
  const isFallback = Boolean(recommendation && !hourlyRecommendation);
  const samples = (forecast?.samples ?? []).filter(sample => [sample.timestamp, sample.temperature, sample.apparent, sample.km, sample.wind, sample.rain, sample.rainProbability].every(Number.isFinite));
  const time = (timestamp: number) => new Intl.DateTimeFormat(localeCode(), { timeZone: forecast?.timeZone ?? "Europe/Madrid", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(timestamp));
  return <section className="space-y-4 border-t pt-4 min-w-0">
    {forecast && !status && <>
    <h3 className="font-display text-lg font-bold">{text("conditions")}</h3>
    <p className="text-xs text-muted-foreground">{text("zone")}: {forecast.timeZone}</p>
    {hourlyRecommendation && <p className="text-sm font-semibold">{Math.round(hourlyRecommendation.min)}–{Math.round(hourlyRecommendation.max)} °C · <Wind className="inline size-3.5" /> {Math.round(hourlyRecommendation.wind)} km/h · <Droplets className="inline size-3.5" /> {hourlyRecommendation.rain.toFixed(1)} mm/h · {hourlyRecommendation.probability}%</p>}
    <div className="flex gap-2 overflow-x-auto pb-2" aria-label={text("conditions")}>
      {samples.map(sample => <div key={sample.timestamp} className="shrink-0 w-32 rounded-lg border bg-background p-3 space-y-1 text-xs">
        <p className="text-muted-foreground">{time(sample.timestamp)}</p>
        <p className="text-xl font-bold">{Math.round(sample.temperature)} °C</p>
        <p>{text("feel")}: {Math.round(sample.apparent)} °C</p>
        <p className="font-mono text-primary">km {sample.km.toFixed(1)}</p>
        <p><Wind className="inline size-3" /> {Math.round(sample.wind)} km/h</p>
        <p><Droplets className="inline size-3" /> {sample.rain.toFixed(1)} mm/h · {sample.rainProbability}%</p>
      </div>)}
    </div>
    </>}
    <div className="border-t pt-4 space-y-4" aria-busy={status === "loading"} aria-live="polite">
    <h3 className="font-display text-lg font-bold flex items-center gap-2"><Shirt className="size-5 text-primary" />{text("title")}</h3>
    {!recommendation ? <div role="status" className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
      {status === "loading" ? <LoaderCircle className="size-6 shrink-0 animate-spin motion-reduce:animate-none" /> : <Shirt className="size-6 shrink-0" />}
      <p>{text(status ?? (forecast ? "incomplete" : "pending"))}</p>
    </div> : <>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5 items-start">
        <div className="min-w-0 space-y-3">
          <p className="font-display text-2xl font-bold uppercase">{text(recommendation.min < 8 ? "cold_kit" : recommendation.min < 18 ? "mild_kit" : "warm_kit")}</p>
          <p className="flex items-center gap-2 font-semibold"><Thermometer className="size-4 text-primary" />{Math.round(recommendation.min)}–{Math.round(recommendation.max)} °C</p>
          <figure className="max-w-56 space-y-1">
            <img src={kitImage} alt={text("kit_image")} width={1024} height={1024} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
            <figcaption className="text-[10px] text-muted-foreground">{text("kit_image")}</figcaption>
          </figure>
        </div>
      <dl className="divide-y border-y min-w-0">
        {([ ["upper", recommendation.upper], ["legs", recommendation.legs], ["extras", recommendation.accessories] ] as const).map(([category, items]) => <div key={category} className="grid sm:grid-cols-[160px_1fr] gap-2 py-3">
          <dt className="text-xs uppercase font-semibold text-muted-foreground flex items-start gap-2">{category === "extras" ? <Layers className="size-4 shrink-0" /> : <Shirt className="size-4 shrink-0" />}{text(category)}</dt>
          <dd className="text-sm"><ul className="space-y-1">{items.map(item => <li key={item}>{text(item)}</li>)}</ul></dd>
        </div>)}
      </dl>
      </div>
      <p className="text-xs text-muted-foreground">{text(isFallback ? "fallback_guidance" : "guidance")}</p>
      {(recommendation.cold || recommendation.strongWind || recommendation.heavyRain) && <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{text("risk")}</p>}
    </>}
    </div>
  </section>;
}