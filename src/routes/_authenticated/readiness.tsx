import { tr } from "@/lib/i18n";import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveReadiness, getRecentReadiness, discardTodayWorkout } from "@/lib/readiness.functions";
import { Gauge, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/readiness")({
  validateSearch: (s: Record<string, unknown>) => ({
    score: s['score'] ? Number(s['score']) : undefined
  }),
  component: ReadinessPage,
  head: () => ({
    meta: [
    { title: "Readiness diario | Globero" },
    { name: "description", content: "Indica cómo te encuentras hoy y la IA adaptará automáticamente tu entrenamiento del día." },
    { property: "og:title", content: "Readiness diario | Globero" },
    { property: "og:description", content: "Indica cómo te encuentras hoy y la IA adaptará tu entrenamiento." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }]

  })
});

const OPTIONS = [
{ score: 1, label: "Nada preparado", desc: "Hoy toca descansar", color: "bg-red-500" },
{ score: 2, label: "Preparado para un paseo relajado", desc: "Rodaje suave Z1-Z2", color: "bg-orange-500" },
{ score: 3, label: "Preparado para un entreno normal", desc: "Sesión estándar", color: "bg-yellow-500" },
{ score: 4, label: "Preparado para un entreno exigente", desc: "Puedes apretar", color: "bg-lime-500" },
{ score: 5, label: "Preparado para dar lo máximo", desc: "Sesión clave", color: "bg-emerald-500" }];


function madridToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function ReadinessPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { score: presetScore } = Route.useSearch();
  const save = useServerFn(saveReadiness);
  const list = useServerFn(getRecentReadiness);
  const discard = useServerFn(discardTodayWorkout);
  const today = madridToday();

  const recentQ = useQuery({ queryKey: ["readiness-recent"], queryFn: () => list({ data: undefined }) });
  const [selected, setSelected] = useState<number | null>(presetScore && presetScore >= 1 && presetScore <= 5 ? presetScore : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{action: string;message: string;workout_id: string | null;} | null>(null);

  const submit = async () => {
    if (!selected) {toast.error(tr("Selecciona cómo te encuentras hoy"));return;}
    setBusy(true);
    try {
      const r = (await save({ data: { score: selected, note: note || null } })) as any;
      setResult({ action: r.action, message: r.message, workout_id: r.workout_id });
      toast.success(r.action === "adapted" ? tr("Entreno de hoy adaptado por la IA") : tr("Readiness registrado"));
      qc.invalidateQueries({ queryKey: ["readiness-recent"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["today-workout"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (err: any) {toast.error(err.message);} finally
    {setBusy(false);}
  };

  const doDiscard = async () => {
    if (!result?.workout_id) return;
    setBusy(true);
    try {
      await discard({ data: { workout_id: result.workout_id } });
      toast.success(tr("Entrenamiento de hoy eliminado. Descansa."));
      setResult({ ...result, workout_id: null, action: "deleted" });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["today-workout"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e: any) {toast.error(e.message);} finally
    {setBusy(false);}
  };

  const todayEntry = (recentQ.data ?? []).find((e: any) => e.entry_date === today);

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Readiness diario")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("¿Cómo te encuentras hoy?")}</h1>
        <p className="mt-2 text-sm text-muted-foreground"> {tr("Tu respuesta ajusta automáticamente el entrenamiento asignado para hoy: la IA lo suaviza, lo mantiene o lo endurece según tu estado.")} 

        </p>
      </div>

      <div className="bg-surface border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Gauge className="size-8 text-primary" />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{tr("Fecha")}</p>
            <p className="font-semibold">{today} {tr("(Europa/Madrid)")}</p>
          </div>
        </div>

        <div className="space-y-2">
          {OPTIONS.map((o) =>
          <button
            key={o.score}
            type="button"
            onClick={() => setSelected(o.score)}
            className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg border transition ${selected === o.score ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted"}`}>
            
              <span className={`size-9 shrink-0 rounded-full ${o.color} text-white font-bold grid place-items-center`}>{o.score}</span>
              <span>
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.desc}</span>
              </span>
            </button>
          )}
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Notas (opcional)")}</span>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-sm min-h-[70px]"
            placeholder={tr("Sueño, cansancio, estrés, molestias…")} />
          
        </label>

        <button
          type="button" disabled={busy} onClick={submit}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60">
          
          {busy ? "Procesando con la IA…" : "Enviar y ajustar el entreno de hoy"}
        </button>
      </div>

      {result &&
      <div className="bg-surface border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-display text-lg font-bold uppercase tracking-tight">{tr("Respuesta de la IA")}</h3>
          </div>
          <p className="text-sm">{result.message}</p>
          {result.action === "suggest_delete" && result.workout_id &&
        <div className="flex gap-2 flex-wrap">
              <button onClick={doDiscard} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold">
                <Trash2 className="size-3.5" /> {tr("Eliminar entreno de hoy")} 
          </button>
              <button onClick={() => navigate({ to: "/entrenamientos" })}
          className="px-3 py-2 rounded-lg border text-xs font-semibold">{tr("Mantenerlo igualmente")}</button>
            </div>
        }
          {result.action === "adapted" &&
        <button onClick={() => navigate({ to: "/entrenamientos" })}
        className="px-3 py-2 rounded-lg border text-xs font-semibold">{tr("Ver entreno adaptado")}</button>
        }
        </div>
      }

      {!result && todayEntry &&
      <div className="bg-muted/40 border rounded-xl p-4 text-sm">
          <p className="font-semibold">{tr("Ya has respondido hoy:")} {todayEntry.score}/5</p>
          {todayEntry.ai_message && <p className="mt-1 text-muted-foreground">{todayEntry.ai_message}</p>}
        </div>
      }

      <div className="bg-surface border rounded-xl p-5">
        <h3 className="font-display text-lg font-bold uppercase tracking-tight mb-3">{tr("Últimos registros")}</h3>
        {(recentQ.data ?? []).length === 0 ?
        <p className="text-sm text-muted-foreground">{tr("Aún no has registrado ningún readiness.")}</p> :

        <ul className="divide-y">
            {(recentQ.data ?? []).map((e: any) =>
          <li key={e.entry_date} className="py-2 flex justify-between gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{e.entry_date}</span>
                <span className="font-bold">{e.score}/5</span>
              </li>
          )}
          </ul>
        }
      </div>
    </div>);

}
