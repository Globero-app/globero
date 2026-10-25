import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { trialWarningDays } from "@/lib/subscription-access";

export function TrialExpiryNotice({ userId }: { userId?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const { data } = useQuery({
    queryKey: ["trial-expiry-notice", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("profiles")
        .select("trial_ends_at,subscription_status,admin_grant_active,deactivated_at")
        .eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });
  const days = now ? trialWarningDays(data ?? null, now) : null;
  if (days === null) return null;
  return <section role="status" aria-label="Fin de prueba gratuita" className="mb-6 flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">Tu prueba gratuita termina en {days} {days === 1 ? "día" : "días"}.</p>
        <p className="text-sm text-muted-foreground">Después podrás seguir accediendo a la app. Necesitarás una suscripción para crear entrenamientos y menús.</p>
      </div>
    </div>
    <Button asChild className="self-start shrink-0"><Link to="/perfil" search={{ tab: "subscription" }}>Ver suscripción</Link></Button>
  </section>;
}