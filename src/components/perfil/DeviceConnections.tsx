import { tr } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link as LinkIcon, Unlink } from "lucide-react";
import { createWahooAuthorizeUrl, disconnectWahoo } from "@/lib/wahoo.functions";

export function WahooConnection({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const disconnect = useServerFn(disconnectWahoo);
  const authorize = useServerFn(createWahooAuthorizeUrl);

  if (profile?.wahoo_access_token) {
    return (
      <div className="flex items-center justify-between bg-muted border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-semibold">{tr("Wahoo conectado")}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await disconnect({ data: undefined });
            toast.success(tr("Wahoo desconectado"));
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> {tr("Desconectar")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tr("Conecta tu Wahoo ELEMNT para enviar los entrenamientos al ciclocomputador y recibir tus actividades.")}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            const { url } = await authorize({ data: undefined });
            window.location.href = url;
          } catch (e: any) {
            toast.error(e?.message ?? tr("No se pudo iniciar la conexión"));
          }
        }}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
      >
        <LinkIcon className="size-4" /> {tr("Conectar con Wahoo")}
      </button>
    </div>
  );
}

export function GarminConnection() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tr("Conecta Garmin Connect para enviar los entrenamientos a tu dispositivo y recibir tus actividades.")}</p>
      <button
        type="button"
        onClick={() => toast.info(tr("Próximamente. Estamos trabajando con Garmin para su implementación."))}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
      >
        <LinkIcon className="size-4" /> {tr("Conectar con Garmin")}
      </button>
    </div>
  );
}
