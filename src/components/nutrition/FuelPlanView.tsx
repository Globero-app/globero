import { useEffect, useState } from "react";
import { Droplets, Zap, Cookie, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type Lang } from "@/lib/i18n";
import { buildFuelPlan, type GutTolerance, type FuelItem } from "@/lib/fueling";

const T: Record<string, Record<Lang, string>> = {
  title: { es: "Nutrición en ruta", ca: "Nutrició en ruta", fr: "Nutrition en course", en: "On-bike fueling", de: "Verpflegung unterwegs" },
  calc: { es: "Calculadora de avituallamiento", ca: "Calculadora d'avituallament", fr: "Calculateur de ravitaillement", en: "Fueling calculator", de: "Verpflegungsrechner" },
  calcSub: { es: "Calcula qué llevar en una salida libre según horas e intensidad estimada.", ca: "Calcula què portar en una sortida lliure segons hores i intensitat estimada.", fr: "Calcule quoi emporter pour une sortie libre selon la durée et l'intensité estimée.", en: "Work out what to carry on a free ride based on hours and estimated intensity.", de: "Berechne, was du bei einer freien Ausfahrt nach Dauer und geschätzter Intensität mitnehmen solltest." },
  hours: { es: "Duración (h)", ca: "Durada (h)", fr: "Durée (h)", en: "Duration (h)", de: "Dauer (h)" },
  intensity: { es: "Intensidad estimada", ca: "Intensitat estimada", fr: "Intensité estimée", en: "Estimated intensity", de: "Geschätzte Intensität" },
  i_easy: { es: "Suave (Z1-Z2)", ca: "Suau (Z1-Z2)", fr: "Facile (Z1-Z2)", en: "Easy (Z1-Z2)", de: "Locker (Z1-Z2)" },
  i_tempo: { es: "Tempo (Z3)", ca: "Tempo (Z3)", fr: "Tempo (Z3)", en: "Tempo (Z3)", de: "Tempo (Z3)" },
  i_hard: { es: "Umbral (Z4)", ca: "Llindar (Z4)", fr: "Seuil (Z4)", en: "Threshold (Z4)", de: "Schwelle (Z4)" },
  i_race: { es: "Competición", ca: "Competició", fr: "Compétition", en: "Race", de: "Wettkampf" },
  indoor: { es: "Rodillo", ca: "Corró", fr: "Home-trainer", en: "Indoor trainer", de: "Rollentrainer" },
  tol: { es: "Tolerancia gástrica", ca: "Tolerància gàstrica", fr: "Tolérance digestive", en: "Gut tolerance", de: "Magenverträglichkeit" },
  low: { es: "Baja", ca: "Baixa", fr: "Faible", en: "Low", de: "Niedrig" },
  medium: { es: "Media", ca: "Mitjana", fr: "Moyenne", en: "Medium", de: "Mittel" },
  high: { es: "Alta (entrenada)", ca: "Alta (entrenada)", fr: "Élevée (entraînée)", en: "High (trained)", de: "Hoch (trainiert)" },
  perHour: { es: "g CH/hora", ca: "g HC/hora", fr: "g glucides/heure", en: "g carbs/hour", de: "g KH/Stunde" },
  total: { es: "Total", ca: "Total", fr: "Total", en: "Total", de: "Gesamt" },
  fluid: { es: "ml/hora", ca: "ml/hora", fr: "ml/heure", en: "ml/hour", de: "ml/Stunde" },
  bottles: { es: "Bidones 500 ml (30 g CH)", ca: "Bidons 500 ml (30 g HC)", fr: "Bidons 500 ml (30 g glucides)", en: "500 ml bottles (30 g carbs)", de: "500-ml-Flaschen (30 g KH)" },
  gels: { es: "Geles (25 g)", ca: "Gels (25 g)", fr: "Gels (25 g)", en: "Gels (25 g)", de: "Gels (25 g)" },
  bars: { es: "Barritas (40 g)", ca: "Barretes (40 g)", fr: "Barres (40 g)", en: "Bars (40 g)", de: "Riegel (40 g)" },
  schedule: { es: "Pauta horaria", ca: "Pauta horària", fr: "Plan horaire", en: "Timing plan", de: "Zeitplan" },
  sip: { es: "{ml} ml de bidón", ca: "{ml} ml de bidó", fr: "{ml} ml de bidon", en: "{ml} ml from bottle", de: "{ml} ml aus der Flasche" },
  gel: { es: "1 gel", ca: "1 gel", fr: "1 gel", en: "1 gel", de: "1 Gel" },
  halfBar: { es: "½ barrita", ca: "½ barreta", fr: "½ barre", en: "½ bar", de: "½ Riegel" },
  noCarbs: { es: "Sesión corta o suave: basta con agua o electrolitos. Llega bien comido.", ca: "Sessió curta o suau: n'hi ha prou amb aigua o electròlits. Arriba ben menjat.", fr: "Séance courte ou facile : de l'eau ou des électrolytes suffisent. Arrive bien nourri.", en: "Short or easy session: water or electrolytes are enough. Start well fuelled.", de: "Kurze oder lockere Einheit: Wasser oder Elektrolyte reichen. Gut gegessen starten." },
  before: { es: "Antes: 1-1,5 g CH/kg 2-3 h antes. Después: CH + 20-30 g proteína en 30 min.", ca: "Abans: 1-1,5 g HC/kg 2-3 h abans. Després: HC + 20-30 g proteïna en 30 min.", fr: "Avant : 1-1,5 g glucides/kg 2-3 h avant. Après : glucides + 20-30 g de protéines dans les 30 min.", en: "Before: 1-1.5 g carbs/kg 2-3 h prior. After: carbs + 20-30 g protein within 30 min.", de: "Vorher: 1-1,5 g KH/kg 2-3 h davor. Danach: KH + 20-30 g Eiweiß innerhalb von 30 Min." },
  ifLabel: { es: "IF estimado", ca: "IF estimat", fr: "IF estimé", en: "Estimated IF", de: "Geschätzter IF" },
};

