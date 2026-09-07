import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import { Field, INPUT_STYLE } from "./AdminField";

export function SponsorsTab() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["sponsors_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsors")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ name: "", logo_url: "", website_url: "", sort_order: 0, active: true });

  const startNew = () => {
    setEditing(null);
    setF({ name: "", logo_url: "", website_url: "", sort_order: (list.data?.length ?? 0) * 10, active: true });
    setOpen(true);
  };

  const startEdit = (s: any) => {
    setEditing(s);
    setF({
      name: s.name ?? "",
      logo_url: s.logo_url ?? "",
      website_url: s.website_url ?? "",
      sort_order: s.sort_order ?? 0,
      active: s.active ?? true,
    });
    setOpen(true);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sponsors_admin"] });
    qc.invalidateQueries({ queryKey: ["sponsors_public"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: f.name.trim(),
        logo_url: f.logo_url.trim(),
        website_url: f.website_url.trim() || null,
        sort_order: Number(f.sort_order) || 0,
        active: f.active,
      };
      if (editing) {
        const { error } = await supabase.from("sponsors").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Patrocinador actualizado");
      } else {
        const { error } = await supabase.from("sponsors").insert(payload);
        if (error) throw error;
        toast.success("Patrocinador añadido");
      }
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este patrocinador?")) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    refresh();
  };

  const toggleActive = async (s: any) => {
    const { error } = await supabase.from("sponsors").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const move = async (s: any, dir: -1 | 1) => {
    const items = [...(list.data ?? [])];
    const idx = items.findIndex((x) => x.id === s.id);
    const swap = items[idx + dir];
    if (!swap) return;
    const a = s.sort_order, b = swap.sort_order;
    await supabase.from("sponsors").update({ sort_order: b }).eq("id", s.id);
    await supabase.from("sponsors").update({ sort_order: a }).eq("id", swap.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Los logos aparecen en el footer de toda la app, en orden ascendente.</p>
        <button onClick={startNew} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> Nuevo
        </button>
      </div>
      <div className="bg-surface border rounded-xl divide-y">
        {(list.data ?? []).length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">Aún no hay patrocinadores.</div>
        )}
        {(list.data ?? []).map((s: any, i: number, arr: any[]) => (
          <div key={s.id} className="p-4 flex items-center gap-4">
            <div className="w-24 h-12 grid place-items-center bg-background rounded border shrink-0">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.name} className="max-h-10 max-w-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">sin logo</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-semibold truncate ${s.active ? "" : "opacity-50"}`}>{s.name}</p>
              <p className="text-xs text-muted-foreground truncate">{s.website_url || "Sin enlace"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => move(s, -1)} disabled={i === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir">
                <ArrowUp className="size-4" />
              </button>
              <button onClick={() => move(s, 1)} disabled={i === arr.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Bajar">
                <ArrowDown className="size-4" />
              </button>
              <button onClick={() => toggleActive(s)} className="p-1.5 text-muted-foreground hover:text-foreground" title={s.active ? "Ocultar" : "Mostrar"}>
                {s.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button onClick={() => startEdit(s)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-secondary">Editar</button>
              <button onClick={() => remove(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <form onSubmit={submit} className="bg-background border rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-display text-2xl font-bold uppercase">{editing ? "Editar" : "Nuevo"} patrocinador</h3>
            <Field label="Nombre"><input required className="input" value={f.name} onChange={(e) => setF({...f, name: e.target.value})} /></Field>
            <Field label="URL del logo (https://...)">
              <input required type="url" className="input" placeholder="https://ejemplo.com/logo.png" value={f.logo_url} onChange={(e) => setF({...f, logo_url: e.target.value})} />
            </Field>
            {f.logo_url && (
              <div className="bg-surface border rounded p-3 grid place-items-center">
                <img src={f.logo_url} alt="preview" className="max-h-16 object-contain" />
              </div>
            )}
            <Field label="Enlace web (opcional)">
              <input type="url" className="input" placeholder="https://patrocinador.com" value={f.website_url} onChange={(e) => setF({...f, website_url: e.target.value})} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Orden">
                <input type="number" className="input" value={f.sort_order} onChange={(e) => setF({...f, sort_order: Number(e.target.value)})} />
              </Field>
              <Field label="Visible">
                <select className="input" value={f.active ? "1" : "0"} onChange={(e) => setF({...f, active: e.target.value === "1"})}>
                  <option value="1">Sí</option><option value="0">No</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">Guardar</button>
            </div>
            <style>{INPUT_STYLE}</style>
          </form>
        </div>
      )}
    </div>
  );
}
