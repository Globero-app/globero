import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tr } from "@/lib/i18n";
import { glucoseTargets, type DiabetesProfile } from "@/lib/diabetes";

/** Aviso de seguridad en calculadoras cuando el perfil indica diabetes. */
export function DiabetesNotice() {
  const [p, setP] = useState<DiabetesProfile | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("has_diabetes,glucose_target_min,glucose_target_max,glucose_rescue_grams").eq("id", u.user.id).maybeSingle();
      setP(data as any);
    })();
  }, []);
  if (!p?.has_diabetes) return null;
  const g = glucoseTargets(p);
  const msg = tr("Diabetes: comprueba la glucosa antes de salir (objetivo {min}–{max} mg/dL) y cada 30–45 min (o la tendencia del MCG). Lleva siempre CHO rápidos extra ({rescue} g) para hipoglucemias. Ajusta insulina o medicación solo con tu equipo médico.")
    .replace("{min}", String(g.min)).replace("{max}", String(g.max)).replace("{rescue}", String(g.rescue));
  return <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">🩸 {msg}</p>;
}
