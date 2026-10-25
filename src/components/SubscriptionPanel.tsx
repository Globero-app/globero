import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { canGenerate, subscriptionLabel } from "@/lib/subscription-access";
import { getMySubscription, createSubscriptionCheckout, createSubscriptionPortal, refreshMySubscription } from "@/lib/subscription.functions";

export function SubscriptionPanel() {
  const load = useServerFn(getMySubscription);
  const checkout = useServerFn(createSubscriptionCheckout);
  const portal = useServerFn(createSubscriptionPortal);
  const refresh = useServerFn(refreshMySubscription);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-subscription"], queryFn: () => load(), refetchInterval: 30000 });
  const [busy, setBusy] = useState(false);
  const action = async (fn: () => Promise<{ url?: string }>) => {
    setBusy(true);
    try { const result = await fn(); if (result.url) window.location.assign(result.url); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo gestionar la suscripción"); }
    finally { setBusy(false); }
  };
  const check = async () => {
    await refresh();
    await qc.invalidateQueries({ queryKey: ["my-subscription"] });
    await qc.invalidateQueries({ queryKey: ["profile"] });
    await qc.invalidateQueries({ queryKey: ["trial-expiry-notice"] });
    return {};
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      refresh().then(() => qc.invalidateQueries({ queryKey: ["my-subscription"] })).catch(() => toast.error("No se pudo comprobar el pago. Pulsa Actualizar estado."));
    }
  }, [refresh, qc]);
  return <div className="max-w-2xl space-y-6">
    {q.isPending ? <p>Cargando…</p> : q.isError ? <p role="alert">No se pudo consultar la suscripción.</p> : q.data && <>
      <div className="space-y-2 border-b pb-5">
        <p className="text-lg font-semibold">{subscriptionLabel(q.data)}</p>
        {!q.data.admin_grant_active && q.data.subscription_status !== "active" && <p className="text-sm text-muted-foreground">
          Prueba gratuita hasta el {new Date(q.data.trial_ends_at).toLocaleDateString("es-ES")}.
        </p>}
        <p className="text-sm text-muted-foreground">{canGenerate(q.data) ? "Creación de entrenamientos y menús activada." : "Puedes seguir accediendo a tus datos. Activa una suscripción para crear nuevos entrenamientos y menús."}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {!q.data.admin_grant_active && q.data.subscription_status !== "active" && <Button disabled={busy} onClick={() => action(() => checkout())}><CreditCard />Activar suscripción</Button>}
        {q.data.has_customer && <Button variant="outline" disabled={busy} onClick={() => action(() => portal())}><ExternalLink />Gestionar o cancelar</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => action(check)}><RefreshCw />Actualizar estado</Button>
      </div>
    </>}
  </div>;
}