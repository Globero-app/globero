import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight, Pencil, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/competiciones/")({
  component: CompetitionsPage,
});

function CompetitionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const comps = useQuery({
    queryKey: ["competitions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("competitions").select("*").eq("user_id", user!.id).order("date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar competición?")) return;
    const { error } = await supabase.from("competitions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Eliminada"); qc.invalidateQueries({ queryKey: ["competitions"] }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Calendario</p>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Competiciones</h1>
        </div>
        <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> Nueva
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(comps.data ?? []).map((c) => (
          <div key={c.id} className="bg-surface border rounded-xl p-5 group hover:border-primary/50 transition-colors">
            <div className="flex justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{format(new Date(c.date), "d MMM yyyy", { locale: es })}</p>
                <h3 className="font-display text-xl font-bold uppercase truncate mt-0.5">{c.name}</h3>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(c); setOpen(true); }} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                <button onClick={() => remove(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs border-t pt-3">
              <div><p className="text-muted-foreground">Distancia</p><p className="font-semibold">{c.distance_km}km</p></div>
              <div><p className="text-muted-foreground">Desnivel</p><p className="font-semibold">+{c.elevation_m}m</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-semibold capitalize">{c.type}</p></div>
            </div>
            <Link to="/competiciones/$id" params={{ id: c.id }} className="mt-4 flex items-center justify-between text-xs font-semibold text-primary">
              Ver plan completo <ChevronRight className="size-4" />
            </Link>
          </div>
        ))}
        {comps.data?.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 border-2 border-dashed rounded-xl p-12 text-center">
            <p className="text-sm text-muted-foreground">Sin competiciones todavía.</p>
          </div>
        )}
      </div>

      {open && <CompetitionForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["competitions"] }); }} />}
    </div>
  );
}

function CompetitionForm({ initial, onClose, onSaved }: any) {
  const { user } = useAuth();
  const [f, setF] = useState<any>(initial ?? {
    name: "", date: format(new Date(), "yyyy-MM-dd"), type: "carretera",
    distance_km: 100, elevation_m: 1500, duration_hours: "", intensity: "media", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      user_id: user!.id,
      name: f.name,
      date: f.date,
      type: f.type,
      distance_km: Number(f.distance_km),
      elevation_m: Number(f.elevation_m),
      duration_hours: f.duration_hours ? Number(f.duration_hours) : null,
      intensity: f.intensity,
      notes: f.notes,
    };
    const { error } = initial
      ? await supabase.from("competitions").update(payload).eq("id", initial.id)
      : await supabase.from("competitions").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(initial ? "Actualizada" : "Creada"); onSaved(); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <form onSubmit={submit} className="bg-background rounded-xl border w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase">{initial ? "Editar" : "Nueva"} competición</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <Field label="Nombre"><input required className="input" value={f.name} onChange={(e) => setF({...f, name: e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><input required type="date" className="input" value={f.date} onChange={(e) => setF({...f, date: e.target.value})} /></Field>
          <Field label="Tipo">
            <select className="input" value={f.type} onChange={(e) => setF({...f, type: e.target.value})}>
              <option value="carretera">Carretera</option>
              <option value="gravel">Gravel</option>
              <option value="mtb">MTB</option>
              <option value="ciclocross">Ciclocross</option>
              <option value="contrarreloj">Contrarreloj</option>
              <option value="salida larga">Salida larga</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distancia (km)"><input required type="number" step="0.1" className="input" value={f.distance_km} onChange={(e) => setF({...f, distance_km: e.target.value})} /></Field>
          <Field label="Desnivel acumulado (m)"><input required type="number" className="input" value={f.elevation_m} onChange={(e) => setF({...f, elevation_m: e.target.value})} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración estimada (h)"><input type="number" step="0.1" className="input" value={f.duration_hours ?? ""} onChange={(e) => setF({...f, duration_hours: e.target.value})} /></Field>
          <Field label="Intensidad">
            <select className="input" value={f.intensity} onChange={(e) => setF({...f, intensity: e.target.value})}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="competicion">Competición</option>
            </select>
          </Field>
        </div>
        <Field label="Notas"><textarea className="input min-h-[60px]" value={f.notes ?? ""} onChange={(e) => setF({...f, notes: e.target.value})} /></Field>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 text-sm rounded-lg font-semibold disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
      </form>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
