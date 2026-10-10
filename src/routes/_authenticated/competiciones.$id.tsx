import { tr, activeLang } from "@/lib/i18n";import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateMenu, swapRecipe } from "@/lib/ai.functions";
import { parseGpx, simplifyTrack, trackStats, buildGpxWithWaypoints, pointAtKm } from "@/lib/gpx";
import { planRaceNutrition, dailyMacros } from "@/lib/carbs";
import { GpxMap } from "@/components/GpxMap";
import { GpxElevationChart } from "@/components/GpxElevationChart";
import { injectWaterWaypoints, type WaterSource } from "@/utils/gpxWaterFinder";
import { RaceWeatherCard } from "@/components/RaceWeatherCard";
import { Upload, Download, ChefHat, Sparkles, ArrowLeft, RefreshCcw, FileDown, X, Eye } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/competiciones/$id")({
  head: () => ({ meta: [
    { title: "Detalle de ruta y altimetría — Globero" },
    { name: "description", content: "Recorrido GPX, perfil de elevación, avituallamiento y previsión de tu ruta ciclista en Globero." },
    { property: "og:title", content: "Detalle de ruta y altimetría — Globero" },
    { property: "og:description", content: "Consulta el recorrido, la altimetría y el avituallamiento de tu ruta ciclista." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CompetitionDetail
});

function CompetitionDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const genFn = useServerFn(generateMenu);
  const swapFn = useServerFn(swapRecipe);

  const comp = useQuery({
    queryKey: ["competition", id],
    queryFn: async () => {
      const { data } = await supabase.from("competitions").select("*").eq("id", id).maybeSingle();
      return data;
    }
  });

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
    enabled: !!user
  });

  const [hoverPt, setHoverPt] = useState<{ lat: number; lon: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [viewRecipe, setViewRecipe] = useState<any | null>(null);
  const [waterSources, setWaterSources] = useState<WaterSource[]>([]);
  const [waterSearchComplete, setWaterSearchComplete] = useState(false);
  const [processingGpx, setProcessingGpx] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const processRef = useRef<((text: string, filename: string) => Promise<void>) | null>(null);
  const autoRan = useRef(false);
  useEffect(() => {
    const d: any = comp.data;
    if (!d || autoRan.current || !d.gpx_data || (Array.isArray(d.track_points) && d.track_points.length) || !profile.data) return;
    autoRan.current = true;
    processRef.current?.(d.gpx_data, d.gpx_filename || `${d.name}.gpx`);
  }, [comp.data, profile.data]);

  if (comp.isLoading || !comp.data) return (
    <div className="space-y-6 animate-fade-in">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>);

  const c = comp.data;
  const points = c.track_points as any[] | null ?? [];
  const wpts = c.waypoints as any[] | null ?? [];
  const storedWaterSources = Array.isArray((c.nutrition_plan as any)?.waterSources) ?
  (c.nutrition_plan as any).waterSources as WaterSource[] :
  [];
  const hasStoredWaterSearch = Array.isArray((c.nutrition_plan as any)?.waterSources);
  const displayedWaterSources = waterSearchComplete ? waterSources : storedWaterSources;
  const hasCompletedWaterSearch = waterSearchComplete || hasStoredWaterSearch;

  const handleGpxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await processGpxText(await file.text(), file.name); } finally { e.target.value = ""; }
  };

  const processGpxText = async (text: string, fileName: string) => {
    const file = { name: fileName };
    setProcessingGpx(true);
    setWaterSearchComplete(false);
    try {
      const { points: pts, name } = parseGpx(text);
      if (pts.length < 2) {toast.error(tr("GPX inválido"));return;}
      const stats = trackStats(pts);
      const simplified = simplifyTrack(pts, 800);

      // Fitness score: horas de Intervals.icu últimas 4 semanas → 0-100
      let fitness_score: number | undefined;
      if (user) {
        const since = new Date(Date.now() - 28 * 86400_000).toISOString();
        const { data: acts } = await supabase.
        from("intervals_activities").
        select("moving_time").
        eq("user_id", user.id).
        gte("start_date", since);
        if (acts && acts.length) {
          const hours = acts.reduce((s: number, a: any) => s + (a.moving_time ?? 0), 0) / 3600;
          fitness_score = Math.min(100, Math.round(hours * 4)); // 25h/mes → 100
        }
      }

      // Plan de nutrición adaptativo (perfil + Intervals.icu + perfil altimétrico)
      const plan = planRaceNutrition(
        {
          weight_kg: profile.data?.weight_kg ?? 70,
          ftp: profile.data?.ftp ?? undefined,
          age: profile.data?.age ?? undefined,
          fitness_score
        },
        { distance_km: stats.distance_km, elevation_m: stats.elevation_m, intensity: c.intensity as any, duration_hours: c.duration_hours ?? undefined },
        { km_interval: 15, minute_interval: 30, track: simplified }
      );

      const waypointsWithCoords = plan.waypoints.map((w) => {
        const p = pointAtKm(simplified, w.km);
        return { ...w, lat: p?.lat ?? 0, lon: p?.lon ?? 0 };
      });

      let nearbyWaterSources: WaterSource[] = [];
      try {
        const { fetchWaterSources, filterNearTrack, filterByRouteSpacing } = await import("@/utils/gpxWaterFinder");
        const found = await fetchWaterSources(simplified);
        nearbyWaterSources = filterByRouteSpacing(filterNearTrack(found, simplified, 200), simplified, c.type);
      } catch {
        toast.warning(tr("No se pudieron buscar fuentes de agua"));
      }

      const { error } = await supabase.from("competitions").update({
        gpx_data: text,
        gpx_filename: file.name,
        track_points: simplified as any,
        waypoints: waypointsWithCoords as any,
        nutrition_plan: { total: plan.totalCarbs, perHour: plan.perHour, durationH: plan.durationH, waterSources: nearbyWaterSources } as any,
        distance_km: stats.distance_km,
        elevation_m: stats.elevation_m,
        name: c.name || name || file.name
      }).eq("id", id);
      if (error) throw error;
      setWaterSources(nearbyWaterSources);
      setWaterSearchComplete(true);

      toast.success(tr("GPX procesado"));
      await qc.invalidateQueries({ queryKey: ["competition", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("No se pudo procesar el GPX"));
    } finally {
      setProcessingGpx(false);
    }
  };
  processRef.current = processGpxText;

  const downloadGpx = () => {
    try {
      if (!c.gpx_data && points.length < 2) {toast.error(tr("Sube un GPX y genera el plan primero"));return;}
      let newGpx = buildGpxWithWaypoints(c.gpx_data || "", points, wpts.map((w: any) => ({ km: Number(w.km) || 0, label: w.label || w.note || (w.carbs_g ? "CHO " + w.carbs_g + "g" : "Avituallamiento") })), c.name || "Ruta");
      try { if (displayedWaterSources.length) newGpx = injectWaterWaypoints(newGpx, displayedWaterSources); } catch (e) { console.error(e); }
      const filename = `${(c.name || "ruta").replace(/[\\/:*?"<>|]/g, "_")}_nutricion.gpx`;
      if (!newGpx.trim().startsWith("<?xml")) newGpx = `<?xml version="1.0" encoding="UTF-8"?>\n${newGpx.trim()}`;
      if (!/<\/gpx>\s*$/.test(newGpx)) throw new Error(tr("GPX incompleto"));
      const blob = new Blob([newGpx], { type: "application/gpx+xml;charset=utf-8" });
      const nav: any = navigator;
      if (nav.msSaveOrOpenBlob) { nav.msSaveOrOpenBlob(blob, filename); toast.success(tr("Descarga del GPX iniciada")); return; }
      if (gpxFallback) URL.revokeObjectURL(gpxFallback.url);
      const url = URL.createObjectURL(blob);
      setGpxFallback({ url, filename, xml: newGpx });
      const a = document.createElement("a");a.href = url;a.download = filename;a.target = "_blank";a.rel = "noopener noreferrer";a.style.display = "none";
      document.body.appendChild(a);a.click();
      setTimeout(() => a.remove(), 1000);
      let inIframe = false;
      try { inIframe = window.self !== window.top; } catch { inIframe = true; }
      if (inIframe) { try { window.open(url, "_blank"); } catch { /* usar enlaces alternativos */ } }
      toast.success(tr("Descarga del GPX iniciada"));
    } catch (err) {
      console.error("downloadGpx", err);
      toast.error(err instanceof Error ? err.message : tr("No se pudo descargar el GPX"));
    }
  };

  const handleGenerateMenu = async () => {
    setGenerating(true);
    try {
      await genFn({ data: { competitionId: id } });
      toast.success(tr("Menú generado"));
      qc.invalidateQueries({ queryKey: ["competition", id] });
    } catch (e: any) {toast.error(e.message);} finally
    {setGenerating(false);}
  };

  const handleSwap = async (dayIndex: number, mealKey: any) => {
    setSwapping(`${dayIndex}-${mealKey}`);
    try {
      await swapFn({ data: { competitionId: id, dayIndex, mealKey } });
      toast.success(tr("Receta cambiada"));
      qc.invalidateQueries({ queryKey: ["competition", id] });
    } catch (e: any) {toast.error(e.message);} finally
    {setSwapping(null);}
  };

  const menu = c.menu_plan as any;
  const np = c.nutrition_plan as any;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/competiciones" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="size-3" /> {tr("Volver")} 
        </Link>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">{format(new Date(c.date), "d 'de' MMMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{c.name}</h1>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>{c.distance_km} {tr("km")}</span><span>+{c.elevation_m} {tr("m")}</span><span className="capitalize">{c.type}</span><span className="capitalize">{tr("Intensidad")} {c.intensity}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* GPX & MAP */}
        <div className="bg-surface border rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-xl font-bold uppercase">{tr("Track GPX & Nutrición")}</h2>
            {!c.notes?.startsWith("Ruta aleatoria") && <Button type="button" variant="secondary" size="sm" disabled={processingGpx} onClick={() => gpxInputRef.current?.click()}>
              <Upload className="size-3.5" /> {processingGpx ? "Procesando…" : "Subir GPX"}
            </Button>}
            <input ref={gpxInputRef} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" className="sr-only" onChange={handleGpxUpload} />
          </div>
          {points.length > 0 ?
          <GpxMap points={points} waypoints={wpts.map((w: any) => ({ lat: w.lat, lon: w.lon, label: w.label }))} waterSources={displayedWaterSources} highlight={hoverPt} onHover={setHoverPt} /> :

          <div className="border-2 border-dashed rounded-xl p-12 text-center text-sm text-muted-foreground"> {tr("Sube un archivo .gpx con el track de la competición")} 

          </div>
          }
          <GpxElevationChart points={points} xml={c.gpx_data} onHover={setHoverPt} highlight={hoverPt} />
          {hasCompletedWaterSearch && displayedWaterSources.length === 0 &&
          <p className="text-sm text-muted-foreground">{tr("No se han encontrado fuentes de agua cercanas a menos de 200m a lo largo de la ruta indicada")}</p>
          }
          {np &&
          <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Plan en carrera")}</p>
                  <p className="font-semibold text-sm">{np.perHour} {tr("g/h ·")} {np.total}{tr("g total ·")} {np.durationH}{tr("h estimadas")}</p>
                </div>
                <button onClick={downloadGpx} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold">
                  <Download className="size-3.5" /> {tr("Descargar GPX con waypoints")} 
              </button>
              </div>
              {gpxFallback &&
              <div className="mb-2 p-2 rounded-lg border bg-muted/40 text-xs flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{tr("¿No se ha descargado?")}</span>
                <a href={gpxFallback.url} download={gpxFallback.filename} className="underline font-semibold">{tr("Descargar archivo")}</a>
                <a href={gpxFallback.url} target="_blank" rel="noopener noreferrer" className="underline">{tr("Abrir en nueva pestaña")}</a>
                <button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(gpxFallback.xml); toast.success(tr("GPX copiado al portapapeles")); } catch { toast.error(tr("No se pudo copiar")); } }}>{tr("Copiar contenido GPX al portapapeles")}</button>
              </div>}
              <p className="text-[10px] text-muted-foreground mb-2"> {tr("Dosis ajustadas por perfil, forma (Intervals.icu últimas 4 semanas) y perfil altimétrico.")} 

            </p>
              <div className="max-h-56 overflow-y-auto space-y-1 text-xs">
                {wpts.map((w: any, i: number) =>
              <div key={i} className="flex justify-between items-center gap-2 py-1.5 border-b last:border-0">
                    <span className="font-mono whitespace-nowrap">{tr("KM")} {w.km} {tr("· min")} {w.minute}</span>
                    <span className="text-[10px] text-muted-foreground flex-1 truncate text-right">
                      {w.note}{typeof w.grade_pct === "number" ? ` · ${w.grade_pct > 0 ? "+" : ""}${w.grade_pct}%` : ""}
                    </span>
                    <span className="text-primary font-semibold whitespace-nowrap">{w.carbs_g}{tr("g")}</span>
                  </div>
              )}
              </div>
            </div>
          }
        </div>

        {/* Menu pre-carrera (solo competiciones) */}
        {c.intensity === "competicion" &&
        <div className="bg-surface border rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-xl font-bold uppercase">{tr("Menú Pre-Carrera")}</h2>
            <div className="flex gap-2">
              {menu &&
              <button onClick={() => exportMenuPdf(menu, c)} className="inline-flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg text-xs font-semibold">
                  <FileDown className="size-3.5" /> PDF
                </button>
              }
              <button onClick={handleGenerateMenu} disabled={generating} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                <Sparkles className="size-3.5" /> {generating ? "Generando…" : menu ? "Regenerar" : "Generar Menú Pre-Carrera"}
              </button>
            </div>
          </div>
          {menu ?
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {menu.dias.map((d: any, di: number) => {
              const tgt = dailyMacros(profile.data?.weight_kg ?? 70, menu.dias.length - di);
              return (
                <div key={di} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display font-bold uppercase">{d.dia_label}</h3>
                      <span className="text-[10px] font-mono text-muted-foreground">{tr("Objetivo:")} {d.objetivo_carbohidratos_g}{tr("g CHO ·")} {d.objetivo_calorias_kcal} {tr("kcal")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["desayuno", "comida", "merienda", "cena"] as const).map((k) =>
                    <MealCard key={k} meal={k} recipe={d[k]} onView={() => setViewRecipe(d[k])} onSwap={() => handleSwap(di, k)} swapping={swapping === `${di}-${k}`} />
                    )}
                    </div>
                  </div>);

            })}
            </div> :

          <div className="border-2 border-dashed rounded-xl p-12 text-center text-sm text-muted-foreground">
              <ChefHat className="size-8 mx-auto mb-2 opacity-50" /> {tr("Genera tu menú personalizado con IA.")}
            <br />{tr("Se basa en tu perfil, los datos de la competición")}{c.distance_km ? " " : ""}{tr("y tus actividades de Intervals.icu.")} 
          </div>
          }
        </div>
        }
      </div>

      <RaceWeatherCard competition={c} />

      <PostRaceSection competition={c} onSaved={() => qc.invalidateQueries({ queryKey: ["competition", id] })} />


      {viewRecipe && <RecipeModal recipe={viewRecipe} onClose={() => setViewRecipe(null)} />}
    </div>);

}

