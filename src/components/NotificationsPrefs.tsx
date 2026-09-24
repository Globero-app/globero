import { tr } from "@/lib/i18n";import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Bell, Smartphone, CheckCircle2, AlertCircle, Wrench, Dumbbell, Droplets, Activity, Server, Send, PowerOff, Compass, AlertTriangle } from "lucide-react";
import { pushPermission, requestPushPermission, sendLocalPush } from "@/lib/push";
import { useServerFn } from "@tanstack/react-start";
import { sendTestPush } from "@/lib/push-server.functions";
import { enableServerPush, disableServerPush, getServerPushSubscription, serverPushSupported } from "@/lib/push-client";

type PrefKey =
"notify_daily_brief" |
"notify_fatigue_alerts" |
"notify_training_push" |
"notify_prerace_push" |
"notify_strava_push" |
"notify_maintenance_push" |
"notify_maintenance_email";

interface Cat {
  key: PrefKey;
  icon: any;
  label: string;
  desc: string;
  requiresPermission: boolean;
}

const CATEGORIES: Cat[] = [
{ key: "notify_daily_brief", icon: Compass, label: "Resumen diario del coach", desc: "Qué toca hoy, tu forma actual y un consejo del coach IA.", requiresPermission: true },
{ key: "notify_fatigue_alerts", icon: AlertTriangle, label: "Alertas de fatiga", desc: "Avisos cuando la fatiga, la rampa de carga o el sueño se disparan.", requiresPermission: true },
{ key: "notify_training_push", icon: Dumbbell, label: "Entrenamiento de hoy", desc: "Aviso cuando toca la sesión planificada del día.", requiresPermission: true },
{ key: "notify_prerace_push", icon: Droplets, label: "Hidratación pre-carrera", desc: "Recordatorio 2-3 días antes con tu plan de hidratación y sodio.", requiresPermission: true },
{ key: "notify_strava_push", icon: Activity, label: "Sincronización Intervals.icu", desc: "Confirmación cuando entran nuevas actividades.", requiresPermission: true },
{ key: "notify_maintenance_push", icon: Wrench, label: "Mantenimiento de material", desc: "Componentes al 85% o vencidos (cadena, pastillas, cubiertas…).", requiresPermission: true }];


