import { tr } from "@/lib/i18n";import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deactivateMyAccount } from "@/lib/account.functions";

export function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const deactivate = useServerFn(deactivateMyAccount);

  const accept = async () => {
    setLoading(true);
    try {
      await deactivate({ data: undefined });
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (e: any) {
      toast.error(e?.message || "No se ha podido eliminar el perfil");
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
      <h3 className="font-display text-lg font-bold uppercase tracking-tight text-destructive">{tr("Eliminar perfil")}</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-2xl"> {tr("Se eliminarán tus conexiones con Telegram e Intervals.icu y dejarán de crearse entrenamientos, informes y avisos.")} 

      </p>
      {!confirming ?
      <button type="button" onClick={() => setConfirming(true)} className="mt-3 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"> {tr("Eliminar Perfil")} 

      </button> :

      <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold"> {tr("¿Seguro que quieres eliminar tu perfil? Una vez eliminado no podrás acceder a tus datos y todo tu progreso quedará eliminado.")} 

        </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">{tr("Cancelar")}</button>
            <button type="button" disabled={loading} onClick={accept} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
              {loading ? "Eliminando…" : "Aceptar"}
            </button>
          </div>
        </div>
      }
    </div>);

}
