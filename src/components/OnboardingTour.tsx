import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "@tanstack/react-router";
import { User, Bike, Trophy, Dumbbell, HeartPulse, Gauge, X, ArrowRight, Sparkles } from "lucide-react";

interface Step {
  icon: any;
  title: string;
  body: string;
  cta?: { label: string; to?: string };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "¡Bienvenido/a a Sentmenat Bici!",
    body: "Vamos a hacer un tour rápido para que saques el máximo partido a la app. En 6 pasos estarás listo/a para entrenar con IA.",
  },
  {
    icon: User,
    title: "1 · Completa tu Perfil",
    body: "Edad, peso, altura y FTP son la base para que la IA calcule zonas y personalice tus sesiones. También puedes indicar preferencias nutricionales.",
    cta: { label: "Ir a Perfil", to: "/perfil" },
  },
  {
    icon: Bike,
    title: "2 · Conecta Intervals.icu ",
    body: "Sincroniza tus actividades para que la IA analice tu forma real y estime tu FTP automáticamente. También sincronizará tus entrenos.",
    cta: { label: "Configurar Intervals.icu", to: "/perfil" },
  },
  {
    icon: Gauge,
    title: "3 · Test de FTP asistido",
    body: "¿No conoces tu FTP? Te guiamos paso a paso en una prueba de 20 minutos y calculamos automáticamente tus zonas de potencia.",
    cta: { label: "Hacer el test", to: "/ftp-test" },
  },
  {
    icon: Trophy,
    title: "4 · Añade tu Competición objetivo",
    body: "Registra la carrera que preparas. La IA generará el plan de entrenamientos periodizado hasta el evento y el menú.",
    cta: { label: "Nueva competición", to: "/competiciones" },
  },
  {
    icon: Dumbbell,
    title: "5 · Genera Entrenamientos con IA",
    body: "Elige tipo de bici, duración y días de entrenamiento. La IA usa tu FTP, Intervals.icu y feedback previo para construir el bloque.",
    cta: { label: "Ir a Entrenamientos", to: "/entrenamientos" },
  },
  {
    icon: HeartPulse,
    title: "6 · Responde tu Readiness cada mañana",
    body: "Recibirás un Push a la hora que elijas (España peninsular). Indica del 1 al 5 cómo te encuentras y la IA adaptará el entreno del día.",
    cta: { label: "Configurar Readiness", to: "/readiness" },
  },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  const profileQ = useQuery({
    queryKey: ["profile-onboarding", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Abrir al detectar perfil sin onboarding completado
  useEffect(() => {
    if (profileQ.data && !profileQ.data.onboarding_completed_at) {
      const dismissedLocal = typeof window !== "undefined" && localStorage.getItem("sb-onboarding-dismissed");
      if (!dismissedLocal) setOpen(true);
    }
  }, [profileQ.data]);

  const complete = async (skipped = false) => {
    setOpen(false);
    if (!user) return;
    if (!skipped) {
      await supabase
        .from("profiles")
        .upsert(
          { id: user.id, email: user.email ?? "", onboarding_completed_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-onboarding"] });
    } else if (typeof window !== "undefined") {
      localStorage.setItem("sb-onboarding-dismissed", "1");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 hidden md:inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-lg hover:opacity-90"
        title="Volver a ver el tour de bienvenida"
      >
        <Sparkles className="size-3.5" /> Ver tour
      </button>
    );
  }

  const step = STEPS[i];
  const Icon = step.icon;
  const isLast = i === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          className="w-full max-w-md rounded-2xl bg-surface border shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              Paso {i + 1} / {STEPS.length}
            </p>
            <button
              onClick={() => complete(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cerrar tour"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{step.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          </div>

          <div className="p-4 border-t bg-muted/30 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {STEPS.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step.cta?.to && (
                <button
                  type="button"
                  onClick={() => {
                    router.navigate({ to: step.cta!.to! });
                    complete(false);
                  }}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border bg-surface hover:bg-muted"
                >
                  {step.cta.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? complete(false) : setI(i + 1))}
                className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
              >
                {isLast ? "Empezar" : "Siguiente"} <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
