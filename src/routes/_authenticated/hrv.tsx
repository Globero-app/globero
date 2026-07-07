import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveHrv, getRecentHrv } from "@/lib/hrv.functions";
import { HeartPulse } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hrv")({
  component: HrvPage,
});

function madridToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function HrvPage() {
  const qc = useQueryClient();
  const save = useServerFn(saveHrv);
  const list = useServerFn(getRecentHrv);
  const today = madridToday();

  const recentQ = useQuery({ queryKey: ["hrv-recent"], queryFn: () => list({ data: undefined }) });
  const [value, setValue] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = (recentQ.data ?? []).find((e: any) => e.entry_date === today);
    if (t) { setValue(String(t.value)); setNote(t.note ?? ""); }
  }, [recentQ.data, today]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!n || n < 1 || n > 300) { toast.error("Introduce un HRV válido (1-300 ms)"); return; }
    try {
      await save({ data: { value: n, note: note || null } });
      toast.success("HRV registrado. La IA lo usará para modular tu sesión de hoy.");
      qc.invalidateQueries({ queryKey: ["hrv-recent"] });
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Readiness matinal</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Tu HRV de hoy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Registra tu Variabilidad de Frecuencia Cardíaca (rMSSD en ms) al despertar. La IA usará este valor para ajustar la intensidad del entrenamiento del día.
        </p>
      </div>

      <form onSubmit={submit} className="bg-surface border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <HeartPulse className="size-8 text-primary" />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Fecha</p>
            <p className="font-semibold">{today} (Europa/Madrid)</p>
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">HRV (rMSSD en ms)</span>
          <input
            type="number" min={1} max={300} required
            value={value} onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-2xl font-bold text-center"
            placeholder="65"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Notas (opcional)</span>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-sm min-h-[80px]"
            placeholder="Sueño, cansancio, estrés…"
          />
        </label>

        <button type="submit" className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm">
          Guardar HRV de hoy
        </button>
      </form>

      <div className="bg-surface border rounded-xl p-5">
        <h3 className="font-display text-lg font-bold uppercase tracking-tight mb-3">Últimos registros</h3>
        {(recentQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has registrado ningún HRV.</p>
        ) : (
          <ul className="divide-y">
            {(recentQ.data ?? []).map((e: any) => (
              <li key={e.entry_date} className="py-2 flex justify-between text-sm">
                <span className="font-mono text-xs text-muted-foreground">{e.entry_date}</span>
                <span className="font-bold">{e.value} ms</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
