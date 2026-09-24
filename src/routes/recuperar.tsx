import { tr } from "@/lib/i18n";import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/recuperar")({
  ssr: false,
  head: () => ({
    meta: [
    { title: "Recuperar contraseña — Globero IA" },
    { name: "description", content: "Recupera el acceso a tu cuenta de Globero IA recibiendo un enlace por email." },
    { property: "og:title", content: "Recuperar contraseña — Globero IA" },
    { property: "og:description", content: "Recupera el acceso a tu cuenta de Globero IA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }]

  }),
  component: RecoverPage
});

function RecoverPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.string().trim().email().max(255).safeParse(email);
    if (!parsed.success) return toast.error(tr("Email no válido"));
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast.error(err.message || tr("No se ha podido enviar el email"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/"><BrandLogo className="h-12 w-auto" /></Link>
        {sent ?
        <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight">{tr("Email enviado")}</h1>
            <p className="text-sm text-muted-foreground">{tr("Te hemos enviado un enlace a")} <strong>{email}</strong> {tr("para restablecer tu contraseña.")}</p>
            <Link to="/auth" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{tr("Volver al login")}</Link>
          </div> :

        <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-bold uppercase tracking-tight">{tr("Recuperar contraseña")}</h1>
              <p className="text-sm text-muted-foreground">{tr("Introduce tu email y te enviaremos un enlace.")}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Email")}</label>
              <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={tr("tucorreo@ejemplo.com")}
              className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              {loading ? "Enviando…" : "Enviar"}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              <Link to="/auth" className="text-primary underline">{tr("Volver al login")}</Link>
            </p>
          </form>
        }
      </div>
    </div>);

}