function PostRaceSection({ competition, onSaved }: {competition: any;onSaved: () => void;}) {
  const isPast = new Date(competition.date) <= new Date(new Date().toDateString());
  const existing = competition.race_feedback ?? null;
  const [editing, setEditing] = useState(!existing);
  const [energy, setEnergy] = useState<number>(existing?.energy ?? 3);
  const [legs, setLegs] = useState<number>(existing?.legs ?? 3);
  const [nutrition, setNutrition] = useState<number>(existing?.nutrition ?? 3);
  const [hydration, setHydration] = useState<number>(existing?.hydration ?? 3);
  const [pacing, setPacing] = useState<number>(existing?.pacing ?? 3);
  const [overall, setOverall] = useState<number>(existing?.overall ?? 3);
  const [worked, setWorked] = useState<string>(existing?.what_worked ?? "");
  const [didnt, setDidnt] = useState<string>(existing?.what_didnt ?? "");
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  if (!isPast) return null;

  const save = async () => {
    setSaving(true);
    const payload = { energy, legs, nutrition, hydration, pacing, overall, what_worked: worked, what_didnt: didnt, notes, saved_at: new Date().toISOString() };
    const { error } = await supabase.from("competitions").update({ race_feedback: payload as any }).eq("id", competition.id);
    setSaving(false);
    if (error) {toast.error(error.message);return;}
    toast.success(tr("Feedback guardado. La IA lo usará en próximos planes."));
    setEditing(false);
    onSaved();
  };

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">{tr("Post-carrera")}</p>
          <h2 className="font-display text-xl font-bold uppercase">{tr("¿Cómo fue la competición?")}</h2>
          <p className="text-xs text-muted-foreground mt-1">{tr("La IA aprenderá y ajustará tus próximos planes y nutrición.")}</p>
        </div>
        {existing && !editing &&
        <button onClick={() => setEditing(true)} className="text-xs font-semibold bg-secondary px-3 py-1.5 rounded-lg">{tr("Editar")}</button>
        }
      </div>

      {!editing && existing ?
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <Stat label={tr("Energía")} value={existing.energy} />
          <Stat label={tr("Piernas")} value={existing.legs} />
          <Stat label={tr("Nutrición")} value={existing.nutrition} />
          <Stat label={tr("Hidratación")} value={existing.hydration} />
          <Stat label={tr("Ritmo")} value={existing.pacing} />
          <Stat label={tr("Global")} value={existing.overall} highlight />
          {existing.what_worked && <div className="sm:col-span-3"><p className="text-[10px] uppercase font-mono text-muted-foreground">{tr("Funcionó")}</p><p>{existing.what_worked}</p></div>}
          {existing.what_didnt && <div className="sm:col-span-3"><p className="text-[10px] uppercase font-mono text-muted-foreground">{tr("No funcionó")}</p><p>{existing.what_didnt}</p></div>}
          {existing.notes && <div className="sm:col-span-3"><p className="text-[10px] uppercase font-mono text-muted-foreground">{tr("Notas")}</p><p className="text-muted-foreground">{existing.notes}</p></div>}
        </div> :

      <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Rating label={tr("Energía durante la carrera")} value={energy} onChange={setEnergy} lo="agotado" hi="enchufado" />
            <Rating label={tr("Sensación de piernas")} value={legs} onChange={setLegs} lo="cargadas" hi="ligeras" />
            <Rating label={tr("Nutrición")} value={nutrition} onChange={setNutrition} lo="mal (pájara/molestias)" hi="perfecta" />
            <Rating label={tr("Hidratación")} value={hydration} onChange={setHydration} lo="deshidratado" hi="óptima" />
            <Rating label={tr("Gestión del ritmo")} value={pacing} onChange={setPacing} lo="descontrolado" hi="muy bien" />
            <Rating label={tr("Valoración global")} value={overall} onChange={setOverall} lo="mala" hi="excelente" />
          </div>
          <Field label={tr("¿Qué funcionó? (geles, comida, estrategia, descanso…)")}>
            <textarea className="input min-h-[60px]" value={worked} onChange={(e) => setWorked(e.target.value)} placeholder={tr("Ej: geles cada 30min, plato de pasta la noche antes, salida conservadora…")} />
          </Field>
          <Field label={tr("¿Qué NO funcionó?")}>
            <textarea className="input min-h-[60px]" value={didnt} onChange={(e) => setDidnt(e.target.value)} placeholder={tr("Ej: barritas pesadas, salí muy rápido, faltó agua entre KM 40-60…")} />
          </Field>
          <Field label={tr("Notas adicionales")}>
            <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Tiempo, condiciones, dolores, aprendizajes…")} />
          </Field>
          <div className="flex justify-end gap-2">
            {existing && <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-md hover:bg-secondary">{tr("Cancelar")}</button>}
            <button onClick={save} disabled={saving} className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar feedback"}
            </button>
          </div>
          <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}`}</style>
        </div>
      }
    </div>);

}

function Field({ label, children }: {label: string;children: React.ReactNode;}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>);

}

function Rating({ label, value, onChange, lo, hi }: {label: string;value: number;onChange: (n: number) => void;lo: string;hi: string;}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) =>
        <button key={n} onClick={() => onChange(n)} className={`flex-1 py-2 rounded-md border-2 text-sm font-bold transition ${value === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>
            {n}
          </button>
        )}
      </div>
      <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground mt-1">
        <span>1 · {lo}</span><span>5 · {hi}</span>
      </div>
    </div>);

}

