import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { saveReadiness } from "@/lib/readiness.functions";
import { HeartPulse, UtensilsCrossed, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const LABELS: Record<number, string> = {
  1: "Nada preparado",
  2: "Paseo relajado",
  3: "Entreno normal",
  4: "Entreno exigente",
  5: "Dar lo máximo",
};

function madridToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Bloque "hoy": readiness en un toque + menú del día, sin salir del panel. */
export function TodayPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = madridToday();
  const save = useServerFn(saveReadiness);

  const readiness = useQuery({
    queryKey: ["readiness-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("readiness_entries")
        .select("score, ai_message")
        .eq("user_id", user!.id)
        .eq("entry_date", today)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const menu = useQuery({
    queryKey: ["menu-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("weekly_nutrition_plans")
        .select("plan, week_start")
        .eq("user_id", user!.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      const dias: any[] = ((data?.plan as any)?.dias as any[]) ?? [];
      return dias.find((d) => d.fecha === today) ?? null;
    },
    enabled: !!user,
  });

  const m = useMutation({
    mutationFn: (score: number) => save({ data: { score, note: null } }),
    onSuccess: (r: any) => {
      toast.success(r?.message ? String(r.message).slice(0, 160) : "Readiness registrado");
      qc.invalidateQueries({ queryKey: ["readiness-today"] });
      qc.invalidateQueries({ queryKey: ["today-workout"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="bg-surface border rounded-xl p-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
          <HeartPulse className="size-3.5 text-primary" /> Readiness de hoy
        </p>
        {readiness.data ? (
          <div className="mt-3">
            <p className="font-display text-2xl font-bold uppercase tracking-tight">
              {readiness.data.score} · {LABELS[readiness.data.score] ?? ""}
            </p>
            {readiness.data.ai_message && (
              <p className="text-xs text-muted-foreground mt-1.5">{readiness.data.ai_message}</p>
            )}
            <Link to="/readiness" search={{}} className="text-xs text-primary font-semibold inline-flex items-center gap-1 mt-3">
              <Check className="size-3.5" /> Ver histórico
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mt-2">¿Cómo te encuentras? La sesión de hoy se adapta sola.</p>
            <div className="flex gap-2 mt-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  disabled={m.isPending}
                  onClick={() => m.mutate(s)}
                  title={LABELS[s]}
                  className="flex-1 py-3 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/10 font-display text-xl font-bold disabled:opacity-50"
                >
                  {m.isPending ? <Loader2 className="size-4 animate-spin mx-auto" /> : s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-surface border rounded-xl p-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
          <UtensilsCrossed className="size-3.5 text-primary" /> Menú de hoy
        </p>
        {menu.data ? (
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="text-xs text-muted-foreground">
              {Math.round(menu.data.objetivo_calorias_kcal ?? 0)} kcal · {Math.round(menu.data.objetivo_carbohidratos_g ?? 0)} g CH
            </p>
            {(["desayuno", "comida", "cena"] as const).map((k) => (
              <p key={k} className="truncate">
                <span className="text-muted-foreground capitalize">{k}: </span>
                {menu.data[k]?.nombre ?? "—"}
              </p>
            ))}
            <Link to="/menus" className="text-xs text-primary font-semibold inline-block pt-1">
              Ver plan completo
            </Link>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">Aún no hay menú para hoy.</p>
            <Link to="/menus" className="text-xs text-primary font-semibold inline-block mt-2">
              Generar plan nutricional
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
