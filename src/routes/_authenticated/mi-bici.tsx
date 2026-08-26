import { createFileRoute } from "@tanstack/react-router";
import { BikesManager } from "@/components/BikesManager";
import { MaintenanceAlertsBanner } from "@/components/MaintenanceAlertsBanner";

export const Route = createFileRoute("/_authenticated/mi-bici")({
  head: () => ({
    meta: [
      { title: "Mi Bici — Material y mantenimiento" },
      { name: "description", content: "Registra tus bicicletas y componentes, controla el kilometraje y recibe alertas de mantenimiento." },
      { property: "og:title", content: "Mi Bici — Material y mantenimiento" },
      { property: "og:description", content: "Registra tus bicicletas y componentes, controla el kilometraje y recibe alertas de mantenimiento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MiBiciPage,
});

function MiBiciPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-tight">Mi Bici</h1>
      <div className="bg-surface border rounded-xl p-5 space-y-3">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">Material y mantenimiento</h2>
        <MaintenanceAlertsBanner variant="inline" />
        <BikesManager />
      </div>
    </div>
  );
}
