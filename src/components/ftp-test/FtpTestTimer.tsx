import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, CheckCircle2, ChevronRight } from "lucide-react";
import { PHASES, fmt } from "./test-protocol";

export function FtpTestTimer({ onFinish, resetKey }: { onFinish: () => void; resetKey: number }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => { setPhaseIdx(0); setElapsed(0); setRunning(false); }, [resetKey]);

  const phase = PHASES[phaseIdx]!;
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
        onFinish();
      }
    }
  }, [elapsed, totalSecs, phaseIdx]);

  const skipPhase = () => {
    if (phaseIdx < PHASES.length - 1) { setPhaseIdx(phaseIdx + 1); setElapsed(0); }
    else { setRunning(false); onFinish(); }
  };

  return (
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
          <button onClick={() => { setRunning(false); setPhaseIdx(0); setElapsed(0); }} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground">
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
  );
}
