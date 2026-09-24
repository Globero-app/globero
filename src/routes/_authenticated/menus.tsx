import { tr, activeLang } from "@/lib/i18n";import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { generateWeeklyNutrition } from "@/lib/nutrition.functions";
import { ChefHat, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/menus")({
  component: MenusPage,
  head: () => ({
    meta: [
    { title: "Menús · Plan nutricional semanal | Globero" },
    { name: "description", content: "Tu plan nutricional semanal adaptado a los entrenamientos y a tu objetivo: pérdida de peso, mantenimiento o masa muscular." },
    { property: "og:title", content: "Menús · Plan nutricional semanal" },
    { property: "og:description", content: "Menús diarios adaptados a tus entrenamientos y competiciones." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" }]

  })
});

const GOALS = [
{ value: "perdida_peso", label: "Pérdida de peso" },
{ value: "mantenimiento", label: "Mantenimiento" },
{ value: "masa_muscular", label: "Ganar masa muscular" }] as
const;

const MEALS = [
{ key: "desayuno", label: "Desayuno" },
{ key: "media_manana", label: "Media mañana" },
{ key: "comida", label: "Comida" },
{ key: "merienda", label: "Merienda" },
{ key: "cena", label: "Cena" }] as
const;

function MenusPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const genNutrition = useServerFn(generateWeeklyNutrition);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["profile-nutrition", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nutrition_goal,nutrition_plan_enabled,dietary_preferences").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const [goal, setGoal] = useState<string | null>(null);
  const effectiveGoal = goal ?? profile.data?.nutrition_goal ?? "mantenimiento";

  const weeks = useQuery({
    queryKey: ["weekly-nutrition", user?.id],
    queryFn: async () => {
      const { data } = await supabase.
      from("weekly_nutrition_plans").
      select("*").
      eq("user_id", user!.id).
      order("week_start", { ascending: false }).
      limit(8);
      return data ?? [];
    },
    enabled: !!user
  });

  const comps = useQuery({
    queryKey: ["competitions_menu", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("competitions").select("id,name,date,menu_plan,distance_km").eq("user_id", user!.id).order("date");
      return data ?? [];
    },
    enabled: !!user
  });

  const withMenu = (comps.data ?? []).filter((c) => c.menu_plan);

  const generate = async () => {
    setBusy(true);
    try {
      await genNutrition({ data: { goal: effectiveGoal as any } });
      toast.success(tr("Plan nutricional semanal creado"));
      qc.invalidateQueries({ queryKey: ["weekly-nutrition"] });
      qc.invalidateQueries({ queryKey: ["profile-nutrition"] });
    } catch (e: any) {
      toast.error(e.message ?? tr("No se pudo generar el plan"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Planes nutricionales")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Menús")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tr("Tu plan semanal adaptado a los entrenamientos y los menús pre-carrera.")}</p>
      </div>

      {/* Generador semanal */}
      <div className="bg-surface border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase">{tr("Plan nutricional semanal")}</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {GOALS.map((g) =>
          <button
            key={g.value}
            type="button"
            onClick={() => setGoal(g.value)}
            className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition ${effectiveGoal === g.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
            
              {g.label}
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground"> {tr("La IA crea desayuno, media mañana, comida, merienda y cena para cada día de la semana según tus entrenamientos, tu perfil y tus preferencias/intolerancias")} 

          {profile.data?.dietary_preferences ? ` (${profile.data.dietary_preferences})` : ""}{tr(". Cada domingo se adapta automáticamente junto con los entrenamientos de la semana siguiente.")} 
        </p>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Generando…" : "Generar plan de esta semana"}
        </button>
      </div>

      {(weeks.data ?? []).map((w: any) => {
        const plan = w.plan as any;
        const isOpen = open === w.id;
        return (
          <div key={w.id} className="bg-surface border rounded-xl overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : w.id)} className="w-full text-left p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary"> {tr("Semana del")} 
                  {format(new Date(`${w.week_start}T12:00:00Z`), "d MMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}
                </p>
                <h3 className="font-display text-xl font-bold uppercase mt-0.5">
                  {GOALS.find((g) => g.value === w.goal)?.label ?? w.goal}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{plan?.dias?.length ?? 0} {tr("días ·")} {plan?.resumen?.slice(0, 90)}</p>
              </div>
              <ChevronRight className={`size-5 shrink-0 transition ${isOpen ? "rotate-90" : ""}`} />
            </button>
            {isOpen &&
            <div className="border-t p-5 space-y-5">
                {(plan?.dias ?? []).map((d: any, i: number) =>
              <div key={i} className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-display text-lg font-bold uppercase capitalize">{d.dia_semana}</p>
                      <span className="text-[11px] text-muted-foreground">{d.fecha} · {d.entrenamiento}</span>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {Math.round(d.objetivo_calorias_kcal)} {tr("kcal ·")} {Math.round(d.objetivo_carbohidratos_g)} {tr("g CHO ·")} {Math.round(d.objetivo_proteinas_g)} {tr("g prot.")} 
                </p>
                    <div className="grid md:grid-cols-2 gap-2">
                      {MEALS.map((m) => {
                    const meal = d[m.key];
                    if (!meal) return null;
                    return (
                      <div key={m.key} className="bg-secondary rounded-lg p-3">
                            <p className="text-[9px] uppercase font-bold text-primary tracking-widest">{m.label}</p>
                            <p className="text-sm font-semibold">{meal.nombre}</p>
                            <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                              {(meal.ingredientes ?? []).map((ing: string, k: number) => <li key={k}>{ing}</li>)}
                            </ul>
                            <p className="mt-1.5 text-xs">{meal.preparacion}</p>
                            <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                              {Math.round(meal.macros?.calorias_kcal ?? 0)} {tr("kcal · CHO")} {Math.round(meal.macros?.carbohidratos_g ?? 0)}{tr("g · P")} {Math.round(meal.macros?.proteinas_g ?? 0)}{tr("g · G")} {Math.round(meal.macros?.grasas_g ?? 0)}{tr("g")} 
                        </p>
                          </div>);

                  })}
                    </div>
                  </div>
              )}
              </div>
            }
          </div>);

      })}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold uppercase">{tr("Menús pre-carrera")}</h2>
        {withMenu.length === 0 ?
        <div className="border-2 border-dashed rounded-xl p-10 text-center">
            <ChefHat className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4"> {tr("Aún no has generado ningún menú de competición.")}
            <br />{tr("Ve a una competición y pulsa \"Generar Menú Pre-Carrera\".")} 
          </p>
            <Link to="/competiciones" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold"> {tr("Ir a Competiciones")} 

          </Link>
          </div> :

        <div className="grid md:grid-cols-2 gap-4">
            {withMenu.map((c) => {
            const m = c.menu_plan as any;
            return (
              <button
                key={c.id}
                onClick={() => navigate({ to: "/competiciones/$id", params: { id: c.id } })}
                className="text-left bg-surface border rounded-xl p-5 hover:border-primary/50 transition-colors">
                
                  <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{format(new Date(c.date), "d MMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}</p>
                  <h3 className="font-display text-xl font-bold uppercase mt-0.5">{c.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{m.dias.length} {tr("días ·")} {c.distance_km} {tr("km")}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {m.dias.slice(0, 4).map((d: any, i: number) =>
                  <div key={i} className="bg-secondary rounded p-2">
                        <p className="text-[9px] uppercase font-bold text-primary">{d.dia_label}</p>
                        <p className="text-xs truncate">{d.desayuno?.nombre}</p>
                      </div>
                  )}
                  </div>
                  <div className="mt-4 text-xs font-semibold text-primary flex items-center justify-between"> {tr("Ver plan completo")} 
                  <ChevronRight className="size-4" />
                  </div>
                </button>);

          })}
          </div>
        }
      </div>
    </div>);

}
