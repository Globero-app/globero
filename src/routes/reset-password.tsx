import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Globero IA" },
      { name: "description", content: "Establece una nueva contraseña para tu cuenta de Globero IA." },
      { property: "og:title", content: "Nueva contraseña — Globero IA" },
      { property: "og:description", content: "Establece una nueva contraseña para tu cuenta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [errorText, setErrorText] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const err = hash.get("error_description") || search.get("error_description");
    const code = hash.get("error_code") || search.get("error_code");
    if (err) {
      setStatus("invalid");
      setErrorText(
        code === "otp_expired" || /expired/i.test(err)
          ? "El enlace de recuperación ha caducado. Solicita uno nuevo."
          : decodeURIComponent(err),
      );
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setStatus("valid");
    });
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setStatus("valid");
      else {
        setStatus("invalid");
        setErrorText("El enlace no es válido o ya ha sido utilizado. Solicita uno nuevo.");
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Mínimo 8 caracteres");
    if (password !== password2) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada");
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err.message || "No se ha podido actualizar");
    } finally {
      setLoading(false);
    }
  };

  const ready = status === "valid";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/"><BrandLogo className="h-12 w-auto" /></Link>
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">
            {status === "checking" && "Comprobando el enlace…"}
            {status === "valid" && "Introduce tu nueva contraseña."}
            {status === "invalid" && errorText}
          </p>
        </div>
        {status === "invalid" && (
          <Link to="/recuperar" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Solicitar nuevo enlace
          </Link>
        )}
        {ready && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contraseña</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Repetir contraseña</label>
              <input type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••"
                className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              {loading ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}
        <p className="text-xs text-muted-foreground text-center">
          <Link to="/auth" className="text-primary underline">Volver al login</Link>
        </p>
      </div>
    </div>
  );
}
