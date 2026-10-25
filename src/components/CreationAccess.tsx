import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LockKeyhole, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canGenerate } from "@/lib/subscription-access";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const CreationAccessContext = createContext<() => boolean>(() => false);

export function useCreationAccess() {
  return useContext(CreationAccessContext);
}

export function CreationAccess({ userId, path, children }: { userId?: string; path: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["trial-expiry-notice", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("profiles")
        .select("trial_ends_at,subscription_status,admin_grant_active,deactivated_at")
        .eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });
  const blocked = !q.isPending && !q.isError && !canGenerate(q.data ?? null);
  const requireAccess = () => {
    if (!q.isPending && !q.isError && canGenerate(q.data ?? null)) return true;
    setOpen(true);
    return false;
  };
  const message = "Necesitas una suscripción activa para crear entrenamientos, menús, rutas y balizas. Puedes seguir consultando tus datos y acceder a Perfil y Ajustes.";
  const subscriptionLink = <Button asChild className="shrink-0 self-start" onClick={() => setOpen(false)}><Link to="/perfil" search={{ tab: "subscription" }}><CreditCard />Ver suscripción</Link></Button>;
  return <CreationAccessContext.Provider value={requireAccess}>
    {blocked && !["/ajustes", "/perfil", "/suscripcion"].includes(path) && <section role="alert" aria-label="Creación bloqueada" className="mb-6 flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0 space-y-1"><p className="text-sm font-semibold">Creación bloqueada: sin suscripción activa</p><p className="text-sm text-muted-foreground">{message}</p></div></div>
      {subscriptionLink}
    </section>}
    {children}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{blocked ? "Creación bloqueada" : "Comprobando tu suscripción"}</DialogTitle>
          <DialogDescription>{blocked ? message : q.isError ? "No se pudo comprobar tu suscripción. Inténtalo de nuevo antes de crear contenido." : "Espera a que termine la comprobación y vuelve a intentarlo."}</DialogDescription>
        </DialogHeader>
        {blocked ? subscriptionLink : <Button variant="outline" onClick={() => { void q.refetch(); setOpen(false); }}>Volver a intentar</Button>}
      </DialogContent>
    </Dialog>
  </CreationAccessContext.Provider>;
}