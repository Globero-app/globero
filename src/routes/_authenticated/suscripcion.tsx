import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";

export const Route = createFileRoute("/_authenticated/suscripcion")({
  head: () => ({ meta: [
    { title: "Suscripción — Globero" },
    { name: "description", content: "Consulta tu prueba gratuita y gestiona tu suscripción de entrenamiento y nutrición en Globero." },
    { property: "og:title", content: "Suscripción — Globero" },
    { property: "og:description", content: "Gestiona tu suscripción de entrenamiento y nutrición en Globero." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return <div className="max-w-2xl space-y-6">
    <h1 className="font-display text-3xl font-bold uppercase">Suscripción</h1>
    <SubscriptionPanel />
  </div>;
}
