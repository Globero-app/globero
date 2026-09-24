import { tr } from "@/lib/i18n";import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getErrorStats } from "@/lib/diag.functions";

export function ErrorsTab() {
  const statsFn = useServerFn(getErrorStats);
  const [days, setDays] = useState(7);
  const q = useQuery({ queryKey: ["error_stats", days], queryFn: () => statsFn({ data: { days } }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[1, 7, 30].map((d) =>
        <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${days === d ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}>
            {d === 1 ? "24 h" : `${d} días`}
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{(q.data as any)?.total ?? 0} {tr("eventos")}</span>
      </div>
      {q.isLoading ?
      <p className="text-sm text-muted-foreground">{tr("Cargando…")}</p> :
      ((q.data as any)?.groups ?? []).length === 0 ?
      <div className="border-2 border-dashed rounded-xl p-10 text-center text-sm text-muted-foreground">{tr("Sin errores registrados. 🎉")}</div> :

      <ul className="divide-y border rounded-xl">
          {((q.data as any).groups as any[]).map((g, i) =>
        <li key={i} className="px-4 py-3 flex items-start gap-3">
              <span className="shrink-0 text-xs font-bold bg-destructive/10 text-destructive rounded-md px-2 py-0.5">{g.count}{tr("×")}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{g.message}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{g.source}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(g.last).toLocaleString("es-ES")}</span>
            </li>
        )}
        </ul>
      }
    </div>);

}
