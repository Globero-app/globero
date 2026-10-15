import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, type Lang } from "@/lib/i18n";
import { calculateDrinkMix, type MixRatio } from "@/lib/drink-mix";

const TEXT: Record<Lang, string[]> = {
  es: ["Calculadora de mezclas", "Carbohidratos por bidón (g)", "Volumen final del bidón (ml)", "Número de bidones", "Maltodextrina : fructosa", "Sodio (mg/l)", "Por bidón", "Total para preparar", "Maltodextrina", "Fructosa", "Sal de mesa", "Agua hasta", "Concentración", "Sodio por bidón", "Introduce cantidades válidas.", "Mezcla concentrada (>8%): prueba tu tolerancia en entrenamientos y acompaña con agua según tus necesidades.", "Cantidades para polvos puros de carbohidratos. La sal de mesa aporta aproximadamente un 39,3% de sodio. Ajusta el sodio a tus necesidades; comprueba las etiquetas de tus ingredientes."],
  ca: ["Calculadora de mescles", "Hidrats per bidó (g)", "Volum final del bidó (ml)", "Nombre de bidons", "Maltodextrina : fructosa", "Sodi (mg/l)", "Per bidó", "Total per preparar", "Maltodextrina", "Fructosa", "Sal de taula", "Aigua fins a", "Concentració", "Sodi per bidó", "Introdueix quantitats vàlides.", "Mescla concentrada (>8%): prova la tolerància entrenant i acompanya amb aigua segons les teves necessitats.", "Quantitats per a pols purs d'hidrats. La sal de taula aporta aproximadament un 39,3% de sodi. Ajusta el sodi a les teves necessitats; comprova les etiquetes dels ingredients."],
  fr: ["Calculateur de mélanges", "Glucides par bidon (g)", "Volume final du bidon (ml)", "Nombre de bidons", "Maltodextrine : fructose", "Sodium (mg/l)", "Par bidon", "Total à préparer", "Maltodextrine", "Fructose", "Sel de table", "Eau jusqu'à", "Concentration", "Sodium par bidon", "Saisis des quantités valides.", "Mélange concentré (>8 %) : teste ta tolérance à l'entraînement et bois de l'eau selon tes besoins.", "Quantités pour des poudres pures de glucides. Le sel de table contient environ 39,3 % de sodium. Adapte le sodium à tes besoins ; vérifie les étiquettes des ingrédients."],
  en: ["Drink mix calculator", "Carbs per bottle (g)", "Final bottle volume (ml)", "Number of bottles", "Maltodextrin : fructose", "Sodium (mg/l)", "Per bottle", "Total to prepare", "Maltodextrin", "Fructose", "Table salt", "Water up to", "Concentration", "Sodium per bottle", "Enter valid quantities.", "Concentrated mix (>8%): test your tolerance in training and drink water according to your needs.", "Quantities assume pure carbohydrate powders. Table salt contains approximately 39.3% sodium. Adjust sodium to your needs; check ingredient labels."],
  de: ["Getränkemix-Rechner", "Kohlenhydrate pro Flasche (g)", "Endvolumen der Flasche (ml)", "Anzahl der Flaschen", "Maltodextrin : Fruktose", "Natrium (mg/l)", "Pro Flasche", "Gesamtmenge", "Maltodextrin", "Fruktose", "Speisesalz", "Wasser bis", "Konzentration", "Natrium pro Flasche", "Gültige Mengen eingeben.", "Konzentrierte Mischung (>8%): Verträglichkeit im Training testen und nach Bedarf Wasser trinken.", "Mengen gelten für reine Kohlenhydratpulver. Speisesalz enthält ungefähr 39,3% Natrium. Natrium an deinen Bedarf anpassen; Zutatenetiketten prüfen."],
};

export function useMixT() {
  const { lang } = useI18n();
  return (index: number) => TEXT[lang][index];
}

export function DrinkMixCalculator() {
  const t = useMixT();
  const { lang } = useI18n();
  const [carbs, setCarbs] = useState(60);
  const [volume, setVolume] = useState(750);
  const [bottles, setBottles] = useState(2);
  const [sodium, setSodium] = useState(600);
  const [ratio, setRatio] = useState<MixRatio>("2:1");
  const mix = calculateDrinkMix(carbs, volume, bottles, ratio, sodium);
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 1 });
  const fields = [
    { label: 1, value: carbs, set: setCarbs, min: 0, step: 5 },
    { label: 2, value: volume, set: setVolume, min: 1, step: 50 },
    { label: 3, value: bottles, set: setBottles, min: 1, step: 1 },
    { label: 5, value: sodium, set: setSodium, min: 0, step: 50 },
  ];
  return <section className="space-y-5">
    <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2"><FlaskConical className="size-5 text-primary" />{t(0)}</h2>
    <div className="grid sm:grid-cols-2 gap-4">
      {fields.map((field) => <label key={field.label} className="text-sm space-y-1.5 block">
        <span>{t(field.label)}</span>
        <Input type="number" min={field.min} step={field.step} value={Number.isNaN(field.value) ? "" : field.value} onChange={(e) => field.set(e.target.value === "" ? NaN : Number(e.target.value))} />
      </label>)}
      <div className="space-y-1.5"><label htmlFor="mix-ratio" className="text-sm">{t(4)}</label>
        <Select value={ratio} onValueChange={(v) => { if (v === "2:1" || v === "1:0.8") setRatio(v); }}>
          <SelectTrigger id="mix-ratio"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="2:1">2 : 1</SelectItem><SelectItem value="1:0.8">1 : 0,8</SelectItem></SelectContent>
        </Select>
      </div>
    </div>
    {!mix ? <p role="alert" className="text-sm text-destructive">{t(14)}</p> : <div aria-live="polite" className="space-y-4">
      <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <thead><tr className="border-b"><th className="py-3" /><th className="py-3 px-2">{t(6)}</th><th className="py-3 px-2">{t(7)}</th></tr></thead>
        <tbody>{[
          [t(8), `${fmt(mix.maltodextrin)} g`, `${fmt(mix.totalMaltodextrin)} g`],
          [t(9), `${fmt(mix.fructose)} g`, `${fmt(mix.totalFructose)} g`],
          [t(10), `${fmt(mix.salt)} g`, `${fmt(mix.totalSalt)} g`],
          [t(11), `${fmt(volume)} ml`, `${fmt(mix.totalWaterMl)} ml`],
        ].map(([label, each, total]) => <tr key={label} className="border-b"><th className="py-3 font-medium">{label}</th><td className="p-2 font-mono">{each}</td><td className="p-2 font-mono">{total}</td></tr>)}</tbody>
      </table></div>
      <p className="text-xs text-muted-foreground">{t(12)}: {fmt(mix.concentration)}% · {t(13)}: {fmt(mix.sodiumMg)} mg</p>
      {mix.concentration > 8 && <p className="text-sm text-muted-foreground">{t(15)}</p>}
    </div>}
    <p className="text-xs text-muted-foreground">{t(16)}</p>
  </section>;
}