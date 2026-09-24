import { tr } from "@/lib/i18n";import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link as LinkIcon, Unlink } from "lucide-react";
import { createStravaAuthorizeUrl, disconnectStrava } from "@/lib/strava.functions";

export function StravaConnection({ profile }: {profile: any;}) {
  const qc = useQueryClient();
  const disconnect = useServerFn(disconnectStrava);
  const authorize = useServerFn(createStravaAuthorizeUrl);

  if (profile?.strava_access_token) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-5 text-orange-600" />
            <div>
              <p className="font-semibold text-orange-800">{tr("Strava conectado")}</p>
              <p className="text-xs text-orange-700">{tr("Atleta:")} {profile?.strava_athlete_id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await disconnect({ data: undefined });
               toast.success(tr("Strava desconectado"));
              qc.invalidateQueries({ queryKey: ["profile"] });
            }}
            className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1">
            
            <Unlink className="size-3" /> {tr("Desconectar")} 
          </button>
        </div>
        <p className="text-xs text-muted-foreground"> {tr("Al detectar un entreno realizado, se renombra la actividad en Strava con el nombre del entreno y se añade debajo \"atleta de https://globero.app/\".")} 


        </p>
      </div>);

  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground"> {tr("Conecta Strava para que tus salidas aparezcan con el nombre del entrenamiento realizado.")} 

      </p>
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
        className="inline-flex items-center gap-2 bg-[#FC4C02] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
        
        <LinkIcon className="size-4" /> {tr("Conectar con Strava")} 
      </button>
    </div>);

}
