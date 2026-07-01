import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { stravaSync } from "@/lib/strava.functions";
import { toast } from "sonner";
import { RefreshCw, Activity, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/actividades")({
  component: ActividadesPage,
});

function ActividadesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(stravaSync);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("strava_access_token").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const acts = useQuery({
    queryKey: ["strava_activities", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("strava_activities").select("*").eq("user_id", user!.id).order("start_date", { ascending: false }).limit(20);
      return data ?? [];
    },
    enabled: !!user,
  });

  const handleSync = async () => {
    try {
      const r = await sync({ data: undefined });
      toast.success(`Sincronizadas ${r.count} actividades`);
      qc.invalidateQueries({ queryKey: ["strava_activities"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Auto-sync al entrar si hay Strava conectado (una vez cada 10 min)
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!user || !profile.data?.strava_access_token || autoSyncedRef.current) return;
    const key = `strava:lastSync:${user.id}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    autoSyncedRef.current = true;
    localStorage.setItem(key, String(Date.now()));
    sync({ data: undefined })
      .then(() => qc.invalidateQueries({ queryKey: ["strava_activities"] }))
      .catch(() => {});
  }, [user, profile.data?.strava_access_token, sync, qc]);

  // Calcula CTL (carga crónica, 42 días) y ATL (fatiga, 7 días) con suffer_score
  const chartData = buildCtlAtl(acts.data ?? []);

  if (!profile.data?.strava_access_token) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <Activity className="size-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight mb-2">Actividades</h1>
        <p className="text-muted-foreground mb-6">Conecta tu cuenta Strava desde el Perfil para ver tus actividades y gráficos.</p>
        <a href="/perfil" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          Ir al Perfil
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Strava</p>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Actividades</h1>
        </div>
        <button onClick={handleSync} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <RefreshCw className="size-4" /> Sincronizar
        </button>
      </div>

      <div className="bg-surface border rounded-xl p-5">
        <h2 className="font-display text-lg font-bold uppercase mb-4">Carga, Fatiga &amp; Forma</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="carga" stroke="var(--primary)" strokeWidth={2} dot={false} name="Carga (CTL)" />
              <Line type="monotone" dataKey="fatiga" stroke="var(--accent)" strokeWidth={2} dot={false} name="Fatiga (ATL)" />
              <Line type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={2} dot={false} name="Forma (TSB)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-lg font-bold uppercase mb-2">Últimas 20 actividades</h2>
        {(acts.data ?? []).map((a) => (
          <div key={a.id} className="bg-surface border rounded-lg p-4 flex items-center justify-between hover:border-primary/40">
            <div className="min-w-0">
              <p className="font-semibold truncate">{a.name}</p>
              <p className="text-xs text-muted-foreground">
                {a.start_date && format(new Date(a.start_date), "d MMM yyyy · HH:mm", { locale: es })} · {a.type}
              </p>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div className="text-right"><p className="text-muted-foreground">Distancia</p><p className="font-semibold">{((a.distance ?? 0) / 1000).toFixed(1)}km</p></div>
              <div className="text-right hidden md:block"><p className="text-muted-foreground">Desnivel</p><p className="font-semibold">+{Math.round(a.total_elevation_gain ?? 0)}m</p></div>
              <div className="text-right hidden md:block"><p className="text-muted-foreground">Sufrimiento</p><p className="font-semibold">{a.suffer_score ?? "—"}</p></div>
              <a href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noopener" className="text-primary hover:opacity-80">
                <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
        ))}
        {acts.data?.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay actividades. Pulsa "Sincronizar".</p>}
      </div>
    </div>
  );
}

function buildCtlAtl(acts: any[]) {
  if (acts.length === 0) return [];
  // Ordena ascendente por fecha
  const sorted = [...acts].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  // Agrupa por día
  const dayMap = new Map<string, number>();
  sorted.forEach((a) => {
    const d = format(new Date(a.start_date), "yyyy-MM-dd");
    dayMap.set(d, (dayMap.get(d) ?? 0) + (a.suffer_score ?? 0));
  });
  const days = Array.from(dayMap.entries());
  // EMA CTL=42 ATL=7
  const result: any[] = [];
  let ctl = 0, atl = 0;
  days.forEach(([d, tss]) => {
    ctl = ctl + (tss - ctl) * (1 - Math.exp(-1 / 42));
    atl = atl + (tss - atl) * (1 - Math.exp(-1 / 7));
    const tsb = ctl - atl;
    result.push({ label: format(new Date(d), "d MMM", { locale: es }), carga: Math.round(ctl), fatiga: Math.round(atl), tsb: Math.round(tsb) });
  });
  return result;
}
