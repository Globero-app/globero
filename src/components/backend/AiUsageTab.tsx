import { localeCode, tr } from "@/lib/i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalAiUsage } from "@/lib/diag.functions";
import { AI_CREDIT_COST_USD, formatAiCostUsd, formatAiCredits } from "@/lib/ai-usage";

export function AiUsageTab() {
  const aiFn = useServerFn(getGlobalAiUsage);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const q = useQuery({ queryKey: ["ai_usage_global", month], queryFn: () => aiFn({ data: { month } }) });
  const d = q.data as any;
  const locale = localeCode();
  const items = d?.items ?? [];
  const users = d?.users ?? [];
  const models = d?.models ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{tr("Consumo mensual global y por usuario.")} {tr("Desde")} {d?.since ?? "—"}.</p>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Estimación a 0,20 USD por crédito; no es un cargo facturado.")} ({formatAiCostUsd(AI_CREDIT_COST_USD, locale)}/{tr("crédito")})</p>
      </div>
      {q.isError && <div className="border border-destructive/30 rounded-lg p-4 text-sm text-destructive">{tr("No se pudo cargar el uso de IA.")}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Llamadas a la IA")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : (d?.total_calls ?? 0).toLocaleString(locale)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Tokens consumidos")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : (d?.total_tokens ?? 0).toLocaleString(locale)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Créditos estimados")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : formatAiCredits(d?.total_credits ?? 0, locale)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Coste estimado")}</p>
          <p className="font-display text-2xl font-bold mt-1">{q.isLoading ? "…" : formatAiCostUsd(d?.total_cost_usd ?? 0, locale)}</p>
        </div>
      </div>
      {!q.isLoading && items.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center text-sm text-muted-foreground">{tr("Sin llamadas registradas este mes.")}</div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold uppercase">{tr("Por usuario")}</h2>
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr("Usuario")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr("Llamadas")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr("Tokens")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr("Créditos mes")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr("Coste estimado")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user: any) => (
                    <tr key={user.user_id ?? "system"}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{user.full_name || user.email || tr("Sistema / sin usuario")}</p>
                        {user.full_name && user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">{user.calls.toLocaleString(locale)}</td>
                      <td className="px-4 py-3 text-right">{user.tokens.toLocaleString(locale)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatAiCredits(user.credits, locale)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatAiCostUsd(user.cost_usd, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold uppercase">{tr("Por función")}</h2>
            <ul className="divide-y border rounded-xl">
              {items.map((g: any) => (
                <li key={`${g.fn}:${g.model}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{g.fn}</p>
                    <p className="text-xs text-muted-foreground truncate">{g.model}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{g.calls} {tr("llamada(s) ·")} {(g.prompt_tokens + g.completion_tokens).toLocaleString(locale)} {tr("tokens")}</p>
                    <p className="font-medium">{formatAiCredits(g.credits, locale)} {tr("créditos")} · {formatAiCostUsd(g.cost_usd, locale)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
