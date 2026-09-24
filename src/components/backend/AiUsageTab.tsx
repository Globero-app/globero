import { tr } from "@/lib/i18n";import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalAiUsage } from "@/lib/diag.functions";

export function AiUsageTab() {
  const aiFn = useServerFn(getGlobalAiUsage);
  const q = useQuery({ queryKey: ["ai_usage_global"], queryFn: () => aiFn({ data: undefined } as any) });
  const d = q.data as any;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{tr("Totales de todos los usuarios desde el")} {d?.since ?? "día 1"} {tr("del mes.")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Llamadas a la IA")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : d?.total_calls ?? 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Tokens consumidos")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : (d?.total_tokens ?? 0).toLocaleString("es-ES")}</p>
        </div>
      </div>
      {!q.isLoading && (d?.items ?? []).length === 0 ?
      <div className="border-2 border-dashed rounded-xl p-10 text-center text-sm text-muted-foreground">{tr("Sin llamadas registradas este mes.")}</div> :

      <ul className="divide-y border rounded-xl">
          {((d?.items ?? []) as any[]).map((g) =>
        <li key={g.fn} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium truncate">{g.fn}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {g.calls} {tr("llamada(s) ·")} {(g.prompt_tokens + g.completion_tokens).toLocaleString("es-ES")} {tr("tokens")} 
          </span>
            </li>
        )}
        </ul>
      }
    </div>);

}
