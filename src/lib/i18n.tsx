import { Fragment, createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PHRASES } from "./i18n-phrases";

export const LANGS = [
  { code: "es", label: "Castellano" },
  { code: "ca", label: "Català" },
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
const CODES = LANGS.map((l) => l.code) as readonly string[];
const KEY = "globero-lang";

type Dict = Record<string, string>;
const es: Dict = {
  "nav.home": "Inicio", "nav.profile": "Perfil", "nav.workouts": "Entrenamientos", "nav.nutrition": "Nutrición",
  "nav.activities": "Actividades", "nav.routes": "Rutas", "nav.progress": "Progreso", "nav.weekly": "Resumen semanal",
  "nav.calendar": "Calendario", "nav.readiness": "Readiness", "nav.bike": "Mi Bici", "nav.settings": "Ajustes", "nav.backend": "Backend",
  "nav.tour": "Ver Tour", "nav.menu": "Menú", "nav.more": "Más", "nav.signout": "Cerrar sesión", "nav.group.training": "Entrenamiento", "nav.group.analysis": "Análisis",
  "role.admin": "Administrador", "role.cyclist": "Ciclista", "brand.tagline": "Plataforma de IA para ciclistas",
  "lang.label": "Idioma", "landing.access": "Acceder", "landing.signup": "Crear cuenta", "landing.privacy": "Política de Privacidad",
  "notfound.title": "Página no encontrada", "notfound.body": "La ruta solicitada no existe.", "common.backHome": "Volver al inicio",
  "error.title": "Algo ha fallado", "error.retry": "Reintentar", "common.home": "Inicio",
  "workouts.eyebrow": "Plan personalizado", "workouts.yours": "Tus entrenamientos", "workouts.recalc": "Recalcular semana",
  "workouts.recalcing": "Recalculando…", "workouts.tabWeek": "Esta semana", "workouts.tabNext": "Próximas", "workouts.tabHistory": "Historial",
  "workouts.none": "Aún no has generado ningún entrenamiento.",
};
const ca: Dict = {
  "nav.home": "Inici", "nav.profile": "Perfil", "nav.workouts": "Entrenaments", "nav.nutrition": "Nutrició",
  "nav.activities": "Activitats", "nav.routes": "Rutes", "nav.progress": "Progrés", "nav.weekly": "Resum setmanal",
  "nav.calendar": "Calendari", "nav.readiness": "Readiness", "nav.bike": "La meva bici", "nav.settings": "Configuració", "nav.backend": "Backend",
  "nav.tour": "Veure el tour", "nav.menu": "Menú", "nav.more": "Més", "nav.signout": "Tancar sessió", "nav.group.training": "Entrenament", "nav.group.analysis": "Anàlisi",
  "role.admin": "Administrador", "role.cyclist": "Ciclista", "brand.tagline": "Plataforma d'IA per a ciclistes",
  "lang.label": "Idioma", "landing.access": "Accedir", "landing.signup": "Crear compte", "landing.privacy": "Política de privadesa",
  "notfound.title": "Pàgina no trobada", "notfound.body": "La ruta sol·licitada no existeix.", "common.backHome": "Tornar a l'inici",
  "error.title": "Alguna cosa ha fallat", "error.retry": "Tornar-ho a provar", "common.home": "Inici",
  "workouts.eyebrow": "Pla personalitzat", "workouts.yours": "Els teus entrenaments", "workouts.recalc": "Recalcular setmana",
  "workouts.recalcing": "Recalculant…", "workouts.tabWeek": "Aquesta setmana", "workouts.tabNext": "Properes", "workouts.tabHistory": "Historial",
  "workouts.none": "Encara no has generat cap entrenament.",
};
const fr: Dict = {
  "nav.home": "Accueil", "nav.profile": "Profil", "nav.workouts": "Entraînements", "nav.nutrition": "Nutrition",
  "nav.activities": "Activités", "nav.routes": "Parcours", "nav.progress": "Progrès", "nav.weekly": "Bilan hebdo",
  "nav.calendar": "Calendrier", "nav.readiness": "Forme du jour", "nav.bike": "Mon vélo", "nav.settings": "Paramètres", "nav.backend": "Administration",
  "nav.tour": "Voir la visite", "nav.menu": "Menu", "nav.more": "Plus", "nav.signout": "Se déconnecter", "nav.group.training": "Entraînement", "nav.group.analysis": "Analyse",
  "role.admin": "Administrateur", "role.cyclist": "Cycliste", "brand.tagline": "Plateforme d'IA pour cyclistes",
  "lang.label": "Langue", "landing.access": "Se connecter", "landing.signup": "Créer un compte", "landing.privacy": "Politique de confidentialité",
  "notfound.title": "Page introuvable", "notfound.body": "La page demandée n'existe pas.", "common.backHome": "Retour à l'accueil",
  "error.title": "Une erreur est survenue", "error.retry": "Réessayer", "common.home": "Accueil",
  "workouts.eyebrow": "Plan personnalisé", "workouts.yours": "Tes entraînements", "workouts.recalc": "Recalculer la semaine",
  "workouts.recalcing": "Recalcul…", "workouts.tabWeek": "Cette semaine", "workouts.tabNext": "À venir", "workouts.tabHistory": "Historique",
  "workouts.none": "Tu n'as encore généré aucun entraînement.",
};
const en: Dict = {
  "nav.home": "Home", "nav.profile": "Profile", "nav.workouts": "Workouts", "nav.nutrition": "Nutrition",
  "nav.activities": "Activities", "nav.routes": "Routes", "nav.progress": "Progress", "nav.weekly": "Weekly summary",
  "nav.calendar": "Calendar", "nav.readiness": "Readiness", "nav.bike": "My Bike", "nav.settings": "Settings", "nav.backend": "Admin",
  "nav.tour": "Take the tour", "nav.menu": "Menu", "nav.more": "More", "nav.signout": "Sign out", "nav.group.training": "Training", "nav.group.analysis": "Analysis",
  "role.admin": "Administrator", "role.cyclist": "Cyclist", "brand.tagline": "AI platform for cyclists",
  "lang.label": "Language", "landing.access": "Sign in", "landing.signup": "Create account", "landing.privacy": "Privacy Policy",
  "notfound.title": "Page not found", "notfound.body": "The requested page does not exist.", "common.backHome": "Back to home",
  "error.title": "Something went wrong", "error.retry": "Try again", "common.home": "Home",
  "workouts.eyebrow": "Personal plan", "workouts.yours": "Your workouts", "workouts.recalc": "Recalculate week",
  "workouts.recalcing": "Recalculating…", "workouts.tabWeek": "This week", "workouts.tabNext": "Upcoming", "workouts.tabHistory": "History",
  "workouts.none": "You haven't generated any workouts yet.",
};
const de: Dict = {
  "nav.home": "Start", "nav.profile": "Profil", "nav.workouts": "Trainings", "nav.nutrition": "Ernährung",
  "nav.activities": "Aktivitäten", "nav.routes": "Routen", "nav.progress": "Fortschritt", "nav.weekly": "Wochenübersicht",
  "nav.calendar": "Kalender", "nav.readiness": "Tagesform", "nav.bike": "Mein Rad", "nav.settings": "Einstellungen", "nav.backend": "Verwaltung",
  "nav.tour": "Tour ansehen", "nav.menu": "Menü", "nav.more": "Mehr", "nav.signout": "Abmelden", "nav.group.training": "Training", "nav.group.analysis": "Analyse",
  "role.admin": "Administrator", "role.cyclist": "Radfahrer", "brand.tagline": "KI-Plattform für Radfahrer",
  "lang.label": "Sprache", "landing.access": "Anmelden", "landing.signup": "Konto erstellen", "landing.privacy": "Datenschutzerklärung",
  "notfound.title": "Seite nicht gefunden", "notfound.body": "Die angeforderte Seite existiert nicht.", "common.backHome": "Zur Startseite",
  "error.title": "Etwas ist schiefgelaufen", "error.retry": "Erneut versuchen", "common.home": "Start",
  "workouts.eyebrow": "Persönlicher Plan", "workouts.yours": "Deine Trainings", "workouts.recalc": "Woche neu berechnen",
  "workouts.recalcing": "Wird berechnet…", "workouts.tabWeek": "Diese Woche", "workouts.tabNext": "Demnächst", "workouts.tabHistory": "Verlauf",
  "workouts.none": "Du hast noch keine Trainings erstellt.",
};
const DICTS: Record<Lang, Dict> = { es, ca, fr, en, de };

export function translate(lang: Lang, key: string): string {
  return DICTS[lang]?.[key] ?? es[key] ?? key;
}

let currentLang: Lang = "es";
const IDX: Record<Lang, number> = { es: -1, ca: 0, fr: 1, en: 2, de: 3 };
/** Traduce una frase original en castellano al idioma activo. */
export function tr(text: string): string {
  const i = IDX[currentLang];
  return i < 0 ? text : PHRASES[text]?.[i] ?? text;
}

export function activeLang(): Lang {
  return currentLang;
}

export function localeCode(lang: Lang = currentLang): string {
  return ({ es: "es-ES", ca: "ca-ES", fr: "fr-FR", en: "en-GB", de: "de-DE" } as const)[lang];
}

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }
const I18nCtx = createContext<Ctx>({ lang: "es", setLang: () => {}, t: (k) => translate("es", k) });

function detect(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s && CODES.includes(s)) return s as Lang;
    const n = (navigator.language || "es").slice(0, 2).toLowerCase();
    if (CODES.includes(n)) return n as Lang;
  } catch { /* ignore */ }
  return "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  currentLang = lang;

  useEffect(() => {
    setLangState(detect());
    const load = async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("language").eq("id", uid).maybeSingle();
      const l = (data as any)?.language;
      if (l && CODES.includes(l)) { setLangState(l); localStorage.setItem(KEY, l); }
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") void load(); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    void supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (uid) void supabase.from("profiles").update({ language: l } as any).eq("id", uid);
    });
  }, []);

  const t = useCallback((k: string) => translate(lang, k), [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}><Fragment key={lang}>{children}</Fragment></I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      aria-label={t("lang.label")}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`rounded-md border bg-surface px-2 py-1.5 text-xs font-medium ${className}`}
    >
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
