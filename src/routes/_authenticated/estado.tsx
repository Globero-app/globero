import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { RefreshCw, CheckCircle2, XCircle, Bell, Send, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSyncStatus, getNotificationHistory, getAiUsage } from "@/lib/diag.functions";
import { intervalsSyncActivities } from "@/lib/intervals.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/estado")({
  component: EstadoPage,
  head: () => ({
    meta: [
      { title: "Estado de sincronización y avisos | Globero IA" },
      { name: "description", content: "Consulta la última sincronización con Intervals.icu, fuerza una nueva y revisa el historial de notificaciones enviadas." },
      { property: "og:title", content: "Estado de sincronización y avisos | Globero IA" },
      { property: "og:description", content: "Diagnóstico de sincronización con Intervals.icu e historial de avisos Push y Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "d MMM yyyy HH:mm", { locale: es });
  } catch {
    return "—";
  }
}

function EstadoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const statusFn = useServerFn(getSyncStatus);
  const notifFn = useServerFn(getNotificationHistory);
  const aiFn = useServerFn(getAiUsage);
  const syncFn = useServerFn(intervalsSyncActivities);
  const [syncing, setSyncing] = useState(false);

  const status = useQuery({ queryKey: ["sync_status", user?.id], queryFn: () => statusFn({ data: undefined } as any), enabled: !!user });
  const notifs = useQuery({ queryKey: ["notif_history", user?.id], queryFn: () => notifFn({ data: undefined } as any), enabled: !!user });
  const aiUsage = useQuery({ queryKey: ["ai_usage", user?.id], queryFn: () => aiFn({ data: undefined } as any), enabled: !!user });

  const forceSync = async () => {
    setSyncing(true);
    try {
      const res: any = await syncFn({ data: undefined });
      toast.success(`Sincronización completada: ${res?.count ?? 0} actividades`);
      qc.invalidateQueries({ queryKey: ["sync_status"] });
      qc.invalidateQueries({ queryKey: ["recent_activities"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Diagnóstico</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight mt-1">Estado</h1>
      </div>

      <section className="bg-surface border rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-bold uppercase tracking-tight">Intervals.icu</h2>
          <button
            onClick={forceSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} /> Forzar sincronización
          </button>
        </div>

        {status.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="Conexión" value={status.data?.connected ? "Conectado" : "No conectado"} ok={!!status.data?.connected} />
              <Info label="Última sincronización" value={fmt((status.data as any)?.last_activity?.synced_at)} />
              <Info label="Actividades" value={String((status.data as any)?.activity_count ?? 0)} />
            </div>
            {(status.data as any)?.last_activity && (
              <p className="text-sm text-muted-foreground">
                Última actividad detectada: <span className="text-foreground font-medium">{(status.data as any).last_activity.name ?? "Actividad"}</span>{" "}
                ({fmt((status.data as any).last_activity.start_date)})
              </p>
            )}
          </>
        )}

        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-2">Registro de sincronizaciones</p>
          {((status.data as any)?.logs ?? []).length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
              Todavía no hay registros de sincronización.
            </div>
          ) : (
            <ul className="divide-y border rounded-lg">
              {((status.data as any).logs as any[]).map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  {l.ok ? <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.kind} · {l.items} elemento(s)</p>
                    {l.message && <p className="text-muted-foreground text-xs break-words">{l.message}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmt(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-surface border rounded-xl p-6 space-y-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">Historial de avisos</h2>
        {notifs.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
          </div>
        ) : ((notifs.data as any)?.items ?? []).length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Bell className="size-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Aún no se ha enviado ningún aviso.</p>
          </div>
        ) : (
          <ul className="divide-y border rounded-lg">
            {((notifs.data as any).items as any[]).map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                {n.channel === "telegram" ? <Send className="size-4 text-primary mt-0.5 shrink-0" /> : <Bell className="size-4 text-primary mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{n.title}</p>
                  <p className="text-muted-foreground text-xs whitespace-pre-line line-clamp-3">{n.body}</p>
                  {n.error && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertTriangle className="size-3" /> {n.error}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] font-mono uppercase tracking-widest ${n.status === "sent" ? "text-emerald-500" : n.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                    {n.status}
                  </span>
                  <p className="text-xs text-muted-foreground">{fmt(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className={`font-display text-xl font-bold uppercase tracking-tight mt-1 ${ok === false ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
