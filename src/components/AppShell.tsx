import { ActivityMatchPrompt } from "@/components/ActivityMatchPrompt";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { ActivityFeedbackPrompt } from "@/components/ActivityFeedbackPrompt";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  User,
  Activity,
  Trophy,
  UtensilsCrossed,
  Dumbbell,
  Settings,
  LogOut,
  Menu,
  X,
  CalendarRange,
  HeartPulse,
  TrendingUp,
  Sparkles,
  Bike,
  Plus,
  Minus,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SponsorsFooter } from "@/components/SponsorsFooter";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { InstallAppButton } from "@/components/InstallAppButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useI18n } from "@/lib/i18n";

const HOME = { to: "/app", label: "nav.home", icon: LayoutDashboard } as const;
const TRAINING_NAV = [
  { to: "/entrenamientos", label: "nav.workouts", icon: Dumbbell },
  { to: "/menus", label: "nav.nutrition", icon: UtensilsCrossed },
  { to: "/calendario", label: "nav.calendar", icon: CalendarRange },
  { to: "/readiness", label: "nav.readiness", icon: HeartPulse },
] as const;
const ANALYSIS_NAV = [
  { to: "/progreso", label: "nav.progress", icon: TrendingUp },
  { to: "/actividades", label: "nav.activities", icon: Activity },
] as const;
const GENERAL_NAV = [
  { to: "/competiciones", label: "nav.routes", icon: Trophy },
  { to: "/mi-bici", label: "nav.bike", icon: Bike },
  { to: "/perfil", label: "nav.profile", icon: User },
  { to: "/ajustes", label: "nav.settings", icon: Settings },
] as const;
const MORE_GROUPS = [
  { label: "nav.group.training", items: TRAINING_NAV },
  { label: "nav.group.analysis", items: ANALYSIS_NAV },
] as const;
const BOTTOM_NAV = [HOME, GENERAL_NAV[2], TRAINING_NAV[0], TRAINING_NAV[1]] as const;

function TourButton({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        window.dispatchEvent(new Event("open-onboarding-tour"));
      }}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Sparkles className="size-4 shrink-0" /> {t("nav.tour")}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "nav.group.training": true,
    "nav.group.analysis": false,
  });
  const { t } = useI18n();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const isActive = (to: string) => (to === "/app" ? path === "/app" : path.startsWith(to));

  const NavItem = ({ item, onClick }: { item: (typeof HOME) | (typeof TRAINING_NAV)[number] | (typeof ANALYSIS_NAV)[number] | (typeof GENERAL_NAV)[number]; onClick?: () => void }) => {
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive(item.to)
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {t(item.label)}
      </Link>
    );
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      <NavItem item={HOME} onClick={onClick} />
      {MORE_GROUPS.map((group) => {
        const containsActive = group.items.some((item) => isActive(item.to));
        const isOpen = openGroups[group.label] || containsActive;
        return (
          <div key={group.label} className="pt-3 first:pt-1">
            <button
              type="button"
              onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !isOpen }))}
              className="flex w-full items-center gap-2 px-4 pb-1 text-left text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground"
              aria-expanded={isOpen}
            >
              {isOpen ? <Minus className="size-3" /> : <Plus className="size-3" />}
              {t(group.label)}
            </button>
            {isOpen && group.items.map((item) => <NavItem key={item.to} item={item} onClick={onClick} />)}
          </div>
        );
      })}
      <div className="pt-3">
        {GENERAL_NAV.map((item) => <NavItem key={item.to} item={item} onClick={onClick} />)}
      </div>
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
          {t("nav.backend")}
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
          <Link to="/app" className="block">
            <div className="font-display text-2xl font-bold uppercase tracking-tight">
              <span className="text-primary italic">Globero</span>
              <span className="ml-1.5 text-foreground/70">IA</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
              {t("brand.tagline")}
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
          <div className="pt-2 mt-2 border-t border-border/50">
            <TourButton />
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
              <p className="text-[10px] text-muted-foreground">{isAdmin ? t("role.admin") : t("role.cyclist")}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-destructive px-3 py-2 rounded-md hover:bg-secondary"
          >
            <LogOut className="size-3.5" /> {t("nav.signout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <Link to="/app" className="block">
          <span className="font-display text-lg font-bold uppercase tracking-tight">
            <span className="text-primary italic">Globero</span>
            <span className="ml-1.5 text-foreground/70">IA</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-md hover:bg-secondary" aria-label={t("nav.menu")}>
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-display font-bold uppercase">{t("nav.menu")}</span>
            <button onClick={() => setMobileOpen(false)} className="p-2">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <NavLinks onClick={() => setMobileOpen(false)} />
            <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
              <TourButton onClick={() => setMobileOpen(false)} />
              <InstallAppButton />
              <ThemeToggle />
            </div>

            <button
              onClick={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" /> {t("nav.signout")}
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

      <ActivityMatchPrompt />
      <ActivityFeedbackPrompt />

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t flex items-center justify-around px-2 py-2">
        {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md ${
              isActive(to) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium">{t(label)}</span>
          </Link>
        ))}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-muted-foreground"
          aria-label={t("nav.more")}
        >
          <Menu className="size-5" />
          <span className="text-[10px] font-medium">{t("nav.more")}</span>
        </button>
      </nav>

      <OnboardingTour />
      <AnnouncementPopup />
    </div>
  );
}
