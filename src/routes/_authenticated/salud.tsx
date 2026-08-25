import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartPulse, Loader2, Save } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/salud")({
  component: SaludPage,
  head: () => ({
    meta: [
      { title: "Salud diaria · Peso, sueño y fatiga | Sentmenat Bici" },
      { name: "description", content: "Registra tu peso, horas y calidad de sueño, fatiga y pulso en reposo para que el coach IA ajuste tus entrenamientos." },
      { property: "og:title", content: "Salud diaria · Sentmenat Bici" },
      { property: "og:description", content: "Seguimiento de peso, sueño, fatiga y pulso en reposo integrado con tu plan de entrenamiento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function madridToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const SCALE = [1, 2, 3, 4, 5];

function SelectScale({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex gap-1.5">
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`size-9 rounded-lg border text-sm font-semibold transition-colors ${
              value === n ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SaludPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = madridToday();

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const entries = useQuery({
    queryKey: ["health-entries", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_entries")
        .select("*")
        .eq("user_id", user!.id)
        .order("entry_date", { ascending: false })
        .limit(90);
      return data ?? [];
    },
    enabled: !!user,
  });

  const current = (entries.data ?? []).find((e: any) => e.entry_date === date) as any;

  useEffect(() => {
    setWeight(current?.weight_kg != null ? String(current.weight_kg) : "");
    setSleepHours(current?.sleep_hours != null ? String(current.sleep_hours) : "");
    setRestingHr(current?.resting_hr != null ? String(current.resting_hr) : "");
    setSleepQuality(current?.sleep_quality ?? null);
    setFatigue(current?.fatigue ?? null);
    setSoreness(current?.soreness ?? null);
    setNote(current?.note ?? "");
  }, [date, current?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
      const { error } = await supabase.from("health_entries").upsert(
        {
          user_id: user!.id,
          entry_date: date,
          weight_kg: num(weight),
          sleep_hours: num(sleepHours),
          resting_hr: num(restingHr) as any,
          sleep_quality: sleepQuality,
          fatigue,
          soreness,
          note: note.trim() || null,
        },
        { onConflict: "user_id,entry_date" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Registro guardado");
      qc.invalidateQueries({ queryKey: ["health-entries"] });
      qc.invalidateQueries({ queryKey: ["coach-today"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chart = [...(entries.data ?? [])]
    .reverse()
    .map((e: any) => ({
      date: e.entry_date.slice(5),
      peso: e.weight_kg != null ? Number(e.weight_kg) : null,
      sueño: e.sleep_hours != null ? Number(e.sleep_hours) : null,
      fatiga: e.fatigue ?? null,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl uppercase tracking-tight flex items-center gap-2">
          <HeartPulse className="size-5 text-primary" /> Salud diaria
        </h1>
        <p className="text-sm text-muted-foreground">Peso, sueño, fatiga y pulso en reposo. El coach IA usa estos datos para ajustar tus sesiones.</p>
      </div>

      <div className="bg-surface border rounded-xl p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Fecha</label>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border bg-background text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Peso (kg)</label>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="72.4" className="w-full h-9 px-3 rounded-lg border bg-background text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Sueño (h)</label>
            <input inputMode="decimal" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} placeholder="7.5" className="w-full h-9 px-3 rounded-lg border bg-background text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">FC reposo (bpm)</label>
            <input inputMode="numeric" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} placeholder="48" className="w-full h-9 px-3 rounded-lg border bg-background text-sm" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectScale label="Calidad del sueño" value={sleepQuality} onChange={setSleepQuality} hint="1 muy mala · 5 excelente" />
          <SelectScale label="Fatiga" value={fatigue} onChange={setFatigue} hint="1 fresco · 5 agotado" />
          <SelectScale label="Dolor muscular" value={soreness} onChange={setSoreness} hint="1 ninguno · 5 mucho" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Notas</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Resfriado, viaje, estrés…" />
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
        </button>
      </div>

      <div className="bg-surface border rounded-xl p-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">Tendencia (90 días)</p>
        {chart.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay registros.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} domain={[0, 12]} />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="peso" stroke="hsl(var(--primary))" dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="sueño" stroke="hsl(var(--muted-foreground))" dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="fatiga" stroke="hsl(var(--destructive))" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
