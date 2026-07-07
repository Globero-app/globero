import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Pause, RotateCcw, Gauge, CheckCircle2, ChevronRight, Download, Bike, FileDown, CheckCheck } from "lucide-react";
import { computePowerZones, computeHrZones, ftpFrom20Min, lthrFrom20Min } from "@/lib/zones";
import { downloadFit, type FitWorkoutStep } from "@/lib/fit-writer";
import { downloadZwo, type ZwoStep } from "@/lib/zwo-writer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { stravaImportFtpTest, markFtpTestCompleted } from "@/lib/strava.functions";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/ftp-test")({
  component: FtpTestPage,
});

interface Phase { key: string; label: string; seconds: number; instruction: string; targetPctFtp?: [number, number]; }

const PHASES: Phase[] = [
  { key: "wu1", label: "Calentamiento suave", seconds: 10 * 60, instruction: "Rueda en Z1-Z2, cadencia 85-95 rpm. Objetivo: subir pulso progresivamente.", targetPctFtp: [45, 65] },
  { key: "wu2", label: "3 aceleraciones", seconds: 6 * 60, instruction: "3 x 1 min alta cadencia (100-110 rpm) + 1 min suave entre cada una.", targetPctFtp: [70, 90] },
  { key: "wu3", label: "Rodaje suave", seconds: 5 * 60, instruction: "Baja pulso rodando en Z1 antes del bloque duro.", targetPctFtp: [45, 60] },
  { key: "effort", label: "★ 20 min ALL-OUT", seconds: 20 * 60, instruction: "Da el máximo SOSTENIBLE 20 min. Al terminar apuntarás la potencia media (o FC media si no tienes potenciómetro).", targetPctFtp: [95, 110] },
  { key: "cd", label: "Vuelta a la calma", seconds: 10 * 60, instruction: "Z1 muy suave. Respira, hidrátate.", targetPctFtp: [40, 55] },
];

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Construye los pasos del test FTP como bloque estándar de entrenamiento. */
function buildTestSteps(referenceFtp: number): Array<ZwoStep & FitWorkoutStep & { intensity: any }> {
  // Traducimos las fases a pasos con targets de potencia relativos al FTP de referencia.
  const steps: Array<any> = [];
  const pct = (p: number) => Math.round((p / 100) * referenceFtp);

  // Fase 1: calentamiento continuo (Warmup)
  steps.push({
    name: "Calentamiento",
    description: "Z1-Z2, cadencia 85-95 rpm",
    duration_type: "time", duration_seconds: 10 * 60, duration_value: 10 * 60,
    target: "power", target_low: pct(45), target_high: pct(65),
    intensity: "warmup",
  });
  // Fase 2: 3 x (1 min alta cadencia + 1 min suave)
  for (let i = 0; i < 3; i++) {
    steps.push({
      name: `Acel ${i + 1}`,
      description: "Alta cadencia 100-110 rpm",
      duration_type: "time", duration_seconds: 60, duration_value: 60,
      target: "power", target_low: pct(75), target_high: pct(90),
      intensity: "interval",
    });
    steps.push({
      name: "Recuperación",
      description: "Suave entre aceleraciones",
      duration_type: "time", duration_seconds: 60, duration_value: 60,
      target: "power", target_low: pct(50), target_high: pct(60),
      intensity: "recovery",
    });
  }
  // Fase 3: rodaje suave antes del bloque duro
  steps.push({
    name: "Rodaje",
    description: "Baja pulso antes del all-out",
    duration_type: "time", duration_seconds: 5 * 60, duration_value: 5 * 60,
    target: "power", target_low: pct(45), target_high: pct(60),
    intensity: "active",
  });
  // Fase 4: 20 min ALL-OUT
  steps.push({
    name: "FTP 20 min",
    description: "Máximo sostenible 20 min",
    duration_type: "time", duration_seconds: 20 * 60, duration_value: 20 * 60,
    target: "power", target_low: pct(95), target_high: pct(105),
    intensity: "interval",
  });
  // Fase 5: vuelta a la calma
  steps.push({
    name: "Vuelta calma",
    description: "Z1 muy suave",
    duration_type: "time", duration_seconds: 10 * 60, duration_value: 10 * 60,
    target: "power", target_low: pct(40), target_high: pct(55),
    intensity: "cooldown",
  });
  return steps;
}

function FtpTestPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const importFromStrava = useServerFn(stravaImportFtpTest);
  const markCompleted = useServerFn(markFtpTestCompleted);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ftp,strava_access_token,ftp_test_completed_at").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const stravaConnected = !!profileQ.data?.strava_access_token;

  // Actividades recientes de Strava con potencia y ≥ 30 min (candidatas a test FTP)
  const recentActs = useQuery({
    queryKey: ["strava-ftp-candidates", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("strava_activities")
        .select("id,name,start_date,moving_time,distance,average_watts,total_elevation_gain")
        .eq("user_id", user!.id)
        .gte("moving_time", 20 * 60)
        .not("average_watts", "is", null)
        .order("start_date", { ascending: false })
        .limit(15);
      return data ?? [];
    },
    enabled: !!user && stravaConnected,
  });

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [avgWatts, setAvgWatts] = useState<string>("");
  const [avgHr, setAvgHr] = useState<string>("");
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const phase = PHASES[phaseIdx];
  const totalSecs = phase.seconds;
  const remaining = Math.max(0, totalSecs - elapsed);
  const pct = Math.min(100, (elapsed / totalSecs) * 100);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [running]);

  // Auto-avance de fase
  useEffect(() => {
    if (elapsed >= totalSecs) {
      if (phaseIdx < PHASES.length - 1) {
        // beep simple
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const o = ctx.createOscillator();
          o.type = "sine"; o.frequency.value = 880;
          o.connect(ctx.destination); o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
        } catch (_) { /* ignore */ }
        setPhaseIdx((p) => p + 1);
        setElapsed(0);
      } else {
        setRunning(false);
        setFinished(true);
      }
    }
  }, [elapsed, totalSecs, phaseIdx]);

  const reset = () => { setRunning(false); setPhaseIdx(0); setElapsed(0); setFinished(false); setSaved(null); setAvgWatts(""); setAvgHr(""); };

  const skipPhase = () => {
    if (phaseIdx < PHASES.length - 1) { setPhaseIdx(phaseIdx + 1); setElapsed(0); }
    else { setRunning(false); setFinished(true); }
  };

  const estimatedFtp = useMemo(() => {
    const n = Number(avgWatts);
    return n > 0 ? ftpFrom20Min(n) : null;
  }, [avgWatts]);

  const estimatedLthr = useMemo(() => {
    const n = Number(avgHr);
    return n > 0 ? lthrFrom20Min(n) : null;
  }, [avgHr]);

  const powerZones = useMemo(() => computePowerZones(estimatedFtp), [estimatedFtp]);
  const hrZones = useMemo(() => computeHrZones(estimatedLthr, profileQ.data?.max_hr ?? null), [estimatedLthr, profileQ.data?.max_hr]);
  const [zonesMode, setZonesMode] = useState<"watts" | "hr">((profileQ.data?.zones_display_mode as any) || "watts");
  useEffect(() => {
    if (profileQ.data?.zones_display_mode) setZonesMode(profileQ.data.zones_display_mode as any);
  }, [profileQ.data?.zones_display_mode]);
  const zones = zonesMode === "hr" ? hrZones : powerZones;
  const unit = zonesMode === "hr" ? "bpm" : "W";

  const save = async () => {
    if (!user) { toast.error("Debes iniciar sesión"); return; }
    if (!estimatedFtp && !estimatedLthr) { toast.error("Introduce potencia media o FC media de los 20 min"); return; }
    const payload: any = { id: user.id, email: user.email ?? "", ftp_test_completed_at: new Date().toISOString() };
    if (estimatedFtp) payload.ftp = estimatedFtp;
    if (estimatedLthr) payload.lthr = estimatedLthr;
    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });
    if (error) return toast.error(error.message);
    setSaved(estimatedFtp ?? 0);
    qc.invalidateQueries({ queryKey: ["profile"] });
    const parts = [
      estimatedFtp ? `FTP: ${estimatedFtp} W` : null,
      estimatedLthr ? `LTHR: ${estimatedLthr} bpm` : null,
    ].filter(Boolean).join(" · ");
    toast.success(`Guardado (${parts}). Zonas calculadas.`);
  };

  const referenceFtp = profileQ.data?.ftp && profileQ.data.ftp > 0 ? profileQ.data.ftp : 200;

  const handleDownloadZwo = () => {
    const steps = buildTestSteps(referenceFtp);
    downloadZwo(
      { name: "Test FTP 20min", description: `Protocolo Coggan 20 min. FTP referencia: ${referenceFtp}W. FTP real ≈ 0.95 × media de los 20 min.`, author: "Sentmenat Bici", steps },
      referenceFtp,
      "test-ftp-20min",
    );
    toast.success(".zwo descargado. Súbelo a Zwift o TrainingPeaks.");
  };

  const handleDownloadFit = () => {
    const steps = buildTestSteps(referenceFtp);
    downloadFit({ name: "Test FTP", sport: "cycling", steps: steps as FitWorkoutStep[] }, "test-ftp-20min");
    toast.success(".fit descargado. Copíalo a tu ciclocomputador (Garmin, Wahoo).");
  };

  const handleImportStrava = async (activityId: string) => {
    setImportingId(activityId);
    try {
      const r = await importFromStrava({ data: { activity_id: activityId } });
      toast.success(`FTP calculado: ${r.ftp} W (mejor 20' = ${r.avg_watts_20min} W)`);
      setSaved(r.ftp);
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setImportingId(null); }
  };

  const handleMarkOnly = async () => {
    try {
      await markCompleted({ data: undefined });
      toast.success("Test marcado como realizado.");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Onboarding · Prueba guiada</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight flex items-center gap-3">
          <Gauge className="size-9" /> Test de FTP 20 min
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Protocolo clásico Coggan: 20 min a máximo esfuerzo sostenible. FTP ≈ 95% de la potencia media de esos 20 min.
        </p>
        {profileQ.data?.ftp_test_completed_at && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <CheckCheck className="size-4" /> Último test realizado el {format(new Date(profileQ.data.ftp_test_completed_at), "d MMM yyyy", { locale: es })}
          </p>
        )}
      </div>

      {/* Descarga del test para ciclocomputador */}
      <div className="bg-surface border rounded-xl p-5 space-y-3">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight flex items-center gap-2">
          <FileDown className="size-5" /> Descargar el test
        </h2>
        <p className="text-sm text-muted-foreground">
          Descarga el bloque completo (calentamiento + 20 min all-out + vuelta a la calma) para hacerlo en Zwift, TrainingPeaks o tu ciclocomputador (Garmin / Wahoo).
          {!profileQ.data?.ftp && " Sin FTP en tu perfil se usa una referencia de 200 W para calcular los porcentajes; ajústalos si es necesario."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDownloadZwo} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
            <Download className="size-4" /> Descargar .zwo (Zwift)
          </button>
          <button onClick={handleDownloadFit} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
            <Download className="size-4" /> Descargar .fit (Garmin/Wahoo)
          </button>
        </div>
      </div>

      {/* Marcar como realizado + importar desde Strava */}
      <div className="bg-surface border rounded-xl p-5 space-y-3">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight flex items-center gap-2">
          <CheckCheck className="size-5" /> Marcar test como realizado
        </h2>

        {stravaConnected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Selecciona la actividad de Strava donde hiciste el test. Calcularemos el mejor esfuerzo de 20 min y actualizaremos tu FTP y zonas.
            </p>
            {recentActs.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando actividades…</p>
            ) : (recentActs.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay actividades recientes con potencia. Sincroniza Strava desde el <Link to="/perfil" className="underline">perfil</Link> tras subir el test.
              </p>
            ) : (
              <ul className="divide-y border rounded-lg overflow-hidden">
                {(recentActs.data ?? []).map((a: any) => (
                  <li key={a.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {format(new Date(a.start_date), "d MMM yyyy · HH:mm", { locale: es })} · {Math.round((a.moving_time ?? 0) / 60)} min · media {Math.round(a.average_watts)} W
                      </p>
                    </div>
                    <button
                      onClick={() => handleImportStrava(String(a.id))}
                      disabled={importingId === String(a.id)}
                      className="shrink-0 inline-flex items-center gap-1 bg-[#fc4c02] text-white px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
                    >
                      <Bike className="size-3.5" />
                      {importingId === String(a.id) ? "Calculando…" : "Usar este test"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-2 flex flex-wrap gap-2">
              <button onClick={handleMarkOnly} className="text-xs font-semibold px-3 py-1.5 rounded-md border hover:bg-muted">
                Marcar como realizado sin actualizar FTP
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecta Strava en tu <Link to="/perfil" className="underline text-primary">perfil</Link> para importar el test directamente y calcular las zonas automáticamente.
              Mientras tanto, introduce la potencia media de los 20 min más abajo cuando termines la prueba.
            </p>
            <button onClick={handleMarkOnly} className="text-xs font-semibold px-3 py-1.5 rounded-md border hover:bg-muted">
              Marcar como realizado
            </button>
          </>
        )}
      </div>

      {!finished ? (
        <>
          <div className="bg-surface border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fase actual</p>
                <h2 className="font-display text-2xl font-bold">{phase.label}</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tiempo restante</p>
                <p className="font-mono text-4xl font-bold tabular-nums">{fmt(remaining)}</p>
              </div>
            </div>

            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>

            <p className="text-sm">{phase.instruction}</p>
            {phase.targetPctFtp && (
              <p className="text-xs text-muted-foreground">Objetivo: {phase.targetPctFtp[0]}–{phase.targetPctFtp[1]}% del FTP estimado.</p>
            )}

            <div className="flex gap-2 pt-2">
              {!running ? (
                <button onClick={() => setRunning(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
                  <Play className="size-4" /> {elapsed === 0 && phaseIdx === 0 ? "Empezar test" : "Continuar"}
                </button>
              ) : (
                <button onClick={() => setRunning(false)} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold">
                  <Pause className="size-4" /> Pausa
                </button>
              )}
              <button onClick={skipPhase} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold">
                Saltar fase <ChevronRight className="size-4" />
              </button>
              <button onClick={reset} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground">
                <RotateCcw className="size-4" /> Reiniciar
              </button>
            </div>
          </div>

          <ol className="space-y-2">
            {PHASES.map((p, idx) => (
              <li key={p.key} className={`flex items-center gap-3 text-sm rounded-lg border p-3 ${idx === phaseIdx ? "border-primary bg-primary/5" : "bg-surface"} ${idx < phaseIdx ? "opacity-60" : ""}`}>
                <span className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-bold ${idx < phaseIdx ? "bg-emerald-500 text-white" : idx === phaseIdx ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {idx < phaseIdx ? <CheckCircle2 className="size-4" /> : idx + 1}
                </span>
                <span className="flex-1">{p.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{fmt(p.seconds)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-surface border rounded-xl p-6 space-y-4">
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight">Resultado</h2>
            <p className="text-sm text-muted-foreground">Introduce la potencia media de los 20 min all-out (dato de tu ciclocomputador / plato). Si no tienes potenciómetro, apunta la FC media como referencia.</p>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Potencia media 20 min (W)</span>
                <input type="number" value={avgWatts} onChange={(e) => setAvgWatts(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-xl font-bold" placeholder="230" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">FC media 20 min (bpm, opcional)</span>
                <input type="number" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-xl font-bold" placeholder="168" />
              </label>
            </div>

            {estimatedFtp && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">FTP estimado (95%)</p>
                <p className="font-display text-4xl font-bold">{estimatedFtp} W</p>
              </div>
            )}
            {estimatedLthr && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">LTHR estimado (95% FC media)</p>
                <p className="font-display text-4xl font-bold">{estimatedLthr} bpm</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={save} disabled={!estimatedFtp} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                Guardar FTP y calcular zonas
              </button>
              <button onClick={reset} className="border px-5 py-2.5 rounded-lg text-sm font-semibold">Repetir test</button>
            </div>
          </div>

          {zones && (
            <div className="bg-surface border rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold uppercase tracking-tight">
                  {zonesMode === "hr" ? "Zonas de FC (Friel)" : "Zonas de potencia (Coggan)"}
                </h3>
                <div className="inline-flex rounded-md border bg-surface p-0.5 text-xs font-semibold">
                  <button type="button" onClick={() => setZonesMode("watts")} disabled={!powerZones} className={`px-3 py-1 rounded-sm disabled:opacity-40 ${zonesMode === "watts" ? "bg-primary text-primary-foreground" : ""}`}>Vatios</button>
                  <button type="button" onClick={() => setZonesMode("hr")} disabled={!hrZones} className={`px-3 py-1 rounded-sm disabled:opacity-40 ${zonesMode === "hr" ? "bg-primary text-primary-foreground" : ""}`}>Pulsaciones</button>
                </div>
              </div>
              <div className="space-y-2">
                {zones.map((z) => (
                  <div key={z.key} className="flex items-center gap-3 text-sm">
                    <span className="inline-block size-3 rounded-full" style={{ background: z.color }} />
                    <span className="font-semibold w-40">{z.label}</span>
                    <span className="font-mono text-xs text-muted-foreground w-24">{z.pctLow}–{z.pctHigh === 999 ? "∞" : z.pctHigh}% {zonesMode === "hr" ? "LTHR" : "FTP"}</span>
                    <span className="font-mono font-bold">
                      {z.low}{z.high === Infinity ? "+" : `–${z.high}`} {unit}
                    </span>
                    <span className="text-xs text-muted-foreground flex-1 hidden md:block">{z.focus}</span>
                  </div>
                ))}
              </div>
              {saved && (
                <p className="text-xs text-emerald-600 font-semibold pt-2">
                  ✓ Guardado en tu perfil. La IA usará estas zonas al generar entrenamientos.{" "}
                  <Link to="/entrenamientos" className="underline">Generar entrenamientos →</Link>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
