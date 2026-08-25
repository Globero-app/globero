/** Import/export de planes de entrenamiento (CSV y ZWO). Módulo client-safe. */

export type PlanRow = {
  scheduled_date: string;
  title: string;
  bike_type: string;
  duration_minutes: number;
  estimated_tss: number | null;
  summary: string;
};

export type ImportStep = {
  name: string;
  duration_seconds: number;
  low_pct: number;
  high_pct: number;
  intensity: string;
};

export type ImportSession = PlanRow & { steps?: ImportStep[] };

/* ------------------------------ CSV ------------------------------ */

const HEADERS = ["fecha", "titulo", "tipo_bici", "duracion_min", "tss", "resumen"];

function csvEscape(v: string) {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildPlanCsv(workouts: any[]): string {
  const lines = [HEADERS.join(",")];
  for (const w of workouts) {
    const plan = w.plan ?? {};
    lines.push(
      [
        plan.scheduled_date ?? "",
        plan.title ?? plan.name ?? "Entrenamiento",
        w.bike_type ?? "carretera",
        String(w.duration_minutes ?? ""),
        String(w.planned_tss ?? plan.estimated_tss ?? ""),
        (plan.summary ?? "").replace(/\s+/g, " ").trim(),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === "," || c === ";") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parsePlanCsv(text: string): ImportSession[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => h.startsWith("fecha") || h.startsWith("date"));
  const rows = hasHeader ? lines.slice(1) : lines;
  const out: ImportSession[] = [];
  for (const line of rows) {
    const c = splitCsvLine(line);
    const date = (c[0] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const mins = Number(c[3]);
    const tss = Number(c[4]);
    out.push({
      scheduled_date: date,
      title: c[1] || "Entrenamiento importado",
      bike_type: (c[2] || "carretera").toLowerCase(),
      duration_minutes: Number.isFinite(mins) && mins > 0 ? Math.round(mins) : 60,
      estimated_tss: Number.isFinite(tss) && tss > 0 ? Math.round(tss) : null,
      summary: c[5] ?? "",
    });
  }
  return out;
}

/* ------------------------------ ZWO ------------------------------ */

function attr(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`${name}="([^"]+)"`, "i"));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function textTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim() : "";
}

/** Convierte un archivo .zwo en una sesión importable (potencias en % de FTP). */
export function parseZwo(xml: string, fallbackName: string): ImportSession | null {
  const body = xml.match(/<workout>([\s\S]*?)<\/workout>/i)?.[1];
  if (!body) return null;
  const steps: ImportStep[] = [];
  const re = /<(Warmup|Cooldown|SteadyState|Ramp|IntervalsT|FreeRide)\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const kind = m[1];
    const raw = m[0];
    const intensity =
      kind === "Warmup" ? "warmup" : kind === "Cooldown" ? "cooldown" : kind === "IntervalsT" ? "interval" : "active";

    if (kind === "IntervalsT") {
      const reps = attr(raw, "Repeat") ?? 1;
      const onD = attr(raw, "OnDuration") ?? 60;
      const offD = attr(raw, "OffDuration") ?? 60;
      const onP = attr(raw, "OnPower") ?? 1;
      const offP = attr(raw, "OffPower") ?? 0.5;
      for (let i = 0; i < Math.min(reps, 30); i++) {
        steps.push({ name: `Intervalo ${i + 1}`, duration_seconds: Math.round(onD), low_pct: onP, high_pct: onP, intensity: "interval" });
        steps.push({ name: "Recuperacion", duration_seconds: Math.round(offD), low_pct: offP, high_pct: offP, intensity: "recovery" });
      }
      continue;
    }

    const dur = attr(raw, "Duration") ?? 60;
    const p = attr(raw, "Power");
    const lo = attr(raw, "PowerLow") ?? p ?? 0.6;
    const hi = attr(raw, "PowerHigh") ?? p ?? lo;
    steps.push({
      name: raw.match(/message="([^"]+)"/i)?.[1] ?? intensity,
      duration_seconds: Math.round(dur),
      low_pct: lo,
      high_pct: hi,
      intensity: kind === "FreeRide" ? "active" : intensity,
    });
  }
  if (!steps.length) return null;
  const totalSec = steps.reduce((a, s) => a + s.duration_seconds, 0);
  return {
    scheduled_date: new Date().toISOString().slice(0, 10),
    title: textTag(xml, "name") || fallbackName,
    bike_type: "carretera",
    duration_minutes: Math.max(10, Math.round(totalSec / 60)),
    estimated_tss: null,
    summary: textTag(xml, "description").slice(0, 400),
    steps,
  };
}

export function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
