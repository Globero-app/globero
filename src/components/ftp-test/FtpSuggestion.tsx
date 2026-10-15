import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFtpTest } from "@/lib/ftp-tests.functions";

/** Propuesta de FTP detectada pasivamente: aceptar recalcula umbrales/zonas, descartar la oculta. */
export function FtpSuggestion({ suggested, current }: { suggested: number; current: number | null }) {
  const save = useServerFn(saveFtpTest);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const close = () => nav({ to: "/ftp-test", search: {} as any, replace: true });
  if (!suggested || (current && suggested <= current)) return null;
  const accept = async () => {
    setBusy(true);
    try {
      await save({ data: { ftp: suggested, source: "passive" } });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(`FTP actualizado a ${suggested} W. Zonas recalculadas.`);
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar el FTP");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
      <p className="font-semibold flex items-center gap-2"><Zap className="size-4 text-primary" /> Posible nuevo FTP detectado</p>
      <p className="text-sm text-muted-foreground">
        Tus esfuerzos recientes indican un FTP de <b className="text-foreground">{suggested} W</b>
        {current ? <> (actual {current} W)</> : null}. ¿Quieres recalcular tus umbrales y zonas?
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={accept}>{busy ? "Guardando…" : "Aceptar"}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { toast("Propuesta descartada"); close(); }}>Descartar</Button>
      </div>
    </div>
  );
}
