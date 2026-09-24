import { tr } from "@/lib/i18n";import { createFileRoute, Link } from "@tanstack/react-router";
import { getSiteContent, type SiteBlock } from "@/lib/site-content.functions";

export const Route = createFileRoute("/privacidad")({
  loader: () => getSiteContent({ data: { section: "privacy" } }),
  head: () => ({
    meta: [
    { title: "Política de Privacidad — Globero IA" },
    { name: "description", content: "Cómo Globero IA trata los datos personales de sus usuarios: datos recogidos, finalidad, terceros y derechos." },
    { property: "og:title", content: "Política de Privacidad — Globero IA" },
    { property: "og:description", content: "Cómo Globero IA trata los datos personales de sus usuarios." },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary" }]

  }),
  component: PrivacyPage,
  errorComponent: () =>
  <div className="min-h-screen grid place-items-center px-6 text-center text-sm text-muted-foreground"> {tr("No se ha podido cargar la política de privacidad.")} 

  </div>

});

function PrivacyPage() {
  const blocks = Route.useLoaderData() as SiteBlock[];
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-14 space-y-8">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">{tr("← Volver")}</Link>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Política de Privacidad")}</h1>
        {blocks.map((b) =>
        <section key={b.id}>
            {b.title && b.block_key !== "intro" &&
          <h2 className="font-display text-xl font-bold uppercase tracking-tight">{b.title}</h2>
          }
            {b.body && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{b.body}</p>}
          </section>
        )}
      </div>
    </div>);

}