export function useFuelT() {
  const { lang } = useI18n();
  return (k: keyof typeof T) => T[k][lang] ?? T[k].es;
}

export function useGutTolerance() {
  const [tol, setTol] = useState<GutTolerance>("medium");
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("gut_tolerance").eq("id", u.user.id).maybeSingle();
      const v = (data as any)?.gut_tolerance;
      if (v) setTol(v);
    })();
  }, []);
  const update = async (v: GutTolerance) => {
    setTol(v);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) await supabase.from("profiles").update({ gut_tolerance: v } as any).eq("id", u.user.id);
  };
  return [tol, update] as const;
}

export function ToleranceSelect({ value, onChange }: { value: GutTolerance; onChange: (v: GutTolerance) => void }) {
  const t = useFuelT();
  return (
    <div>
      <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1">{t("tol")}</p>
      <div className="flex gap-1">
        {(["low", "medium", "high"] as const).map((k) =>
          <button key={k} type="button" onClick={() => onChange(k)}
            className={`px-2 py-1 rounded border text-xs ${value === k ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>{t(k)}</button>)}
      </div>
    </div>
  );
}

const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function FuelPlanView({ minutes, intensityFactor, tolerance, indoor }: { minutes: number; intensityFactor: number; tolerance: GutTolerance; indoor?: boolean }) {
  const t = useFuelT();
  const p = buildFuelPlan(minutes, intensityFactor, tolerance, indoor);
  const label = (i: FuelItem) => t(i);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border p-2"><p className="text-xl font-bold">{p.carbsPerHour}</p><p className="text-[10px] text-muted-foreground">{t("perHour")}</p></div>
        <div className="rounded-lg border p-2"><p className="text-xl font-bold">{p.totalCarbs} g</p><p className="text-[10px] text-muted-foreground">{t("total")}</p></div>
        <div className="rounded-lg border p-2"><p className="text-xl font-bold">{p.fluidPerHour}</p><p className="text-[10px] text-muted-foreground">{t("fluid")}</p></div>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground">{t("ifLabel")}: {intensityFactor.toFixed(2)}</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1.5"><Droplets className="size-4 text-primary" /><b>{p.bottles}</b> {t("bottles")}</div>
        <div className="flex items-center gap-1.5"><Zap className="size-4 text-primary" /><b>{p.gels}</b> {t("gels")}</div>
        <div className="flex items-center gap-1.5"><Cookie className="size-4 text-primary" /><b>{p.bars}</b> {t("bars")}</div>
      </div>
      {p.carbsPerHour === 0 && <p className="text-xs text-muted-foreground">{t("noCarbs")}</p>}
      {p.schedule.length > 0 &&
        <div>
          <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1 flex items-center gap-1"><Clock className="size-3" />{t("schedule")}</p>
          <ul className="text-xs divide-y max-h-56 overflow-y-auto">
            {p.schedule.map((s) =>
              <li key={s.minute} className="py-1 flex gap-3"><span className="font-mono w-10">{fmtMin(s.minute)}</span><span>{s.items.map(label).join(" + ")}</span></li>)}
          </ul>
        </div>}
      <p className="text-[11px] text-muted-foreground">{t("before")}</p>
    </div>
  );
}

const INT = [{ k: "i_easy", v: 0.6 }, { k: "i_tempo", v: 0.75 }, { k: "i_hard", v: 0.88 }, { k: "i_race", v: 0.95 }] as const;

export function FuelingCalculator() {
  const t = useFuelT();
  const [tol, setTol] = useGutTolerance();
  const [hours, setHours] = useState(3);
  const [IF, setIF] = useState(0.75);
  const [indoor, setIndoor] = useState(false);
  return (
    <div className="bg-surface border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold uppercase">{t("calc")}</h2>
        <p className="text-[11px] text-muted-foreground">{t("calcSub")}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs">{t("hours")}: <b>{hours}</b>
          <input type="range" min={0.5} max={8} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full" />
        </label>
        <div>
          <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1">{t("intensity")}</p>
          <div className="flex flex-wrap gap-1">
            {INT.map((o) => <button key={o.k} type="button" onClick={() => setIF(o.v)}
              className={`px-2 py-1 rounded border text-xs ${IF === o.v ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>{t(o.k)}</button>)}
          </div>
        </div>
        <ToleranceSelect value={tol} onChange={setTol} />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} />{t("indoor")}</label>
      </div>
      <FuelPlanView minutes={Math.round(hours * 60)} intensityFactor={IF} tolerance={tol} indoor={indoor} />
    </div>
  );
}

export function WorkoutFuelCard({ minutes, intensityFactor, indoor }: { minutes: number; intensityFactor: number; indoor?: boolean }) {
  const t = useFuelT();
  const [tol, setTol] = useGutTolerance();
  return (
    <div className="rounded-lg border bg-secondary/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider">🍌 {t("title")}</h4>
        <ToleranceSelect value={tol} onChange={setTol} />
      </div>
      <FuelPlanView minutes={minutes} intensityFactor={intensityFactor} tolerance={tol} indoor={indoor} />
    </div>
  );
}
