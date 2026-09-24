import { tr } from "@/lib/i18n";import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Bike, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { intervalsImportFtpTest, markFtpTestCompleted } from "@/lib/intervals.functions";

export function FtpTestImport({ icuConnected, onImported }: {icuConnected: boolean;onImported: (ftp: number) => void;}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const importFromIntervals = useServerFn(intervalsImportFtpTest);
  const markCompleted = useServerFn(markFtpTestCompleted);
  const [importingId, setImportingId] = useState<string | null>(null);

  const recentActs = useQuery({
    queryKey: ["icu-ftp-candidates", user?.id],
    queryFn: async () => {
      const { data } = await supabase.
      from("intervals_activities").
      select("id,name,start_date,moving_time,distance,average_watts,total_elevation_gain").
      eq("user_id", user!.id).
      gte("moving_time", 20 * 60).
      not("average_watts", "is", null).
      order("start_date", { ascending: false }).
      limit(15);
      return data ?? [];
    },
    enabled: !!user && icuConnected
  });

  const handleImportIntervals = async (activityId: string) => {
    setImportingId(activityId);
    try {
      const r = await importFromIntervals({ data: { activity_id: activityId } });
      toast.success(`FTP calculado: ${r.ftp} W (mejor 20' = ${r.avg_watts_20min} W)`);
      onImported(r.ftp);
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {toast.error(e.message);} finally
    {setImportingId(null);}
  };

  const handleMarkOnly = async () => {
    try {
      await markCompleted({ data: undefined });
      toast.success(tr("Test marcado como realizado."));
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {toast.error(e.message);}
  };

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-3">
      <h2 className="font-display text-lg font-bold uppercase tracking-tight flex items-center gap-2">
        <CheckCheck className="size-5" /> {tr("Marcar test como realizado")} 
      </h2>

      {icuConnected ?
      <>
          <p className="text-sm text-muted-foreground"> {tr("Selecciona la actividad de Intervals.icu donde hiciste el test. Calcularemos el mejor esfuerzo de 20 min y actualizaremos tu FTP y zonas.")} 

        </p>
          {recentActs.isLoading ?
        <p className="text-xs text-muted-foreground">{tr("Cargando actividades…")}</p> :
        (recentActs.data ?? []).length === 0 ?
        <p className="text-xs text-muted-foreground"> {tr("No hay actividades recientes con potencia. Sincroniza Intervals.icu desde el")} 
          <Link to="/perfil" className="underline">{tr("perfil")}</Link> {tr("tras subir el test.")} 
        </p> :

        <ul className="divide-y border rounded-lg overflow-hidden">
              {(recentActs.data ?? []).map((a: any) =>
          <li key={a.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {format(new Date(a.start_date), "d MMM yyyy · HH:mm", { locale: es })} · {Math.round((a.moving_time ?? 0) / 60)} {tr("min · media")} {Math.round(a.average_watts)} {tr("W")} 
              </p>
                  </div>
                  <button
              onClick={() => handleImportIntervals(String(a.id))}
              disabled={importingId === String(a.id)}
              className="shrink-0 inline-flex items-center gap-1 bg-[#fc4c02] text-white px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50">
              
                    <Bike className="size-3.5" />
                    {importingId === String(a.id) ? "Calculando…" : "Usar este test"}
                  </button>
                </li>
          )}
            </ul>
        }
          <div className="pt-2 flex flex-wrap gap-2">
            <button onClick={handleMarkOnly} className="text-xs font-semibold px-3 py-1.5 rounded-md border hover:bg-muted"> {tr("Marcar como realizado sin actualizar FTP")} 

          </button>
          </div>
        </> :

      <>
          <p className="text-sm text-muted-foreground"> {tr("Conecta Intervals.icu en tu")} 
          <Link to="/perfil" className="underline text-primary">{tr("perfil")}</Link> {tr("para importar el test directamente y calcular las zonas automáticamente. Mientras tanto, introduce la potencia media de los 20 min más abajo cuando termines la prueba.")} 

        </p>
          <button onClick={handleMarkOnly} className="text-xs font-semibold px-3 py-1.5 rounded-md border hover:bg-muted"> {tr("Marcar como realizado")} 

        </button>
        </>
      }
    </div>);

}