export function NotificationsPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [serverSub, setServerSub] = useState<"unknown" | "subscribed" | "none" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);
  const testFn = useServerFn(sendTestPush);

  useEffect(() => {
    setPerm(pushPermission());
    if (!serverPushSupported()) {setServerSub("unsupported");return;}
    getServerPushSubscription().then((s) => setServerSub(s ? "subscribed" : "none")).catch(() => setServerSub("none"));
  }, []);

  const prefsQ = useQuery({
    queryKey: ["notify_prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data as any;
    },
    enabled: !!user
  });

  const saveChannel = async (value: string) => {
    const { error } = await supabase.from("profiles").update({ notify_channel: value } as never).eq("id", user!.id);
    if (error) {toast.error(error.message);return;}
    qc.invalidateQueries({ queryKey: ["notify_prefs"] });
    toast.success("Canal actualizado");
  };

  const savePref = async (field: PrefKey, value: boolean) => {
    const { error } = await supabase.from("profiles").update({ [field]: value } as never).eq("id", user!.id);
    if (error) {toast.error(error.message);return false;}
    qc.invalidateQueries({ queryKey: ["notify_prefs"] });
    return true;
  };

  const ensurePermission = async (): Promise<boolean> => {
    if (perm === "granted") return true;
    if (perm === "unsupported") {toast.error("Este navegador no admite notificaciones");return false;}
    if (perm === "denied") {toast.error(tr("Permiso bloqueado. Actívalo en los ajustes del navegador."));return false;}
    const p = await requestPushPermission();
    setPerm(p);
    if (p !== "granted") {toast.error("Permiso no concedido");return false;}
    sendLocalPush({
      title: "Notificaciones activadas",
      body: "Recibirás avisos importantes de tu entrenamiento y material.",
      tag: "welcome",
      category: "maintenance",
      dedupe: "none"
    });
    return true;
  };

  const togglePush = async (field: PrefKey, value: boolean, needsPerm: boolean) => {
    if (value && needsPerm) {
      const ok = await ensurePermission();
      if (!ok) return;
    }
    const ok = await savePref(field, value);
    if (ok) toast.success(value ? "Activado" : "Desactivado");
  };


  const enableServer = async () => {
    setBusy(true);
    try {
      const r = await enableServerPush();
      if (r.ok) {setServerSub("subscribed");setPerm("granted");toast.success("Push del servidor activado");} else
      toast.error(r.reason);
    } catch (e: any) {toast.error(e.message);} finally
    {setBusy(false);}
  };

  const disableServer = async () => {
    setBusy(true);
    try {await disableServerPush();setServerSub("none");toast.success("Push del servidor desactivado");}
    catch (e: any) {toast.error(e.message);} finally
    {setBusy(false);}
  };

  const testServer = async () => {
    setBusy(true);
    try {
      const r = (await testFn({})) as {sent: number;};
      toast.success(`Enviado a ${r.sent} dispositivo${r.sent === 1 ? "" : "s"}`);
    } catch (e: any) {toast.error(e.message);} finally
    {setBusy(false);}
  };

  return (
    <div className="bg-muted/40 border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h4 className="font-display text-sm font-bold uppercase tracking-tight">{tr("Notificaciones push")}</h4>
        </div>
        <PermissionBadge perm={perm} />
      </div>
      <p className="text-xs text-muted-foreground"> {tr("Elige qué avisos quieres recibir. Se muestran al abrir la app; para recibirlos también con la app cerrada, instala la PWA en tu móvil.")} 


      </p>

      {/* Push del servidor */}
      <div className="border rounded-lg p-3 bg-background space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="size-3.5 text-primary" />
            <span className="text-sm font-semibold">{tr("Push del servidor")}</span>
          </div>
          <ServerStatusBadge status={serverSub} />
        </div>
        <p className="text-[11px] text-muted-foreground"> {tr("Recibe avisos con la app cerrada (recordatorios de entreno, sync Intervals.icu, mantenimiento…). Requiere permitir notificaciones e instalar la PWA en iOS.")} 


        </p>
        <div className="flex flex-wrap gap-2">
          {serverSub !== "subscribed" ?
          <button
            onClick={enableServer}
            disabled={busy || serverSub === "unsupported"}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
            
              <Smartphone className="size-3.5" /> {tr("Activar push del servidor")} 
          </button> :

          <>
              <button
              onClick={testServer}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              
                <Send className="size-3.5" /> {tr("Enviar prueba")} 
            </button>
              <button
              onClick={disableServer}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary disabled:opacity-50">
              
                <PowerOff className="size-3.5" /> {tr("Desactivar")} 
            </button>
            </>
          }
        </div>
      </div>

      {/* Canal de entrega */}
      {prefsQ.data?.telegram_chat_id &&
      <div className="border rounded-lg p-3 bg-background space-y-2">
          <div className="flex items-center gap-2">
            <Send className="size-3.5 text-primary" />
            <span className="text-sm font-semibold">{tr("¿Dónde quieres recibirlas?")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
          { v: "push", l: "App móvil" },
          { v: "telegram", l: "Telegram" },
          { v: "both", l: "Ambos" }] as
          const).map((o) => {
            const active = (prefsQ.data?.notify_channel ?? "push") === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => saveChannel(o.v)}
                className={`text-xs font-semibold px-2 py-1.5 rounded-md border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:border-primary/40"}`}>
                
                  {o.l}
                </button>);

          })}
          </div>
          <p className="text-[11px] text-muted-foreground">{tr("Se aplica a las notificaciones marcadas abajo.")}</p>
        </div>
      }

      {perm !== "granted" && perm !== "unsupported" &&
      <button
        onClick={ensurePermission}
        className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 rounded-md">
        
          <Smartphone className="size-3.5" /> {tr("Permitir notificaciones")} 
      </button>
      }

      <div className="space-y-2">
        {CATEGORIES.map(({ key, icon: Icon, label, desc, requiresPermission }) => {
          const checked = !!prefsQ.data?.[key];
          return (
            <label key={key} className="flex items-start gap-3 p-3 bg-background border rounded-md cursor-pointer hover:border-primary/40 transition-colors">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => togglePush(key, e.target.checked, requiresPermission)}
                disabled={perm === "unsupported"}
                className="mt-0.5 size-4 accent-primary" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </label>);

        })}

      </div>
    </div>);

}

function ServerStatusBadge({ status }: {status: "unknown" | "subscribed" | "none" | "unsupported";}) {
  if (status === "subscribed") return <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> {tr("activo")}</span>;
  if (status === "unsupported") return <span className="text-[10px] uppercase font-bold text-muted-foreground">{tr("no soportado")}</span>;
  if (status === "unknown") return <span className="text-[10px] uppercase font-bold text-muted-foreground">…</span>;
  return <span className="text-[10px] uppercase font-bold text-amber-600">{tr("inactivo")}</span>;
}

function PermissionBadge({ perm }: {perm: NotificationPermission | "unsupported";}) {
  if (perm === "granted") return <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> {tr("permitido")}</span>;
  if (perm === "denied") return <span className="text-[10px] uppercase font-bold text-destructive flex items-center gap-1"><AlertCircle className="size-3" /> {tr("bloqueado")}</span>;
  if (perm === "unsupported") return <span className="text-[10px] uppercase font-bold text-muted-foreground">{tr("no soportado")}</span>;
  return <span className="text-[10px] uppercase font-bold text-amber-600">{tr("pendiente")}</span>;
}
