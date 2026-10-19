import { tr } from "@/lib/i18n";import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link as LinkIcon, Unlink } from "lucide-react";
import { disconnectIntervals } from "@/lib/intervals.functions";
import { intervalsAuthorizeUrl } from "@/lib/intervals-oauth";
import { createIntervalsOAuthState } from "@/lib/intervals-oauth.functions";

export function IntervalsConnection({ profile }: {profile: any;}) {
  const qc = useQueryClient();
  const disconnectIcu = useServerFn(disconnectIntervals);
  const createOAuthState = useServerFn(createIntervalsOAuthState);

  if (profile?.intervals_api_key) {
    return (
      <div className="space-y-3">
        <div className="grid min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto] bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 break-words">
              <p className="font-semibold text-emerald-800">{tr("Intervals.icu conectado")}</p>
              <p className="text-xs text-emerald-700">{tr("Atleta:")} {profile?.intervals_athlete_id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await disconnectIcu({ data: undefined });
               toast.success(tr("Intervals.icu desconectado"));
              qc.invalidateQueries({ queryKey: ["profile"] });
            }}
            className="text-xs font-semibold text-destructive hover:underline flex shrink-0 items-center gap-1">
            
            <Unlink className="size-3" /> {tr("Desconectar")} 
          </button>
        </div>
        <p className="text-xs text-muted-foreground"> {tr("Sincronización de zonas y umbrales (FTP, LTHR, FC máx) con Intervals.icu al guardar el perfil")} 

        </p>
      </div>);

  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground"> {tr("Vincula tu cuenta de Intervals.icu de forma segura. Se te pedirá autorizar Globero IA en Intervals.icu y volverás automáticamente aquí.")} 

      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            const { state } = await createOAuthState();
            window.location.href = intervalsAuthorizeUrl(state);
          } catch (e: any) {
             toast.error(e?.message ?? tr("No se pudo iniciar la conexión"));
          }
        }}
        className="inline-flex max-w-full items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
        
        <LinkIcon className="size-4 shrink-0" /> {tr("Conectar con Intervals.icu")} 
      </button>
    </div>);

}
