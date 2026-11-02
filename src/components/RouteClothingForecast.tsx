import { activeLang, localeCode } from "@/lib/i18n";
import { clothingText } from "@/lib/route-clothing-i18n";
import { recommendClothing, type RouteForecast } from "@/lib/route-weather";
import { Shirt, Wind, Droplets, AlertTriangle } from "lucide-react";

export function RouteClothingForecast({ forecast }: { forecast: RouteForecast }) {
  const lang = activeLang();
  const text = (key: string) => clothingText(key, lang);
  const recommendation = forecast.complete ? recommendClothing(forecast.samples) : null;
  const time = (timestamp: number) => new Intl.DateTimeFormat(localeCode(), { timeZone: forecast.timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(timestamp));
  return <section className="space-y-4 border-t pt-4 min-w-0">
    <h3 className="font-display text-lg font-bold flex items-center gap-2"><Shirt className="size-5 text-primary" />{text("title")}</h3>
    <p className="text-xs text-muted-foreground">{text("zone")}: {forecast.timeZone}</p>
    {recommendation && <p className="text-sm font-semibold">{Math.round(recommendation.min)}–{Math.round(recommendation.max)} °C · <Wind className="inline size-3.5" /> {Math.round(recommendation.wind)} km/h · <Droplets className="inline size-3.5" /> {recommendation.rain.toFixed(1)} mm/h · {recommendation.probability}%</p>}
    <div className="flex gap-2 overflow-x-auto pb-2" aria-label={text("conditions")}>
      {forecast.samples.map(sample => <div key={sample.timestamp} className="shrink-0 w-32 rounded-lg border bg-background p-3 space-y-1 text-xs">
        <p className="text-muted-foreground">{time(sample.timestamp)}</p>
        <p className="text-xl font-bold">{Math.round(sample.temperature)} °C</p>
        <p>{text("feel")}: {Math.round(sample.apparent)} °C</p>
        <p className="font-mono text-primary">km {sample.km.toFixed(1)}</p>
        <p><Wind className="inline size-3" /> {Math.round(sample.wind)} km/h</p>
        <p><Droplets className="inline size-3" /> {sample.rain.toFixed(1)} mm/h · {sample.rainProbability}%</p>
      </div>)}
    </div>
    {!recommendation ? <p role="status" className="text-sm text-muted-foreground">{text("incomplete")}</p> : <>
      <dl className="divide-y">
        {([ ["upper", recommendation.upper], ["legs", recommendation.legs], ["extras", recommendation.accessories] ] as const).map(([category, items]) => <div key={category} className="grid sm:grid-cols-[160px_1fr] gap-2 py-3">
          <dt className="text-xs uppercase font-semibold text-muted-foreground">{text(category)}</dt>
          <dd className="text-sm"><ul className="space-y-1">{items.map(item => <li key={item}>{text(item)}</li>)}</ul></dd>
        </div>)}
      </dl>
      <p className="text-xs text-muted-foreground">{text("guidance")}</p>
      {(recommendation.cold || recommendation.strongWind || recommendation.heavyRain) && <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{text("risk")}</p>}
    </>}
  </section>;
}