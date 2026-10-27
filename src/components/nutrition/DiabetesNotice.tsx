import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tr } from "@/lib/i18n";

/** Aviso de seguridad en calculadoras cuando el perfil indica diabetes. */
export function DiabetesNotice() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("has_diabetes").eq("id", u.user.id).maybeSingle();
      setOn(!!(data as any)?.has_diabetes);
    })();
  }, []);
  if (!on) return null;
  return <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">🩸 {tr("Diabetes: comprueba la glucosa antes de salir y cada 30–45 min (o la tendencia del MCG). Lleva siempre CHO rápidos extra (15–20 g) para hipoglucemias. Ajusta insulina o medicación solo con tu equipo médico.")}</p>;
}
