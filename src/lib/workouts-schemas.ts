export const StepSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nombre corto del bloque (≤15 chars), ej 'Calentamiento'" },
    description: { type: "string", maxLength: 120, description: "Una instrucción operativa y técnica por bloque; sin prosa accesoria ni explicaciones redundantes" },
    duration_type: { type: "string", enum: ["time", "open"] },
    duration_seconds: { type: "number", description: "Segundos si duration_type=time" },
    target: { type: "string", enum: ["power", "hr", "cadence", "open"] },
    target_low: { type: "number", description: "Vatios, bpm o rpm (mínimo). 0 si open." },
    target_high: { type: "number", description: "Vatios, bpm o rpm (máximo). 0 si open." },
    intensity: { type: "string", enum: ["warmup", "active", "interval", "recovery", "rest", "cooldown"] },
  },
  required: ["name", "description", "duration_type", "target", "target_low", "target_high", "intensity"],
};

export const WorkoutSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nombre del entrenamiento (≤15 chars para FIT)" },
    title: { type: "string", description: "Título largo descriptivo" },
    summary: { type: "string", maxLength: 240, description: "Instrucción técnica de la sesión: objetivo, estructura, base de prescripción y ajustes aplicables; sin prosa accesoria ni explicaciones redundantes" },
    focus: { type: "string", enum: ["resistencia", "intervalos", "fuerza", "mixto"] },
    estimated_tss: { type: "number" },
    scheduled_date: { type: "string", description: "Fecha planificada YYYY-MM-DD (solo si hay competición objetivo, si no cadena vacía)" },
    steps: { type: "array", items: StepSchema, minItems: 3 },
  },
  required: ["name", "title", "summary", "focus", "steps"],
};
