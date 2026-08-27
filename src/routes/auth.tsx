import darkLogo from "@/assets/globero-dark.jpg.asset.json";
import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/app" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const err = hash.get("error_description") || search.get("error_description");
    if (err) {
      setNotice({ kind: "error", text: decodeURIComponent(err) + ". El enlace puede haber caducado; solicita uno nuevo." });
    } else if (search.get("confirmado") === "1" || hash.get("type") === "signup") {
      setNotice({ kind: "ok", text: "Email confirmado correctamente. Ya puedes acceder." });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/app" });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Asegura que el admin principal existe (idempotente)
      await fetch("/api/public/setup-admin", { method: "POST" }).catch(() => {});
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bienvenido");
      navigate({ to: "/app" });
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
          <img src={darkLogo.url} alt="Globero" className="h-20 w-auto object-contain" />
        </div>
        <div className="relative space-y-4 max-w-md">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">Gestión del equipo</p>
          <h1 className="font-display text-5xl font-bold uppercase italic leading-none">
            Entrena.<br />Compite.<br /><span className="text-primary">Recupera.</span>
          </h1>
          <p className="text-sm text-accent-foreground/70 max-w-sm">
            Plataforma de IA para ciclistas: planificación nutricional con IA, análisis de Intervals.icu y planes GPX con waypoints de carbohidratos.
          </p>
        </div>
        <div className="relative text-[10px] uppercase tracking-widest text-accent-foreground/40">
          © {new Date().getFullYear()} Globero
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden mb-8">
            <BrandLogo className="h-14 w-auto" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Accede a tu panel del equipo.</p>
          </div>
          {notice && (
            <div className={`rounded-lg border p-3 text-xs ${notice.kind === "ok" ? "border-primary/40 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
              {notice.text}
            </div>
          )}
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
          <div className="space-y-2 text-center">
            <p className="text-xs text-muted-foreground">
              <Link to="/recuperar" className="text-primary underline">¿Olvidaste tu contraseña?</Link>
            </p>
            <p className="text-xs text-muted-foreground">
              ¿No tienes cuenta? <Link to="/registro" className="text-primary underline">Date de alta</Link>
            </p>
            <p className="text-[11px] text-muted-foreground">
              <Link to="/" className="hover:underline">Inicio</Link> · <Link to="/privacidad" className="hover:underline">Política de Privacidad</Link>
            </p>
          </div>

        </form>
      </div>
    </div>
  );
}
