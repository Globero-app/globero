import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Bell, Mail, Smartphone, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Preferencias para recibir avisos cuando un componente se acerca al final de su vida útil.
 * - Push: usa la Notification API del navegador (funciona en la PWA instalada).
 * - Email: guarda la preferencia; el envío real requiere activar Lovable Emails.
 */
export function MaintenanceNotifyPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) { setPushPermission("unsupported"); return; }
    setPushPermission(Notification.permission);
  }, []);

  const prefsQ = useQuery({
    queryKey: ["notify_prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("notify_maintenance_email, notify_maintenance_push")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const savePref = async (field: "notify_maintenance_email" | "notify_maintenance_push", value: boolean) => {
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user!.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["notify_prefs"] });
  };

  const togglePush = async (value: boolean) => {
    if (value && pushPermission !== "granted") {
      if (pushPermission === "unsupported") {
        toast.error("Este navegador no admite notificaciones push");
        return;
      }
      if (pushPermission === "denied") {
        toast.error("Permiso denegado. Actívalo en los ajustes del navegador.");
        return;
      }
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== "granted") {
        toast.error("Permiso no concedido");
        return;
      }
      try {
        new Notification("Notificaciones activadas", {
          body: "Te avisaremos cuando toque revisar tu material.",
          icon: "/favicon.ico",
        });
      } catch { /* noop */ }
    }
    await savePref("notify_maintenance_push", value);
    toast.success(value ? "Push activadas" : "Push desactivadas");
  };

  const emailEnabled = !!prefsQ.data?.notify_maintenance_email;
  const pushEnabled = !!prefsQ.data?.notify_maintenance_push;

  return (
    <div className="bg-muted/40 border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <h4 className="font-display text-sm font-bold uppercase tracking-tight">Avisos de mantenimiento</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Recibirás una alerta cuando un componente supere el 85% de su vida útil o esté vencido.
      </p>

      <div className="space-y-2">
        {/* Push */}
        <label className="flex items-start gap-3 p-3 bg-background border rounded-md cursor-pointer hover:border-primary/40 transition-colors">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => togglePush(e.target.checked)}
            disabled={pushPermission === "unsupported"}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Smartphone className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Notificaciones push (navegador / PWA)</span>
              {pushPermission === "granted" && <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="size-3" /> permitido</span>}
              {pushPermission === "denied" && <span className="text-[10px] uppercase font-bold text-destructive flex items-center gap-0.5"><AlertCircle className="size-3" /> bloqueado</span>}
              {pushPermission === "unsupported" && <span className="text-[10px] uppercase font-bold text-muted-foreground">no soportado</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Aparecen al abrir la app si tienes alertas activas. Funcionan mejor instalando la app.
            </p>
          </div>
        </label>

        {/* Email */}
        <label className="flex items-start gap-3 p-3 bg-background border rounded-md cursor-pointer hover:border-primary/40 transition-colors">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => savePref("notify_maintenance_email", e.target.checked).then(() => toast.success(e.target.checked ? "Email activado" : "Email desactivado"))}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Recordatorio semanal por email</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Resumen de piezas próximas al límite en <strong>{user?.email}</strong>. Requiere activar Emails en el backend.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
