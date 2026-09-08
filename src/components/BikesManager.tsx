import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Bike, Plus, Trash2, Wrench, AlertTriangle, CheckCircle2, RotateCcw, Pencil } from "lucide-react";
import { useRideKm, bikeTotalKm, componentUsedKm } from "@/lib/maintenance-alerts";
import type { RideKm } from "@/lib/maintenance-calc";

type BikeRow = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  bike_type: string | null;
  current_km: number;
  km_base_date?: string | null;
  notes: string | null;
};

type ComponentRow = {
  id: string;
  bike_id: string;
  component_type: string;
  name: string | null;
  install_km: number;
  lifespan_km: number;
  installed_at: string;
  notes: string | null;
  active: boolean;
};

const COMPONENT_TYPES: Record<string, { label: string; defaultLifespan: number }> = {
  cadena: { label: "Cadena", defaultLifespan: 3000 },
  cassette: { label: "Cassette", defaultLifespan: 9000 },
  platos: { label: "Platos", defaultLifespan: 15000 },
  transmision: { label: "Transmisión completa", defaultLifespan: 8000 },
  pastillas_del: { label: "Pastillas freno delantero", defaultLifespan: 2500 },
  pastillas_tras: { label: "Pastillas freno trasero", defaultLifespan: 2500 },
  cubierta_del: { label: "Cubierta delantera", defaultLifespan: 5000 },
  cubierta_tras: { label: "Cubierta trasera", defaultLifespan: 4000 },
  rodamientos: { label: "Rodamientos", defaultLifespan: 20000 },
  cables: { label: "Cables/fundas", defaultLifespan: 5000 },
  otros: { label: "Otros", defaultLifespan: 3000 },
};

const BIKE_TYPES = ["Carretera", "Gravel", "MTB", "Contrarreloj", "Pista", "Urbana", "Otra"];

