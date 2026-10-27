import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { tr, localeCode } from "@/lib/i18n";
import { Section, Field } from "@/components/perfil/Section";
import { glucoseStats } from "@/lib/glucose";

const CONTEXTS = ["fasting", "pre_ride", "during_ride", "post_ride", "meal", "bedtime", "other"] as const;
const CTX_LABEL: Record<string, string> = {
  fasting: "En ayunas", pre_ride: "Antes de salir", during_ride: "Durante la salida", post_ride: "Después de la salida",
  meal: "Tras comida", bedtime: "Antes de dormir", other: "Otro",
};

function nowLocal() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Registro de glucosa y tendencias (14 días) para usuarios con diabetes. */
export function GlucoseLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [ctx, setCtx] = useState<string>("other");
  const [at, setAt] = useState(nowLocal());
  const [busy, setBusy] = useState(false);
  const key = ["glucose", user?.id];

  const q = useQuery({
    queryKey: key, enabled: !!user?.id,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data, error } = await supabase.from("glucose_entries").select("id,measured_at,value_mgdl,context")
        .eq("user_id", user!.id).gte("measured_at", since).order("measured_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  const stats = useMemo(() => glucoseStats(rows.map((r) => r.value_mgdl)), [rows]);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString(localeCode(), o);
  const chart = rows.map((r) => ({ t: fmt(r.measured_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), v: r.value_mgdl }));

  const add = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 20 || n > 600) { toast.error(tr("Introduce un valor entre 20 y 600 mg/dL")); return; }
    setBusy(true);
    const { error } = await supabase.from("glucose_entries").insert({ user_id: user!.id, value_mgdl: Math.round(n), context: ctx, measured_at: new Date(at).toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(tr("Medición guardada")); setValue(""); setAt(nowLocal());
    qc.invalidateQueries({ queryKey: key });
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("glucose_entries").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  };

  return (
    <Section title={tr("Registro de glucosa")} className="lg:col-span-2">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <Field label={tr("Glucosa (mg/dL)")}>
          <input type="number" min={20} max={600} className="input" value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} />
        </Field>
        <Field label={tr("Momento")}>
          <select className="input" value={ctx} onChange={(e) => setCtx(e.target.value)}>
            {CONTEXTS.map((c) => <option key={c} value={c}>{tr(CTX_LABEL[c])}</option>)}
          </select>
        </Field>
        <Field label={tr("Fecha y hora")}>
          <input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <button type="button" disabled={busy} onClick={add} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">{tr("Añadir medición")}</button>
      </div>

      <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{tr("Tendencia últimos 14 días")}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aún no hay mediciones registradas.")}</p> : <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat l={tr("Media")} v={`${stats.avg} mg/dL`} />
          <Stat l={tr("En rango (70–180)")} v={`${stats.inRange}%`} />
          <Stat l={tr("Bajas (<70)")} v={`${stats.low}%`} />
          <Stat l={tr("Altas (>180)")} v={`${stats.high}%`} />
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <ReferenceArea y1={70} y2={180} fill="var(--primary)" fillOpacity={0.08} />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis domain={[40, "dataMax + 20"]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="v" name="mg/dL" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="divide-y text-sm max-h-60 overflow-auto">
          {[...rows].reverse().map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-muted-foreground text-xs">{fmt(r.measured_at, { dateStyle: "short", timeStyle: "short" })} · {tr(CTX_LABEL[r.context] ?? "Otro")}</span>
            <span className="flex items-center gap-2"><b>{r.value_mgdl}</b>
              <button type="button" aria-label={tr("Eliminar")} onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button></span>
          </li>)}
        </ul>
      </>}
    </Section>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return <div className="rounded-lg bg-secondary/40 p-3"><p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{l}</p><p className="font-display text-sm font-bold mt-1">{v}</p></div>;
}
