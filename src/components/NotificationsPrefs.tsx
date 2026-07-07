import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Bell, Smartphone, CheckCircle2, AlertCircle, Wrench, Dumbbell, Droplets, Activity, Mail } from "lucide-react";
import { pushPermission, requestPushPermission, sendLocalPush } from "@/lib/push";

type PrefKey =
  | "notify_training_push"
  | "notify_prerace_push"
  | "notify_strava_push"
  | "notify_maintenance_push"
  | "notify_maintenance_email";

interface Cat {
  key: PrefKey;
  icon: any;
  label: string;
  desc: string;
  requiresPermission: boolean;
}

const CATEGORIES: Cat[] = [
  { key: "notify_training_push", icon: Dumbbell, label: "Entrenamiento de hoy", desc: "Aviso cuando toca la sesión planificada del día.", requiresPermission: true },
  { key: "notify_prerace_push", icon: Droplets, label: "Hidratación pre-carrera", desc: "Recordatorio 2-3 días antes con tu plan de hidratación y sodio.", requiresPermission: true },
  { key: "notify_strava_push", icon: Activity, label: "Sincronización Strava", desc: "Confirmación cuando entran nuevas actividades.", requiresPermission: true },
  { key: "notify_maintenance_push", icon: Wrench, label: "Mantenimiento de material", desc: "Componentes al 85% o vencidos (cadena, pastillas, cubiertas…).", requiresPermission: true },
];

export function NotificationsPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => { setPerm(pushPermission()); }, []);

  const prefsQ = useQuery({
    queryKey: ["notify_prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  const savePref = async (field: PrefKey, value: boolean) => {
    const { error } = await supabase.from("profiles").update({ [field]: value } as never).eq("id", user!.id);
    if (error) { toast.error(error.message); return false; }
    qc.invalidateQueries({ queryKey: ["notify_prefs"] });
    return true;
  };

  const ensurePermission = async (): Promise<boolean> => {
    if (perm === "granted") return true;
    if (perm === "unsupported") { toast.error("Este navegador no admite notificaciones"); return false; }
    if (perm === "denied") { toast.error("Permiso bloqueado. Actívalo en los ajustes del navegador."); return false; }
    const p = await requestPushPermission();
    setPerm(p);
    if (p !== "granted") { toast.error("Permiso no concedido"); return false; }
    sendLocalPush({
      title: "Notificaciones activadas",
      body: "Recibirás avisos importantes de tu entrenamiento y material.",
      tag: "welcome",
      category: "maintenance",
      dedupe: "none",
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

  const emailEnabled = !!prefsQ.data?.notify_maintenance_email;

  return (
    <div className="bg-muted/40 border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h4 className="font-display text-sm font-bold uppercase tracking-tight">Notificaciones push</h4>
        </div>
        <PermissionBadge perm={perm} />
      </div>
      <p className="text-xs text-muted-foreground">
        Elige qué avisos quieres recibir. Se muestran al abrir la app; para recibirlos
        también con la app cerrada, instala la PWA en tu móvil.
      </p>

      {perm !== "granted" && perm !== "unsupported" && (
        <button
          onClick={ensurePermission}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 rounded-md"
        >
          <Smartphone className="size-3.5" /> Permitir notificaciones
        </button>
      )}

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
                className="mt-0.5 size-4 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </label>
          );
        })}

        {/* Email de mantenimiento (existente) */}
        <label className="flex items-start gap-3 p-3 bg-background border rounded-md cursor-pointer hover:border-primary/40 transition-colors">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => savePref("notify_maintenance_email", e.target.checked).then((ok) => ok && toast.success(e.target.checked ? "Email activado" : "Email desactivado"))}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Resumen semanal por email</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Piezas próximas al límite enviadas a <strong>{user?.email}</strong>. Requiere activar Emails en el backend.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}

function PermissionBadge({ perm }: { perm: NotificationPermission | "unsupported" }) {
  if (perm === "granted") return <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> permitido</span>;
  if (perm === "denied") return <span className="text-[10px] uppercase font-bold text-destructive flex items-center gap-1"><AlertCircle className="size-3" /> bloqueado</span>;
  if (perm === "unsupported") return <span className="text-[10px] uppercase font-bold text-muted-foreground">no soportado</span>;
  return <span className="text-[10px] uppercase font-bold text-amber-600">pendiente</span>;
}
