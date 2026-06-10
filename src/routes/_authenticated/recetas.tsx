import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { ChefHat, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/recetas")({
  component: RecetasPage,
});

function RecetasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const comps = useQuery({
    queryKey: ["competitions_menu", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("competitions").select("id,name,date,menu_plan,distance_km").eq("user_id", user!.id).order("date");
      return data ?? [];
    },
    enabled: !!user,
  });

  const withMenu = (comps.data ?? []).filter((c) => c.menu_plan);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Planes nutricionales</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Recetas</h1>
        <p className="text-sm text-muted-foreground mt-1">Los menús generados por competición.</p>
      </div>

      {withMenu.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <ChefHat className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Aún no has generado ningún menú.<br />Ve a una competición y pulsa "Generar Menú Pre-Carrera".
          </p>
          <Link to="/competiciones" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
            Ir a Competiciones
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {withMenu.map((c) => {
            const m = c.menu_plan as any;
            return (
              <button
                key={c.id}
                onClick={() => navigate({ to: "/competiciones/$id", params: { id: c.id } })}
                className="text-left bg-surface border rounded-xl p-5 hover:border-primary/50 transition-colors"
              >
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{format(new Date(c.date), "d MMM yyyy", { locale: es })}</p>
                <h3 className="font-display text-xl font-bold uppercase mt-0.5">{c.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{m.dias.length} días · {c.distance_km} km</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {m.dias.slice(0, 4).map((d: any, i: number) => (
                    <div key={i} className="bg-secondary rounded p-2">
                      <p className="text-[9px] uppercase font-bold text-primary">{d.dia_label}</p>
                      <p className="text-xs truncate">{d.desayuno?.nombre}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-xs font-semibold text-primary flex items-center justify-between">
                  Ver plan completo <ChevronRight className="size-4" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
