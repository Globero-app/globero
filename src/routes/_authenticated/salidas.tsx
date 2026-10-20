import { createFileRoute, Link } from "@tanstack/react-router";
import { Bike, ChevronRight, MapPinned, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/salidas")({
  component: SalidasPage,
  head: () => ({
    meta: [
      { title: "Salidas · Rutas, Garage y Baliza | Globero" },
      { name: "description", content: "Accede a tus rutas, bicicletas y baliza de seguridad desde Salidas en Globero." },
      { property: "og:title", content: "Salidas · Rutas, Garage y Baliza | Globero" },
      { property: "og:description", content: "Tus rutas, Garage y Baliza reunidos en Salidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const OPTIONS = [
  { to: "/competiciones", label: "nav.routes", icon: MapPinned },
  { to: "/mi-bici", label: "outings.garage", icon: Bike },
  { to: "/baliza", label: "nav.beacon", icon: Radio },
] as const;

function SalidasPage() {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="font-display text-3xl font-bold uppercase">{t("nav.outings")}</h1>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        {OPTIONS.map(({ to, label, icon: Icon }) => (
          <Button key={to} asChild variant="outline" className="h-auto min-w-0 justify-start whitespace-normal rounded-lg bg-surface p-5 text-left hover:border-primary/50">
            <Link to={to}>
              <Icon className="!size-7 text-primary" />
              <span className="min-w-0 flex-1 break-words font-display text-base font-bold">{t(label)}</span>
              <ChevronRight />
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}