import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/registro")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Crear cuenta — Globero IA" },
      { name: "description", content: "Date de alta en Globero IA y accede a entrenamientos con IA, nutrición y readiness." },
      { property: "og:title", content: "Crear cuenta — Globero IA" },
      { property: "og:description", content: "Date de alta en Globero IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignUpPage,
});

const schema = z.object({
  fullName: z.string().trim().min(3, "Indica nombre y apellido").max(100),
  email: z.string().trim().email("Email no válido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

function SignUpPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [resending, setResending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ fullName, email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0]!.message);
    if (password !== password2) return toast.error("Las contraseñas no coinciden");
    if (!accept) return toast.error("Debes aceptar la política de privacidad");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmado=1`,
          data: { full_name: parsed.data.fullName },
        },
      });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "No se ha podido crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth?confirmado=1` },
      });
      if (error) throw error;
      toast.success("Email de confirmación reenviado");
    } catch (err: any) {
      toast.error(err.message || "No se ha podido reenviar el email");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/"><BrandLogo className="h-12 w-auto" /></Link>
        {done ? (
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Revisa tu correo</h1>
            <p className="text-sm text-muted-foreground">
              Te hemos enviado un email a <strong>{email}</strong> para confirmar el alta. Al pulsar el enlace tu cuenta quedará activada y podrás acceder a la aplicación.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/auth" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Ir al login</Link>
              <button type="button" onClick={resend} disabled={resending} className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
                {resending ? "Reenviando…" : "Reenviar email"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Crear cuenta</h1>
              <p className="text-sm text-muted-foreground">Date de alta para acceder a Globero IA.</p>
            </div>
            <div className="space-y-3">
              <Field label="Nombre y Apellido" value={fullName} onChange={setFullName} placeholder="Miguel García" />
              <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="tucorreo@ejemplo.com" />
              <Field label="Contraseña" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
              <Field label="Repetir contraseña" type="password" value={password2} onChange={setPassword2} placeholder="••••••••" />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5" />
              <span>He leído y acepto la <Link to="/privacidad" className="text-primary underline">Política de Privacidad</Link>.</span>
            </label>
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              {loading ? "Creando…" : "Dar de alta"}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              ¿Ya tienes cuenta? <Link to="/auth" className="text-primary underline">Inicia sesión</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type={type} required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full px-4 py-2.5 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
