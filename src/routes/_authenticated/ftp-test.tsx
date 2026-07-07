import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Pause, RotateCcw, Gauge, CheckCircle2, ChevronRight } from "lucide-react";
import { computePowerZones, ftpFrom20Min } from "@/lib/zones";

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

function FtpTestPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [avgWatts, setAvgWatts] = useState<string>("");
  const [avgHr, setAvgHr] = useState<string>("");
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
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

  const zones = useMemo(() => computePowerZones(estimatedFtp), [estimatedFtp]);

  const save = async () => {
    if (!estimatedFtp || !user) { toast.error("Introduce la potencia media de los 20 min"); return; }
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, email: user.email ?? "", ftp: estimatedFtp }, { onConflict: "id" });
    if (error) return toast.error(error.message);
    setSaved(estimatedFtp);
    toast.success(`FTP guardado: ${estimatedFtp} W. Zonas calculadas.`);
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

            <div className="flex gap-2">
              <button onClick={save} disabled={!estimatedFtp} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                Guardar FTP y calcular zonas
              </button>
              <button onClick={reset} className="border px-5 py-2.5 rounded-lg text-sm font-semibold">Repetir test</button>
            </div>
          </div>

          {zones && (
            <div className="bg-surface border rounded-xl p-6 space-y-3">
              <h3 className="font-display text-lg font-bold uppercase tracking-tight">Zonas Coggan calculadas</h3>
              <div className="space-y-2">
                {zones.map((z) => (
                  <div key={z.key} className="flex items-center gap-3 text-sm">
                    <span className="inline-block size-3 rounded-full" style={{ background: z.color }} />
                    <span className="font-semibold w-40">{z.label}</span>
                    <span className="font-mono text-xs text-muted-foreground w-24">{z.pctLow}–{z.pctHigh === 999 ? "∞" : z.pctHigh}% FTP</span>
                    <span className="font-mono font-bold">
                      {z.low}{z.high === Infinity ? "+" : `–${z.high}`} W
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
