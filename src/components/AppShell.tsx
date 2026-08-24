import { StravaMatchPrompt } from "@/components/StravaMatchPrompt";
import { ActivityFeedbackPrompt } from "@/components/ActivityFeedbackPrompt";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAppConfig } from "@/lib/use-app-config";
import {
  LayoutDashboard, User, Activity, Trophy, UtensilsCrossed, Dumbbell,
  Settings, LogOut, Menu, X, CalendarRange, HeartPulse,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SponsorsFooter } from "@/components/SponsorsFooter";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { InstallAppButton } from "@/components/InstallAppButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingTour } from "@/components/OnboardingTour";


const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/perfil", label: "Perfil", icon: User },
  { to: "/calendario", label: "Calendario", icon: CalendarRange },
  { to: "/actividades", label: "Actividades", icon: Activity },
  { to: "/entrenamientos", label: "Entrenamientos", icon: Dumbbell },
  { to: "/competiciones", label: "Competiciones", icon: Trophy },
  { to: "/menus", label: "Menús", icon: UtensilsCrossed },
  { to: "/readiness", label: "Readiness", icon: HeartPulse },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const config = useAppConfig().data;
  const router = useRouter();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const isActive = (to: string) =>
    to === "/" ? path === "/" : path.startsWith(to);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onClick}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive(to)
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
      {isAdmin && (
        <Link
          to="/backend"
          onClick={onClick}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive("/backend")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Settings className="size-4 shrink-0" />
          Backend
        </Link>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <NetworkStatusBanner />
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r bg-surface flex-col">
        <div className="px-6 py-6 border-b">
          <Link to="/" className="block">
            <div className="font-display text-2xl font-bold uppercase tracking-tight">
              <span className="text-primary italic">{config?.team_name?.split(" ")[0] ?? "Sentmenat"}</span>
              <span className="ml-1.5 text-foreground/70">{config?.team_name?.split(" ").slice(1).join(" ") ?? "Bici"}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">Gestión del equipo</div>
          </Link>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
          <div className="pt-2 mt-2 border-t border-border/50">
            <InstallAppButton />
          </div>
        </nav>
        <div className="border-t p-4 space-y-3">
          <ThemeToggle />
          <div className="flex items-center gap-3 px-2">
            <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
              {user?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground">{isAdmin ? "Administrador" : "Ciclista"}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-destructive px-3 py-2 rounded-md hover:bg-secondary">
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </div>

      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-display font-bold uppercase tracking-tight">
          <span className="text-primary italic">{config?.team_name?.split(" ")[0] ?? "Sentmenat"}</span>
          <span className="ml-1.5">{config?.team_name?.split(" ").slice(1).join(" ") ?? "Bici"}</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-md hover:bg-secondary" aria-label="Menú">
            <Menu className="size-5" />
          </button>
        </div>
      </header>


      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-display font-bold uppercase">Menú</span>
            <button onClick={() => setMobileOpen(false)} className="p-2"><X className="size-5" /></button>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <NavLinks onClick={() => setMobileOpen(false)} />
            <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
              <InstallAppButton />
              <ThemeToggle />
            </div>

            <button onClick={() => { setMobileOpen(false); handleSignOut(); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10">
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={path}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        <SponsorsFooter />
      </main>

      <StravaMatchPrompt />
      <ActivityFeedbackPrompt />


      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t flex items-center justify-around px-2 py-2">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md ${
              isActive(to) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
      </nav>

      <OnboardingTour />
    </div>
  );
}
