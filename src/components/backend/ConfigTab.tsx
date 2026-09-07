import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateAppConfig } from "@/lib/admin.functions";
import { useAppConfig } from "@/lib/use-app-config";
import { Field, INPUT_STYLE } from "./AdminField";

export function ConfigTab() {
  const cfg = useAppConfig();
  const qc = useQueryClient();
  const update = useServerFn(updateAppConfig);
  const [f, setF] = useState<any>({});
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update({ data: f });
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["app_config"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <form onSubmit={save} className="grid md:grid-cols-2 gap-4 max-w-3xl">
      <Field label="Nombre del equipo"><input className="input" value={f.team_name ?? ""} onChange={(e) => setF({...f, team_name: e.target.value})} /></Field>
      <Field label="Color primario"><input type="color" className="input h-10" value={f.primary_color ?? "#e11d48"} onChange={(e) => setF({...f, primary_color: e.target.value})} /></Field>
      <Field label="Color de acento"><input type="color" className="input h-10" value={f.accent_color ?? "#0f172a"} onChange={(e) => setF({...f, accent_color: e.target.value})} /></Field>
      <Field label="Color de botones"><input type="color" className="input h-10" value={f.button_color ?? "#e11d48"} onChange={(e) => setF({...f, button_color: e.target.value})} /></Field>
      <Field label="Fuente cuerpo">
        <select className="input" value={f.font_family ?? "Inter"} onChange={(e) => setF({...f, font_family: e.target.value})}>
          <option>Inter</option><option>Roboto</option><option>Lato</option><option>Open Sans</option><option>System</option>
        </select>
      </Field>
      <Field label="Fuente display">
        <select className="input" value={f.display_font ?? "Barlow Condensed"} onChange={(e) => setF({...f, display_font: e.target.value})}>
          <option>Barlow Condensed</option><option>Oswald</option><option>Anton</option><option>Bebas Neue</option>
        </select>
      </Field>
      <div className="md:col-span-2"><button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm">Guardar configuración</button></div>
      <style>{INPUT_STYLE}</style>
    </form>
  );
}