export function BikesManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [addingBike, setAddingBike] = useState(false);
  const [editingBike, setEditingBike] = useState<string | null>(null);

  const bikesQ = useQuery({
    queryKey: ["bikes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bikes").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BikeRow[];
    },
    enabled: !!user,
  });

  const ridesQ = useRideKm();

  const componentsQ = useQuery({
    queryKey: ["bike_components", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bike_components").select("*").order("installed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComponentRow[];
    },
    enabled: !!user,
  });

  const saveBike = useMutation({
    mutationFn: async (b: Partial<BikeRow> & { id?: string }) => {
      if (b.id) {
        const { error } = await supabase.from("bikes").update({
          name: b.name, brand: b.brand, model: b.model, bike_type: b.bike_type,
          current_km: b.current_km, notes: b.notes, km_base_date: new Date().toISOString(),
        }).eq("id", b.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bikes").insert({
          user_id: user!.id,
          name: b.name!, brand: b.brand ?? null, model: b.model ?? null,
          bike_type: b.bike_type ?? null, current_km: b.current_km ?? 0, notes: b.notes ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Bici guardada");
      qc.invalidateQueries({ queryKey: ["bikes"] });
      qc.invalidateQueries({ queryKey: ["maintenance_alerts"] });
      setAddingBike(false); setEditingBike(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBike = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bikes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bici eliminada"); qc.invalidateQueries({ queryKey: ["bikes"] }); qc.invalidateQueries({ queryKey: ["bike_components"] }); },
  });

  if (!user) return null;
  const bikes = bikesQ.data ?? [];
  const components = componentsQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Registra tus bicicletas y los componentes con desgaste. Actualiza el kilometraje y recibirás alertas cuando toque cambiar piezas.</p>
        {!addingBike && (
          <button onClick={() => setAddingBike(true)} className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-semibold hover:opacity-90">
            <Plus className="size-3.5" /> Nueva bici
          </button>
        )}
      </div>

      {addingBike && (
        <BikeForm onCancel={() => setAddingBike(false)} onSave={(b) => saveBike.mutate(b)} />
      )}

      {bikesQ.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!bikesQ.isLoading && bikes.length === 0 && !addingBike && (
        <div className="text-center py-10 border-2 border-dashed rounded-xl">
          <Bike className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Aún no tienes bicis registradas</p>
        </div>
      )}

      <div className="space-y-4">
        {bikes.map((bike) => (
          <BikeCard
            key={bike.id}
            bike={bike}
            components={components.filter((c) => c.bike_id === bike.id)}
            rides={ridesQ.data ?? []}
            isEditing={editingBike === bike.id}
            onEdit={() => setEditingBike(bike.id)}
            onCancelEdit={() => setEditingBike(null)}
            onSave={(b) => saveBike.mutate({ ...b, id: bike.id })}
            onDelete={() => { if (confirm(`¿Eliminar "${bike.name}" y todos sus componentes?`)) deleteBike.mutate(bike.id); }}
          />
        ))}
      </div>
    </div>
  );
}

function BikeForm({ initial, onCancel, onSave }: { initial?: Partial<BikeRow>; onCancel: () => void; onSave: (b: Partial<BikeRow>) => void }) {
  const [form, setForm] = useState<Partial<BikeRow>>(initial ?? { current_km: 0 });
  return (
    <div className="bg-surface border rounded-xl p-4 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Nombre *"><input className="inp" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Canyon roja" /></Field>
        <Field label="Tipo">
          <select className="inp" value={form.bike_type ?? ""} onChange={(e) => setForm({ ...form, bike_type: e.target.value })}>
            <option value="">—</option>
            {BIKE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Marca"><input className="inp" value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
        <Field label="Modelo"><input className="inp" value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
        <Field label="Kilómetros acumulados">
          <input type="number" step="1" min={0} className="inp" value={form.current_km ?? 0} onChange={(e) => setForm({ ...form, current_km: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Notas"><textarea className="inp min-h-[60px]" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold rounded-md hover:bg-secondary">Cancelar</button>
        <button
          disabled={!form.name}
          onClick={() => onSave(form)}
          className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
      <style>{`.inp{width:100%;padding:.5rem .7rem;border-radius:.5rem;border:1px solid var(--border);background:var(--background);font-size:.875rem;outline:none}.inp:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function BikeCard({ bike, components, rides, isEditing, onEdit, onCancelEdit, onSave, onDelete }: {
  bike: BikeRow;
  components: ComponentRow[];
  rides: RideKm[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (b: Partial<BikeRow>) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [addingComp, setAddingComp] = useState(false);

  const saveComp = useMutation({
    mutationFn: async (c: Partial<ComponentRow>) => {
      const { error } = await supabase.from("bike_components").insert({
        bike_id: bike.id, user_id: user!.id,
        component_type: c.component_type!, name: c.name ?? null,
        install_km: c.install_km ?? totalKm, lifespan_km: c.lifespan_km ?? 3000,
        installed_at: c.installed_at ?? new Date().toISOString().slice(0, 10),
        notes: c.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Componente añadido"); qc.invalidateQueries({ queryKey: ["bike_components"] }); setAddingComp(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceComp = useMutation({
    mutationFn: async (comp: ComponentRow) => {
      const { error: e1 } = await supabase.from("bike_components").update({ active: false }).eq("id", comp.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("bike_components").insert({
        bike_id: bike.id, user_id: user!.id,
        component_type: comp.component_type, name: comp.name,
        install_km: totalKm, lifespan_km: comp.lifespan_km,
        installed_at: new Date().toISOString().slice(0, 10),
      });
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Componente sustituido"); qc.invalidateQueries({ queryKey: ["bike_components"] }); },
  });

  const delComp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bike_components").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bike_components"] }); },
  });

  const totalKm = bikeTotalKm(bike, rides);
  const active = components.filter((c) => c.active);
  const history = components.filter((c) => !c.active);
  const alerts = active.filter((c) => componentUsedKm(bike, c, rides) >= c.lifespan_km * 0.85);

  if (isEditing) {
    return <BikeForm initial={bike} onCancel={onCancelEdit} onSave={onSave} />;
  }

  return (
    <div className="bg-surface border rounded-xl overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Bike className="size-4 text-primary shrink-0" />
            <h4 className="font-display font-bold text-base uppercase tracking-tight truncate">{bike.name}</h4>
            {bike.bike_type && <span className="text-[10px] uppercase font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{bike.bike_type}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[bike.brand, bike.model].filter(Boolean).join(" · ") || "—"} · <strong className="text-foreground">{Math.round(totalKm).toLocaleString()} km</strong>
          </p>
          {alerts.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 w-fit">
              <AlertTriangle className="size-3.5" /> {alerts.length} componente{alerts.length > 1 ? "s" : ""} requiere{alerts.length > 1 ? "n" : ""} atención
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} title="Editar" className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"><Pencil className="size-3.5" /></button>
          <button onClick={onDelete} title="Eliminar" className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="size-3.5" /></button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5"><Wrench className="size-3" /> Componentes activos</p>
          {!addingComp && (
            <button onClick={() => setAddingComp(true)} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <Plus className="size-3" /> Añadir
            </button>
          )}
        </div>

        {addingComp && (
          <ComponentForm bikeKm={Math.round(totalKm)} onCancel={() => setAddingComp(false)} onSave={(c) => saveComp.mutate(c)} />
        )}

        {active.length === 0 && !addingComp && (
          <p className="text-xs text-muted-foreground italic">Sin componentes registrados aún.</p>
        )}

        <div className="space-y-2">
          {active.map((c) => {
            const used = componentUsedKm(bike, c, rides);
            const remaining = c.lifespan_km - used;
            const pct = Math.min(100, (used / c.lifespan_km) * 100);
            const status = remaining <= 0 ? "danger" : remaining <= c.lifespan_km * 0.15 ? "warn" : "ok";
            const color = status === "danger" ? "bg-destructive" : status === "warn" ? "bg-amber-500" : "bg-emerald-500";
            const label = COMPONENT_TYPES[c.component_type]?.label ?? c.component_type;
            return (
              <div key={c.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{label}{c.name ? ` · ${c.name}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Instalado a {Math.round(c.install_km).toLocaleString()} km · {new Date(c.installed_at).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button title="Marcar como sustituido" onClick={() => replaceComp.mutate(c)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"><RotateCcw className="size-3.5" /></button>
                    <button title="Eliminar" onClick={() => delComp.mutate(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{Math.round(used).toLocaleString()} / {Math.round(c.lifespan_km).toLocaleString()} km</span>
                    {status === "danger" ? (
                      <span className="flex items-center gap-1 text-destructive font-semibold"><AlertTriangle className="size-3" /> Sustituir ya ({Math.round(-remaining).toLocaleString()} km pasados)</span>
                    ) : status === "warn" ? (
                      <span className="flex items-center gap-1 text-amber-600 font-semibold"><AlertTriangle className="size-3" /> Cambiar en {Math.round(remaining).toLocaleString()} km</span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3" /> Quedan {Math.round(remaining).toLocaleString()} km</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {history.length > 0 && (
          <details className="pt-2 border-t">
            <summary className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer hover:text-foreground">Historial ({history.length})</summary>
            <div className="mt-2 space-y-1">
              {history.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-secondary/50">
                  <span className="text-muted-foreground">
                    {COMPONENT_TYPES[c.component_type]?.label ?? c.component_type} · {new Date(c.installed_at).toLocaleDateString("es-ES")} · duró {Math.round(c.lifespan_km).toLocaleString()} km
                  </span>
                  <button onClick={() => delComp.mutate(c.id)} className="text-destructive hover:opacity-70"><Trash2 className="size-3" /></button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function ComponentForm({ bikeKm, onCancel, onSave }: { bikeKm: number; onCancel: () => void; onSave: (c: Partial<ComponentRow>) => void }) {
  const [type, setType] = useState<string>("cadena");
  const [name, setName] = useState("");
  const [installKm, setInstallKm] = useState(bikeKm);
  const [lifespan, setLifespan] = useState(COMPONENT_TYPES.cadena.defaultLifespan);
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));

  const changeType = (t: string) => {
    setType(t);
    setLifespan(COMPONENT_TYPES[t]?.defaultLifespan ?? 3000);
  };

  return (
    <div className="border-2 border-dashed rounded-lg p-3 space-y-3 bg-background">
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Tipo">
          <select className="inp2" value={type} onChange={(e) => changeType(e.target.value)}>
            {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Nombre / detalle (opcional)"><input className="inp2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Shimano Ultegra" /></Field>
        <Field label="Km bici al instalar"><input type="number" min={0} className="inp2" value={installKm} onChange={(e) => setInstallKm(Number(e.target.value))} /></Field>
        <Field label="Vida útil estimada (km)"><input type="number" min={100} className="inp2" value={lifespan} onChange={(e) => setLifespan(Number(e.target.value))} /></Field>
        <Field label="Fecha instalación"><input type="date" className="inp2" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold rounded-md hover:bg-secondary">Cancelar</button>
        <button
          onClick={() => onSave({ component_type: type, name: name || null, install_km: installKm, lifespan_km: lifespan, installed_at: installedAt })}
          className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-xs font-semibold"
        >
          Añadir componente
        </button>
      </div>
      <style>{`.inp2{width:100%;padding:.45rem .65rem;border-radius:.4rem;border:1px solid var(--border);background:var(--surface);font-size:.8125rem;outline:none}.inp2:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
