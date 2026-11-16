export type ContinuityWorkout = {
  status: string;
  duration_minutes?: number | null;
  actual_tss?: number | null;
  rpe?: number | null;
  feedback_notes?: string | null;
  completed_at?: string | null;
  plan?: { scheduled_date?: string; title?: string; session_goal?: string; long_ride?: boolean } | null;
};

const madridDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
};

/** Calendar window includes last week and elapsed days before a midweek generation. */
export function continuityWindow(firstDate: string) {
  const first = new Date(`${firstDate}T12:00:00Z`);
  const dow = first.getUTCDay();
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - (dow === 0 ? 6 : dow - 1) - 7);
  const end = new Date(first);
  end.setUTCDate(end.getUTCDate() - 1);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

export function summarizeWorkoutContinuity(rows: ContinuityWorkout[], firstDate: string, today: string) {
  const { since, until } = continuityWindow(firstDate);
  const sessions = rows.flatMap((w) => {
    const date = madridDate(w.plan?.scheduled_date || w.completed_at || "");
    if (!date || date < since || date > until || date > today) return [];
    const done = w.status === "completed";
    const state = done ? "realizado" : w.status === "skipped" ? "omitido"
      : date < today ? "no_realizado" : "sin_confirmar";
    return [{ fecha: date, estado: state, titulo: w.plan?.title?.slice(0, 80) ?? null,
      objetivo: w.plan?.session_goal ?? null, tirada_larga: w.plan?.long_ride === true,
      min_prescritos: w.duration_minutes ?? null,
      tss_real: done ? w.actual_tss ?? null : 0,
      rpe: done ? w.rpe ?? null : null,
      sensaciones: w.feedback_notes?.slice(0, 120) ?? null }];
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { desde: since, hasta: until, sesiones: sessions,
    ultima_realizada: sessions.filter((s) => s.estado === "realizado").at(-1) ?? null };
}

/** Persist only verifiable generation-time references, never reconstruct them from later history. */
export function validateContinuityReferences(
  references: { fecha: string; estado: string }[],
  history: ReturnType<typeof summarizeWorkoutContinuity>,
) {
  return references.map((reference) => {
    const session = history.sesiones.find((s) => s.fecha === reference.fecha && s.estado === reference.estado);
    if (!session || !["realizado", "omitido", "no_realizado"].includes(session.estado)) {
      throw new Error("La explicación cita una sesión anterior no comprobada.");
    }
    return { fecha: session.fecha, estado: session.estado, titulo: session.titulo };
  });
}