function Stat({ label, value, highlight }: {label: string;value: number;highlight?: boolean;}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/30" : "bg-background"}`}>
      <p className="text-[10px] uppercase font-mono text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}<span className="text-xs text-muted-foreground">/5</span></p>
    </div>);

}

function MealCard({ meal, recipe, onView, onSwap, swapping }: any) {
  return (
    <div className="bg-background border rounded-lg p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-primary font-bold">{meal}</p>
      <p className="text-sm font-semibold leading-tight">{recipe.nombre}</p>
      <p className="text-[10px] text-muted-foreground">{recipe.macros.carbohidratos_g}{tr("g CHO ·")} {recipe.macros.calorias_kcal} {tr("kcal")}</p>
      <div className="flex gap-1">
        <button onClick={onView} className="flex-1 text-[10px] font-semibold bg-secondary px-2 py-1 rounded inline-flex items-center justify-center gap-1">
          <Eye className="size-3" /> {tr("Ver Receta")} 
        </button>
        <button onClick={onSwap} disabled={swapping} className="flex-1 text-[10px] font-semibold bg-secondary px-2 py-1 rounded inline-flex items-center justify-center gap-1 disabled:opacity-50">
          <RefreshCcw className={`size-3 ${swapping ? "animate-spin" : ""}`} /> {tr("Cambiar")} 
        </button>
      </div>
    </div>);

}

