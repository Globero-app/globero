import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { I18nProvider, useI18n } from "@/lib/i18n";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t("notfound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notfound.body")}</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("common.backHome")}
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error?: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(
    typeof error === "string" ? error : "Error desconocido en la aplicación",
  );
  console.error(err);
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    reportLovableError(err, { boundary: "tanstack_root_error_component" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [err.message]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{t("error.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{err.message}</p>

        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >{t("error.retry")}</button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm font-medium">{t("common.home")}</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Globero" },
      { title: "Globero — Gestión del ciclista" },
      { name: "description", content: "Plataforma de IA para ciclistas: entrenamientos, nutrición, competiciones y readiness." },
      { property: "og:title", content: "Globero — Gestión del ciclista" },
      { name: "twitter:title", content: "Globero — Gestión del ciclista" },
      { property: "og:description", content: "Plataforma de IA para ciclistas: entrenamientos, nutrición, competiciones y readiness." },
      { name: "twitter:description", content: "Plataforma de IA para ciclistas: entrenamientos, nutrición, competiciones y readiness." },
      { property: "og:image", content: "https://globero.app/og-image.jpg" },
      { name: "twitter:image", content: "https://globero.app/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Globero" },
      { property: "og:url", content: "https://globero.app/" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Logo de Globero" },
      { name: "twitter:image:alt", content: "Logo de Globero" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },

    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const themeInit = `(function(){try{var t=localStorage.getItem('sb-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
  const previewCacheCleanup = `(function(){try{if(!location.hostname.endsWith('.lovableproject.com')||!('serviceWorker' in navigator)||sessionStorage.getItem('globero-preview-sw-cleaned'))return;sessionStorage.setItem('globero-preview-sw-cleaned','1');Promise.all([navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}),'caches' in window?caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));}):Promise.resolve()]).then(function(){location.reload();});}catch(e){}})();`;
  // La sesión se guarda en el navegador por dominio: globero.app y
  // www.globero.app tienen almacenamientos distintos. Forzamos un único
  // dominio canónico para que la sesión sobreviva a las publicaciones.
  const canonicalHost = `(function(){try{if(location.hostname==='www.globero.app'){location.replace('https://globero.app'+location.pathname+location.search+location.hash);}}catch(e){}})();`;
  return (
    <html lang="es">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: canonicalHost }} />
        <script dangerouslySetInnerHTML={{ __html: previewCacheCleanup }} />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    void import("../lib/pwa-register").then((m) => m.registerPWA());
  }, []);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SplashScreen />
        <Outlet />
        <Toaster position="top-right" richColors />
      </I18nProvider>
    </QueryClientProvider>
  );
}
