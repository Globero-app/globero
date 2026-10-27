import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tr } from "@/lib/i18n";
import { workoutDiabetesWarnings, type DiabetesWarning } from "@/lib/diabetes";

const TEXT: Record<DiabetesWarning, string> = {
  pre: "Antes de empezar: mide la glucosa. Ideal 126–180 mg/dL; si está por debajo de 90 toma 15–30 g de CHO y espera 15 min; si supera 250 con cetonas, no entrenes.",
  hypo: "Riesgo de hipoglucemia: el esfuerzo aeróbico prolongado baja la glucosa. Revisa cada 30 min y no retrases las tomas de CHO.",
  hyper: "Riesgo de hiperglucemia: las series intensas pueden subir la glucosa temporalmente. No corrijas en exceso durante la sesión.",
  reserve: "Lleva siempre 15–20 g de glucosa rápida extra (geles, pastillas o zumo) aparte de la pauta de avituallamiento.",
  post: "Al terminar: mide la glucosa en los primeros 30 min y repite a las 2 h; recupera con CHO y proteína.",
  night: "Tras sesiones largas o intensas el riesgo de hipoglucemia nocturna aumenta: revisa antes de dormir y considera un snack con CHO.",
};

/** Avisos médicos de la sesión según el estado de diabetes del atleta. */
export function WorkoutDiabetesNotice({ minutes, intensityFactor }: { minutes: number; intensityFactor: number }) {
  const [p, setP] = useState<{ has_diabetes?: boolean; diabetes_type?: string | null } | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("has_diabetes,diabetes_type").eq("id", u.user.id).maybeSingle();
      setP(data as any);
    })();
  }, []);
  if (!p?.has_diabetes) return null;
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs space-y-1.5">
      <p className="font-semibold">🩸 {tr("Diabetes: avisos para esta sesión")}</p>
      <ul className="list-disc pl-4 space-y-1">
        {workoutDiabetesWarnings(minutes, intensityFactor, p.diabetes_type).map((k) => <li key={k}>{tr(TEXT[k])}</li>)}
      </ul>
      <p className="text-[10px] text-muted-foreground">{tr("Orientativo. Ajusta insulina o medicación solo con tu equipo médico.")}</p>
    </div>
  );
}
