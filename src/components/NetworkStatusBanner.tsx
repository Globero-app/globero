import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Global network status banner.
 * - When offline: shows a persistent bar at the top explaining offline mode.
 * - When connection returns: shows a brief "back online" toast with a retry button
 *   that refetches all queries.
 */
export function NetworkStatusBanner() {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [justReconnected, setJustReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setJustReconnected(false);
      return;
    }
    if (wasOffline) {
      setJustReconnected(true);
      // Auto refetch on reconnect.
      qc.invalidateQueries();
      const t = setTimeout(() => setJustReconnected(false), 4000);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline, qc]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full bg-destructive text-destructive-foreground shadow-md"
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="size-4 shrink-0" />
            <span className="truncate">
              Sin conexión — trabajando en modo offline con contenido cacheado.
            </span>
          </div>
          <a
            href="/offline"
            className="shrink-0 underline underline-offset-2 font-medium hover:opacity-90"
          >
            Ver detalles
          </a>
        </div>
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full bg-emerald-600 text-white shadow-md"
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Wifi className="size-4 shrink-0" />
            <span className="truncate">Conexión restaurada. Actualizando datos…</span>
          </div>
          <button
            onClick={() => qc.invalidateQueries()}
            className="shrink-0 inline-flex items-center gap-1 underline underline-offset-2 font-medium hover:opacity-90"
          >
            <RefreshCw className="size-3.5" /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
