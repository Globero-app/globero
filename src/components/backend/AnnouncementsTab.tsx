import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { Field, INPUT_STYLE } from "./AdminField";

const db = supabase as any;

export function AnnouncementsTab() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["announcements_admin"],
    queryFn: async () => {
      const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ title: "", body: "", active: true });
  const refresh = () => qc.invalidateQueries({ queryKey: ["announcements_admin"] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { title: f.title.trim(), body: f.body.trim(), active: f.active };
    const { error } = editing
      ? await db.from("announcements").update(payload).eq("id", editing.id)
      : await db.from("announcements").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(tr("Guardado"));
    setOpen(false);
    refresh();
  };
  const remove = async (id: string) => {
    if (!confirm(tr("¿Eliminar este aviso?"))) return;
    const { error } = await db.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const toggle = async (a: any) => {
    const { error } = await db.from("announcements").update({ active: !a.active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tr("Los avisos visibles aparecen como ventana emergente al entrar en la app.")}</p>
        <button onClick={() => { setEditing(null); setF({ title: "", body: "", active: true }); setOpen(true); }} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> {tr("Nuevo")}
        </button>
      </div>
      <div className="bg-surface border rounded-xl divide-y">
        {(list.data ?? []).length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">{tr("Aún no hay avisos.")}</div>}
        {(list.data ?? []).map((a: any) => (
          <div key={a.id} className="p-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className={`font-semibold truncate ${a.active ? "" : "opacity-50"}`}>{a.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(a)} className="p-1.5 text-muted-foreground hover:text-foreground">
                {a.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button onClick={() => { setEditing(a); setF({ title: a.title, body: a.body, active: a.active }); setOpen(true); }} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-secondary">{tr("Editar")}</button>
              <button onClick={() => remove(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <form onSubmit={submit} className="bg-background border rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-display text-2xl font-bold uppercase">{tr("Aviso")}</h3>
            <Field label={tr("Título")}><input required className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label={tr("Descripción")}><textarea required rows={5} className="input" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <Field label={tr("Visible")}>
              <select className="input" value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}>
                <option value="1">{tr("Sí")}</option><option value="0">{tr("No")}</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-sm">{tr("Cancelar")}</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">{tr("Guardar")}</button>
            </div>
            <style>{INPUT_STYLE}</style>
          </form>
        </div>
      )}
    </div>
  );
}
