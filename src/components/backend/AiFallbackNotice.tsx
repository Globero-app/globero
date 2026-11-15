import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { getAiFallbackNotices } from "@/lib/diag.functions";

export function AiFallbackNotice() {
  const getNotices = useServerFn(getAiFallbackNotices);
  const query = useQuery({ queryKey: ["ai-fallback-notices"], queryFn: () => getNotices(), refetchInterval: 30000 });
  if (query.isError) return <p role="alert" className="text-sm text-destructive">No se pudieron consultar los avisos de modelos de IA.</p>;
  return <>{query.data?.map((notice) => (
    <div key={notice.primary_model} role="alert" className="flex gap-3 border border-destructive/40 bg-destructive/5 p-4 rounded-lg">
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 text-sm space-y-1">
        <p className="font-semibold break-words">El modelo {notice.primary_model} {notice.reason === "retired" ? "ha sido retirado" : "no está disponible"}.</p>
        <p className="break-words">Se está utilizando el modelo de reserva {notice.fallback_model}. Cambia el modelo principal de IA para sustituirlo definitivamente.</p>
      </div>
    </div>
  ))}</>;
}