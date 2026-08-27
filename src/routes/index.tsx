import { createFileRoute, Link } from "@tanstack/react-router";
import { getSiteContent, type SiteBlock } from "@/lib/site-content.functions";
import * as Icons from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/")({
  loader: () => getSiteContent({ data: { section: "landing" } }),
  head: () => ({
    meta: [
      { title: "Globero IA — Plataforma de IA para ciclistas" },
      { name: "description", content: "Entrenamientos con IA, nutrición semanal, readiness diario y análisis de tus actividades sincronizadas con Intervals.icu." },
      { property: "og:title", content: "Globero IA — Plataforma de IA para ciclistas" },
      { property: "og:description", content: "Entrenamientos con IA, nutrición semanal, readiness diario y análisis de actividades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://globero.app/og-image.jpg" },
      { name: "twitter:image", content: "https://globero.app/og-image.jpg" },
    ],
  }),
  component: Landing,
  errorComponent: () => <LandingFallback />,
});

function Icon({ name, className }: { name?: string | null; className?: string }) {
  const C = (name && (Icons as any)[name]) || Icons.Sparkles;
  return <C className={className} />;
}

function LandingFallback() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-6 text-center">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Globero IA</h1>
        <p className="mt-2 text-muted-foreground">Plataforma de IA para ciclistas.</p>
        <Link to="/auth" className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Acceder</Link>
      </div>
    </div>
  );
}

function Landing() {
  const blocks = Route.useLoaderData() as SiteBlock[];
  const by = (k: string) => blocks.find((b) => b.block_key === k);
  const hero = by("hero");
  const cta = by("cta");
  const footer = by("footer");
  const features = blocks.filter((b) => b.block_type === "feature");
  const extras = blocks.filter((b) => !["hero", "cta", "footer"].includes(b.block_key) && b.block_type !== "feature");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-surface/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <BrandLogo className="h-9 w-auto" />
          <Link to="/auth" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            {cta?.title || "Acceder"}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="max-w-6xl mx-auto px-4 py-20 lg:py-28 relative">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">{hero?.subtitle}</p>
            <h1 className="mt-3 font-display text-5xl lg:text-7xl font-bold uppercase italic tracking-tight leading-none">
              {hero?.title || "Globero IA"}
            </h1>
            <p className="mt-5 max-w-2xl text-base lg:text-lg text-muted-foreground whitespace-pre-line">{hero?.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                {cta?.title || "Acceder"}
              </Link>
              <Link to="/registro" className="rounded-lg border px-6 py-3 text-sm font-semibold hover:bg-secondary">
                Crear cuenta
              </Link>
            </div>
            {cta?.body && <p className="mt-3 text-xs text-muted-foreground">{cta.body}</p>}
          </div>
        </section>

        {features.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 py-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.id} className="rounded-xl border bg-surface p-6">
                <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Icon name={f.icon} className="size-5" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold uppercase tracking-tight">{f.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{f.body}</p>
              </article>
            ))}
          </section>
        )}

        {extras.length > 0 && (
          <section className="max-w-3xl mx-auto px-4 pb-16 space-y-8">
            {extras.map((b) => (
              <article key={b.id}>
                {b.title && <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{b.title}</h2>}
                {b.subtitle && <p className="text-sm text-primary">{b.subtitle}</p>}
                {b.body && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{b.body}</p>}
              </article>
            ))}
          </section>
        )}
      </main>

      <footer className="border-t bg-surface">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>{footer?.body || "Globero IA"} © {new Date().getFullYear()}</p>
          <Link to="/privacidad" className="hover:text-foreground underline">Política de Privacidad</Link>
        </div>
      </footer>
    </div>
  );
}
