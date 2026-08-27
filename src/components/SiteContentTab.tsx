import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSiteContentAdmin, upsertSiteBlock, deleteSiteBlock, type SiteBlock } from "@/lib/site-content.functions";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

type Draft = Partial<SiteBlock> & { section: string; block_key: string };

export function SiteContentTab() {
  const qc = useQueryClient();
  const list = useServerFn(listSiteContentAdmin);
  const save = useServerFn(upsertSiteBlock);
  const del = useServerFn(deleteSiteBlock);
  const [section, setSection] = useState<"landing" | "privacy">("landing");

  const q = useQuery({ queryKey: ["site_content_admin"], queryFn: () => list(), retry: false });
  const blocks = (q.data ?? []).filter((b) => b.section === section);

  const persist = async (d: Draft) => {
    if (!d.block_key?.trim()) return toast.error("La clave del bloque es obligatoria");
    try {
      await save({ data: d });
      toast.success("Guardado");
      qc.invalidateQueries({ queryKey: ["site_content_admin"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este bloque?")) return;
    try {
      await del({ data: { id } });
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["site_content_admin"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const addBlock = () =>
    persist({
      section,
      block_key: `bloque_${Date.now()}`,
      block_type: section === "landing" ? "feature" : "text",
      title: "Nuevo bloque",
      body: "",
      sort_order: (blocks.at(-1)?.sort_order ?? 0) + 10,
      active: true,
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {([["landing", "Página principal"], ["privacy", "Política de Privacidad"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSection(k)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${section === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={addBlock} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border px-3 py-1.5 hover:bg-secondary">
          <Plus className="size-3.5" /> Añadir bloque
        </button>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="space-y-4">
        {blocks.map((b) => <BlockEditor key={b.id} block={b} onSave={persist} onDelete={() => remove(b.id)} />)}
        {!q.isLoading && blocks.length === 0 && <p className="text-sm text-muted-foreground">No hay bloques en esta sección.</p>}
      </div>
    </div>
  );
}

function BlockEditor({ block, onSave, onDelete }: { block: SiteBlock; onSave: (d: Draft) => void; onDelete: () => void }) {
  const [f, setF] = useState<SiteBlock>(block);
  const set = (k: keyof SiteBlock, v: any) => setF((p) => ({ ...p, [k]: v }));
  const input = "w-full px-3 py-2 rounded-md border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="rounded-xl border bg-surface p-4 space-y-3">
      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Clave</label>
          <input className={input} value={f.block_key} onChange={(e) => set("block_key", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</label>
          <select className={input} value={f.block_type} onChange={(e) => set("block_type", e.target.value)}>
            <option value="hero">hero</option>
            <option value="cta">cta</option>
            <option value="feature">feature</option>
            <option value="text">text</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Icono (lucide)</label>
          <input className={input} value={f.icon ?? ""} onChange={(e) => set("icon", e.target.value)} placeholder="Bike" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Orden</label>
          <input type="number" className={input} value={f.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Título</label>
          <input className={input} value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtítulo</label>
          <input className={input} value={f.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Texto</label>
        <textarea className={`${input} min-h-24`} value={f.body ?? ""} onChange={(e) => set("body", e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Visible
        </label>
        <div className="flex gap-2">
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive rounded-md px-3 py-1.5 hover:bg-destructive/10">
            <Trash2 className="size-3.5" /> Eliminar
          </button>
          <button onClick={() => onSave(f)} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground px-3 py-1.5">
            <Save className="size-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
