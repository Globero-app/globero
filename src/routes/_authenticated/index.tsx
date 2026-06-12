import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Trophy, Flame, Bike, ChevronRight, Plus, Trash2, Activity, Timer, Heart } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const comps = useQuery({
    queryKey: ["competitions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("competitions").select("*").eq("user_id", user!.id).order("date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const acts = useQuery({
    queryKey: ["recent_activities", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("strava_activities").select("*").eq("user_id", user!.id).order("start_date", { ascending: false }).limit(60);
      return data ?? [];
    },
    enabled: !!user,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta competición?")) return;
    const { error } = await supabase.from("competitions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Competición eliminada");
      qc.invalidateQueries({ queryKey: ["competitions"] });
    }
  };

  const today = new Date();
  const upcoming = (comps.data ?? []).filter((c) => new Date(c.date) >= today);
  const next = upcoming[0];
  const daysToNext = next ? Math.ceil((new Date(next.date).getTime() - today.getTime()) / 86400000) : null;

  // CTL (42d EMA) y ATL (7d EMA) basados en suffer_score como proxy de TSS
  const { ctl, atl, tsb } = computeForm(acts.data ?? []);
  const form = interpretTSB(tsb);

  // Progreso del plan de carga: días transcurridos vs ventana de plan (90 días antes de la cita)
  const PLAN_WINDOW_DAYS = 90;
  const planProgress = next
    ? Math.max(0, Math.min(100, ((PLAN_WINDOW_DAYS - (daysToNext ?? 0)) / PLAN_WINDOW_DAYS) * 100))
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Panel del ciclista</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight mt-1">
          Hola, <span className="text-primary italic">{profile.data?.full_name?.split(" ")[0] ?? "ciclista"}</span>
        </h1>
      </div>

      {/* Countdown + Form */}
      {(next || (acts.data?.length ?? 0) > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {next && (
            <div className="bg-accent text-accent-foreground border border-accent rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent-foreground/60 flex items-center gap-2">
                  <Timer className="size-3.5 text-primary" /> Cuenta atrás
                </p>
                <span className="text-[10px] font-mono uppercase tracking-widest text-primary">{format(new Date(next.date), "d MMM", { locale: es })}</span>
              </div>
              <p className="font-display text-3xl font-bold uppercase tracking-tight truncate">{next.name}</p>
              <p className="font-display text-5xl font-bold mt-2">
                <span className="text-primary">⏱ Faltan {daysToNext}</span>
                <span className="text-2xl text-accent-foreground/60 ml-2">{daysToNext === 1 ? "día" : "días"}</span>
              </p>
              <div className="mt-5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-accent-foreground/60 mb-1.5">
                  <span>Plan de carga</span>
                  <span className="text-primary">{planProgress.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-accent-foreground/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${planProgress}%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                <Heart className="size-3.5 text-primary" /> Estado de forma
              </p>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Performance Manager</span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <Dot color="bg-emerald-500" on={form.level === "green"} />
                <Dot color="bg-amber-400" on={form.level === "yellow"} />
                <Dot color="bg-red-500" on={form.level === "red"} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold uppercase tracking-tight">{form.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{form.message}</p>
              </div>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-4">
              Carga {ctl.toFixed(0)} · Fatiga {atl.toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Próxima cita" value={next?.name ?? "—"} sub={next ? `en ${daysToNext}d` : "Sin competiciones"} icon={Trophy} accent />
        <StatCard label="Carga (CTL)" value={ctl > 0 ? ctl.toFixed(0) : "—"} sub="42 días" icon={Flame} />
        <StatCard label="Actividades" value={String(acts.data?.length ?? 0)} sub="últimas sincronizadas" icon={Activity} />
        <StatCard label="Competiciones" value={String(comps.data?.length ?? 0)} sub="totales" icon={Bike} />
      </div>

      {/* Competitions list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold uppercase tracking-tight">Tus competiciones</h2>
          <Link to="/competiciones" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
            <Plus className="size-4" /> Nueva
          </Link>
        </div>
        {comps.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-surface border rounded-xl p-5 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-3/4" />
                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" />
                </div>
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (comps.data?.length ?? 0) === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No tienes competiciones aún.</p>
            <Link to="/competiciones" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
              <Plus className="size-4" /> Crear primera competición
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {comps.data!.map((c) => (
              <div key={c.id} className="group bg-surface border rounded-xl p-5 hover:border-primary/50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-primary">
                      {format(new Date(c.date), "d MMM yyyy", { locale: es })}
                    </p>
                    <h3 className="font-display text-xl font-bold uppercase truncate mt-0.5">{c.name}</h3>
                  </div>
                  <button onClick={() => handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-opacity">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs border-t pt-3">
                  <div><p className="text-muted-foreground">Distancia</p><p className="font-semibold">{c.distance_km}km</p></div>
                  <div><p className="text-muted-foreground">Desnivel</p><p className="font-semibold">+{c.elevation_m}m</p></div>
                  <div><p className="text-muted-foreground">Tipo</p><p className="font-semibold capitalize">{c.type}</p></div>
                </div>
                <Link to="/competiciones/$id" params={{ id: c.id }} className="mt-4 flex items-center justify-between text-xs font-semibold text-primary">
                  Ver plan completo <ChevronRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }: any) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? "bg-accent text-accent-foreground border-accent" : "bg-surface"}`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[10px] font-mono uppercase tracking-widest ${accent ? "text-accent-foreground/60" : "text-muted-foreground"}`}>{label}</p>
        <Icon className={`size-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className="font-display text-2xl font-bold truncate">{value}</p>
      <p className={`text-[10px] mt-0.5 ${accent ? "text-accent-foreground/60" : "text-muted-foreground"}`}>{sub}</p>
    </div>
  );
}

function Dot({ color, on }: { color: string; on: boolean }) {
  return <span className={`size-4 rounded-full ${color} transition-opacity ${on ? "opacity-100 ring-2 ring-offset-2 ring-offset-surface ring-current shadow-lg" : "opacity-20"}`} />;
}

function computeForm(acts: Array<{ start_date: string | null; suffer_score: number | null }>) {
  if (!acts.length) return { ctl: 0, atl: 0, tsb: 0 };
  const byDay = new Map<string, number>();
  for (const a of acts) {
    if (!a.start_date) continue;
    const k = a.start_date.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + (a.suffer_score ?? 0));
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return { ctl: 0, atl: 0, tsb: 0 };
  const start = new Date(days[0]);
  const end = new Date();
  const kCtl = 2 / (42 + 1);
  const kAtl = 2 / (7 + 1);
  let ctl = 0, atl = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const tss = byDay.get(d.toISOString().slice(0, 10)) ?? 0;
    ctl = ctl + kCtl * (tss - ctl);
    atl = atl + kAtl * (tss - atl);
  }
  return { ctl, atl, tsb: ctl - atl };
}

function interpretTSB(tsb: number): { level: "green" | "yellow" | "red"; title: string; message: string } {
  if (tsb >= 5) return { level: "green", title: "Frescura óptima", message: "Estás descansado y listo para competir. Aprovecha." };
  if (tsb >= -10) return { level: "yellow", title: "Carga equilibrada", message: "Buen punto de entrenamiento, mantén ritmo y cuida descansos." };
  return { level: "red", title: "Sobrecarga: descansa", message: "Fatiga alta. Reduce intensidad y prioriza recuperación esta semana." };
}
