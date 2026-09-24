import type { UserLang } from "./user-lang.server";

type Values = Partial<Record<UserLang, string>> & { es: string };

const TEXT = {
  session: { es: "Sesión", ca: "Sessió", fr: "Séance", en: "Session", de: "Einheit" },
  today: { es: "Hoy", ca: "Avui", fr: "Aujourd'hui", en: "Today", de: "Heute" },
  restDay: { es: "día de descanso (sin sesión planificada).", ca: "dia de descans (sense sessió planificada).", fr: "jour de repos (aucune séance planifiée).", en: "rest day (no session planned).", de: "Ruhetag (keine Einheit geplant)." },
  fitness: { es: "Forma", ca: "Forma", fr: "Forme", en: "Form", de: "Form" },
  readinessToday: { es: "Readiness de hoy", ca: "Readiness d'avui", fr: "Forme du jour", en: "Today's readiness", de: "Heutige Tagesform" },
  notRecorded: { es: "sin registrar", ca: "sense registrar", fr: "non renseignée", en: "not recorded", de: "nicht erfasst" },
  advice: { es: "Consejo", ca: "Consell", fr: "Conseil", en: "Advice", de: "Tipp" },
  rest: { es: "Descanso", ca: "Descans", fr: "Repos", en: "Rest", de: "Erholung" },
  dailySummary: { es: "Resumen de hoy", ca: "Resum d'avui", fr: "Résumé du jour", en: "Today's summary", de: "Heutige Übersicht" },
  workoutReport: { es: "Informe del entrenamiento", ca: "Informe de l'entrenament", fr: "Rapport d'entraînement", en: "Workout report", de: "Trainingsbericht" },
  reportReady: { es: "Informe listo", ca: "Informe preparat", fr: "Rapport prêt", en: "Report ready", de: "Bericht fertig" },
  health: { es: "Salud", ca: "Salut", fr: "Santé", en: "Health", de: "Gesundheit" },
  sleep: { es: "sueño", ca: "son", fr: "sommeil", en: "sleep", de: "Schlaf" },
  fatigue: { es: "fatiga", ca: "fatiga", fr: "fatigue", en: "fatigue", de: "Ermüdung" },
} satisfies Record<string, Values>;

export function competitionCountdown(lang: UserLang, name: string, days: number): string {
  const values: Record<UserLang, string> = {
    es: `${name}: faltan ${days} días.`, ca: `${name}: falten ${days} dies.`, fr: `${name} : dans ${days} jours.`,
    en: `${name}: ${days} days to go.`, de: `${name}: noch ${days} Tage.`,
  };
  return values[lang];
}

export function serverText(lang: UserLang, key: keyof typeof TEXT): string {
  return TEXT[key][lang] ?? TEXT[key].es;
}

export function reportPushBody(lang: UserLang, title: string): string {
  const values: Record<UserLang, string> = {
    es: `Ya puedes ver el análisis de "${title}" en Entrenamientos.`,
    ca: `Ja pots veure l'anàlisi de "${title}" a Entrenaments.`,
    fr: `Tu peux consulter l'analyse de « ${title} » dans Entraînements.`,
    en: `You can now view the analysis of “${title}” in Workouts.`,
    de: `Du kannst die Analyse von „${title}“ jetzt unter Trainings ansehen.`,
  };
  return values[lang];
}

export function noMetricsReport(lang: UserLang, mins: number, km: number): string {
  const distance = km > 1 ? `, ${km.toFixed(1)} km` : "";
  const values: Record<UserLang, string> = {
    es: `Sesión registrada: ${mins} min${distance}. Sin datos de potencia ni frecuencia cardíaca no se genera análisis detallado.`,
    ca: `Sessió registrada: ${mins} min${distance}. Sense dades de potència ni freqüència cardíaca no es genera una anàlisi detallada.`,
    fr: `Séance enregistrée : ${mins} min${distance}. Sans données de puissance ni de fréquence cardiaque, aucune analyse détaillée n'est générée.`,
    en: `Session recorded: ${mins} min${distance}. A detailed analysis cannot be generated without power or heart-rate data.`,
    de: `Einheit erfasst: ${mins} Min.${distance}. Ohne Leistungs- oder Herzfrequenzdaten wird keine detaillierte Analyse erstellt.`,
  };
  return values[lang];
}