import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isMobileContainer } from "@/lib/mobile-container";
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
  const [nativeContainer, setNativeContainer] = useState<boolean | null>(null);
  useEffect(() => { setNativeContainer(isMobileContainer()); }, []);
  const paymentAction = (fn: () => Promise<{ url?: string }>) => {
    if (nativeContainer !== false || isMobileContainer()) return;
    return action(fn);
  };
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
    {nativeContainer === true && <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Aquí puedes consultar el estado de tu cuenta y la disponibilidad de las funciones. Esta app no permite realizar compras ni gestionar pagos.</p>
    </div>}
    {q.isPending ? <p>Cargando…</p> : q.isError ? <p role="alert">No se pudo consultar la suscripción.</p> : q.data && <>
      <div className="space-y-2 border-b pb-5">
        <p className="text-lg font-semibold">{subscriptionLabel(q.data)}</p>
        {!q.data.admin_grant_active && q.data.subscription_status !== "active" && <p className="text-sm text-muted-foreground">
          Prueba gratuita hasta el {new Date(q.data.trial_ends_at).toLocaleDateString("es-ES")}.
        </p>}
        <p className="text-sm text-muted-foreground">{canGenerate(q.data) ? "Creación de entrenamientos y menús activada." : nativeContainer === false ? "Puedes seguir accediendo a tus datos. Activa una suscripción para crear nuevos entrenamientos y menús." : "Puedes seguir consultando tus datos. La creación de nuevos entrenamientos y menús no está disponible para tu cuenta."}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {nativeContainer === false && !q.data.admin_grant_active && q.data.subscription_status !== "active" && <Button disabled={busy} onClick={() => paymentAction(() => checkout())}><CreditCard />Activar suscripción</Button>}
        {nativeContainer === false && q.data.has_customer && <Button variant="outline" disabled={busy} onClick={() => paymentAction(() => portal())}><ExternalLink />Gestionar o cancelar</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => action(check)}><RefreshCw />Actualizar estado</Button>
      </div>
    </>}
  </div>;
}