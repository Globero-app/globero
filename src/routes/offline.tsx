import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw, MapPin, Dumbbell, Trophy, User, Activity, UtensilsCrossed, LayoutDashboard, CheckCircle2, XCircle } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/offline")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sin conexión — Globero" },
      { name: "description", content: "Estado de la conexión y contenido disponible offline." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OfflinePage,
});

const AVAILABLE_OFFLINE = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/app", note: "Última versión cacheada" },
  { icon: User, label: "Perfil", to: "/perfil", note: "Datos vistos recientemente" },
  { icon: Activity, label: "Actividades", to: "/actividades", note: "Gráfico y lista cacheados" },
  { icon: Dumbbell, label: "Entrenamientos", to: "/entrenamientos", note: "Últimos vistos + descargas .fit/.zwo" },
  { icon: Trophy, label: "Competiciones", to: "/competiciones", note: "Listado y detalles ya cargados" },
  { icon: UtensilsCrossed, label: "Menús", to: "/menus", note: "Menús visitados" },
  { icon: MapPin, label: "Mapas GPX", to: "/competiciones", note: "Tiles y trazas ya vistas" },
] as const;

const REQUIRES_NETWORK = [
  "Sincronizar con Intervals.icu",
  "Generar nuevos entrenamientos con IA",
  "Crear o editar competiciones",
  "Guardar cambios en el perfil",
  "Subir logos de patrocinadores",
] as const;

function OfflinePage() {
  const online = useOnlineStatus();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (online) {
      document.title = "Conectado — Globero";
    }
  }, [online]);

  const retry = async () => {
    setChecking(true);
    try {
      // Try a lightweight fetch to confirm real connectivity (navigator.onLine can lie).
      await fetch("/manifest.webmanifest", { cache: "no-store" });
      window.location.href = "/app";
    } catch {
      // Still offline — keep the user on this page.
      setTimeout(() => setChecking(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Status hero */}
        <div className={`rounded-2xl border p-6 sm:p-8 mb-6 ${online ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}>
          <div className="flex items-start gap-4">
            <div className={`size-12 rounded-full grid place-items-center shrink-0 ${online ? "bg-emerald-500 text-white" : "bg-destructive text-destructive-foreground"}`}>
              {online ? <Wifi className="size-6" /> : <WifiOff className="size-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                {online ? "Conexión restaurada" : "Estás sin conexión"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {online
                  ? "Tu dispositivo vuelve a tener red. Puedes recargar para sincronizar los datos más recientes."
                  : "No podemos alcanzar nuestros servidores. Puedes seguir consultando el contenido que ya se cargó anteriormente."}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={retry} disabled={checking}>
                  <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />
                  {online ? "Ir al inicio" : "Reintentar conexión"}
                </Button>
                {online && (
                  <Button asChild variant="outline">
                    <Link to="/app">Volver al dashboard</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Available offline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Disponible sin conexión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {AVAILABLE_OFFLINE.map(({ icon: Icon, label, to, note }) => (
                <li key={label} className="py-2.5 flex items-center gap-3">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link to={to} className="text-sm font-medium hover:underline">
                      {label}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{note}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              Los archivos <span className="font-mono">.fit</span> y{" "}
              <span className="font-mono">.zwo</span> que descargaste están guardados en tu
              dispositivo — puedes importarlos en Zwift o TrainingPeaks sin conexión.
            </p>
          </CardContent>
        </Card>

        {/* Requires network */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="size-4 text-destructive" />
              Requiere conexión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {REQUIRES_NETWORK.map((item) => (
                <li key={item} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              En cuanto vuelvas a tener red, la app sincronizará automáticamente los cambios
              pendientes y recargará los datos más recientes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