function RecipeModal({ recipe, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background border rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <h3 className="font-display text-2xl font-bold uppercase">{recipe.nombre}</h3>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-secondary rounded p-2"><p className="text-[10px] text-muted-foreground">{tr("CHO")}</p><p className="font-semibold text-primary">{recipe.macros.carbohidratos_g}{tr("g")}</p></div>
          <div className="bg-secondary rounded p-2"><p className="text-[10px] text-muted-foreground">{tr("Prot.")}</p><p className="font-semibold">{recipe.macros.proteinas_g}{tr("g")}</p></div>
          <div className="bg-secondary rounded p-2"><p className="text-[10px] text-muted-foreground">{tr("Grasa")}</p><p className="font-semibold">{recipe.macros.grasas_g}{tr("g")}</p></div>
          <div className="bg-secondary rounded p-2"><p className="text-[10px] text-muted-foreground">{tr("Kcal")}</p><p className="font-semibold">{recipe.macros.calorias_kcal}</p></div>
        </div>
        <div>
          <h4 className="font-display font-bold uppercase text-sm mb-2">{tr("Ingredientes")}</h4>
          <ul className="text-sm space-y-1 list-disc list-inside">
            {recipe.ingredientes.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold uppercase text-sm mb-2">{tr("Preparación")}</h4>
          <p className="text-sm leading-relaxed text-muted-foreground">{recipe.preparacion}</p>
        </div>
      </div>
    </div>);

}

async function exportMenuPdf(menu: any, comp: any) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 15;
  doc.setFontSize(18);doc.text(`Menú Pre-Carrera — ${comp.name}`, 15, y);y += 8;
  doc.setFontSize(10);doc.setTextColor(100);doc.text(`Competición: ${comp.date} · ${comp.distance_km}km +${comp.elevation_m}m`, 15, y);y += 10;
  doc.setTextColor(0);
  menu.dias.forEach((d: any) => {
    if (y > 250) {doc.addPage();y = 15;}
    doc.setFontSize(14);doc.text(d.dia_label, 15, y);y += 6;
    doc.setFontSize(9);doc.setTextColor(120);
    doc.text(`Objetivo: ${d.objetivo_carbohidratos_g}g CHO · ${d.objetivo_calorias_kcal} kcal`, 15, y);y += 6;
    doc.setTextColor(0);
    (["desayuno", "comida", "merienda", "cena"] as const).forEach((k) => {
      if (y > 270) {doc.addPage();y = 15;}
      const r = d[k];
      doc.setFontSize(11);doc.setFont(undefined as any, "bold");doc.text(`${k.toUpperCase()}: ${r.nombre}`, 15, y);y += 5;
      doc.setFont(undefined as any, "normal");doc.setFontSize(9);
      r.ingredientes.forEach((i: string) => {
        const lines = doc.splitTextToSize("• " + i, 180);
        doc.text(lines, 18, y);y += lines.length * 4;
      });
      doc.setFontSize(8);doc.setTextColor(100);
      doc.text(`${r.macros.carbohidratos_g}g CHO · ${r.macros.proteinas_g}g prot · ${r.macros.grasas_g}g grasa · ${r.macros.calorias_kcal} kcal`, 18, y);y += 6;
      doc.setTextColor(0);
    });
    y += 4;
  });
  doc.save(`menu_${comp.name.replace(/\s+/g, "_")}.pdf`);
}
