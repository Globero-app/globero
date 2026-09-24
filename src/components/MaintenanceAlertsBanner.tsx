import { tr } from "@/lib/i18n";import { Link } from "@tanstack/react-router";
import { AlertTriangle, Wrench, ChevronRight } from "lucide-react";
import { useMaintenanceAlerts } from "@/lib/maintenance-alerts";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Compact alerts card for the dashboard. Also fires a native browser
 * notification (once per session) if the user opted in to push.
 */
export function MaintenanceAlertsBanner({ variant = "dashboard" }: {variant?: "dashboard" | "inline";}) {
  const { user } = useAuth();
  const { data: alerts = [] } = useMaintenanceAlerts();

  const prefsQ = useQuery({
    queryKey: ["notify_prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data as (Record<string, unknown> & {notify_maintenance_push?: boolean;}) | null;
    },
    enabled: !!user
  });

  // Fire local browser notification once per session when there are alerts
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current) return;
    if (!prefsQ.data?.notify_maintenance_push) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (alerts.length === 0) return;

    const key = `maint:notified:${user?.id}`;
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60 * 60 * 1000) return; // 1h dedupe per session/tab

    const first = alerts[0];
    const body = first.severity === "danger" ?
    `${first.componentLabel} de ${first.bikeName} ha superado su vida útil` :
    `${first.componentLabel} de ${first.bikeName}: quedan ${Math.round(first.remaining)} km`;
    try {
      new Notification("Mantenimiento pendiente", {
        body: alerts.length > 1 ? `${body} · +${alerts.length - 1} más` : body,
        icon: "/favicon.ico",
        tag: "maintenance"
      });
      sessionStorage.setItem(key, String(Date.now()));
      notifiedRef.current = true;
    } catch {/* noop */}
  }, [alerts, prefsQ.data, user?.id]);

  if (alerts.length === 0) return null;

  const danger = alerts.filter((a) => a.severity === "danger").length;
  const warn = alerts.length - danger;

  const wrapClass = variant === "dashboard" ?
  "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 md:p-5" :
  "bg-amber-50 border border-amber-200 rounded-lg p-3";

  return (
    <div className={wrapClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-9 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <Wrench className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-bold uppercase tracking-tight text-amber-900"> {tr("Mantenimiento pendiente")} 

            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {danger > 0 && <span className="font-semibold">{danger} {tr("pieza")}{danger > 1 ? "s" : ""} {tr("vencida")}{danger > 1 ? "s" : ""}</span>}
              {danger > 0 && warn > 0 && " · "}
              {warn > 0 && <span>{warn} {tr("próxima")}{warn > 1 ? "s" : ""} {tr("al límite")}</span>}
            </p>
          </div>
        </div>
        <Link to="/perfil" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"> {tr("Ver")} 
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <ul className="mt-3 space-y-1.5">
        {alerts.slice(0, 3).map((a) =>
        <li key={a.componentId} className="flex items-center justify-between text-xs bg-white/60 rounded-md px-2.5 py-1.5">
            <span className="truncate">
              <strong className="text-foreground">{a.componentLabel}</strong>
              <span className="text-muted-foreground"> · {a.bikeName}</span>
            </span>
            <span className={`shrink-0 ml-2 font-mono font-semibold flex items-center gap-1 ${a.severity === "danger" ? "text-destructive" : "text-amber-700"}`}>
              {a.severity === "danger" ?
            <>
                  <AlertTriangle className="size-3" />
                  +{Math.round(-a.remaining)} {tr("km")} 
            </> :

            <>{Math.round(a.remaining)} {tr("km")}</>
            }
            </span>
          </li>
        )}
        {alerts.length > 3 &&
        <li className="text-[11px] text-amber-800 text-center pt-1">+{alerts.length - 3} {tr("más")}</li>
        }
      </ul>
    </div>);

}
