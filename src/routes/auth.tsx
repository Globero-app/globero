import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bike } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Asegura que el admin principal existe (idempotente)
      await fetch("/api/public/setup-admin", { method: "POST" }).catch(() => {});
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bienvenido");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden lg:flex w-1/2 bg-accent text-accent-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -right-20 -top-20 size-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -left-10 bottom-0 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Bike className="size-7 text-primary" />
            <span className="font-display text-xl font-bold uppercase italic tracking-tight">Sentmenat Bici</span>
          </div>
        </div>
        <div className="relative space-y-4 max-w-md">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">Gestión del equipo</p>
          <h1 className="font-display text-5xl font-bold uppercase italic leading-none">
            Entrena.<br />Compite.<br /><span className="text-primary">Recupera.</span>
          </h1>
          <p className="text-sm text-accent-foreground/70 max-w-sm">
            Plataforma integral para el equipo: planificación nutricional con IA, análisis de Strava y planes GPX con waypoints de carbohidratos.
          </p>
        </div>
        <div className="relative text-[10px] uppercase tracking-widest text-accent-foreground/40">
          © {new Date().getFullYear()} Sentmenat Bici
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Bike className="size-6 text-primary" />
            <span className="font-display text-lg font-bold uppercase italic">Sentmenat Bici</span>
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Accede a tu panel del equipo.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contraseña</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            Sin cuenta? Pide al admin del equipo que te dé de alta desde el Backend.
          </p>
        </form>
      </div>
    </div>
  );
}
