// Zwift / TrainingPeaks .zwo workout writer.
// Reference: https://github.com/h4l/zwift-workout-file-reference

export interface ZwoStep {
  name?: string;
  description?: string;
  duration_type: "time" | "open";
  duration_seconds?: number;
  target: "power" | "hr" | "cadence" | "open";
  target_low?: number;
  target_high?: number;
  intensity?: "active" | "rest" | "warmup" | "cooldown" | "recovery" | "interval";
}

export interface ZwoWorkout {
  name: string;
  description?: string;
  author?: string;
  steps: ZwoStep[];
}

// Default %FTP per intensity when step has no power target (fallback)
const INTENSITY_DEFAULT: Record<string, number> = {
  warmup: 0.55,
  cooldown: 0.5,
  rest: 0.45,
  recovery: 0.5,
  active: 0.7,
  interval: 0.95,
};

function esc(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!)
  );
}

function pct(watts: number, ftp: number) {
  return Math.max(0.3, Math.min(1.8, watts / ftp));
}

export function encodeZwo(wk: ZwoWorkout, ftp: number): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<workout_file>`);
  lines.push(`  <author>${esc(wk.author ?? "Globero")}</author>`);
  lines.push(`  <name>${esc(wk.name)}</name>`);
  lines.push(`  <description>${esc(wk.description ?? "")}</description>`);
  lines.push(`  <sportType>bike</sportType>`);
  lines.push(`  <tags/>`);
  lines.push(`  <workout>`);

  for (const s of wk.steps) {
    const dur = Math.max(1, Math.round(s.duration_seconds ?? 60));
    const intensity = s.intensity ?? "active";

    let lowPct: number | null = null;
    let highPct: number | null = null;

    if (s.target === "power" && (s.target_low || s.target_high)) {
      const lo = s.target_low ?? s.target_high ?? 0;
      const hi = s.target_high ?? s.target_low ?? 0;
      lowPct = pct(lo, ftp);
      highPct = pct(hi, ftp);
    } else {
      lowPct = INTENSITY_DEFAULT[intensity] ?? 0.65;
      highPct = lowPct;
    }

    const name = esc((s.name ?? "").slice(0, 60));
    const tag =
      intensity === "warmup" ? "Warmup" :
      intensity === "cooldown" ? "Cooldown" :
      "SteadyState";

    if (tag === "Warmup" || tag === "Cooldown") {
      lines.push(
        `    <${tag} Duration="${dur}" PowerLow="${lowPct.toFixed(2)}" PowerHigh="${highPct.toFixed(2)}">` +
        (name ? `<textevent timeoffset="0" message="${name}"/>` : "") +
        `</${tag}>`
      );
    } else {
      const power = ((lowPct + highPct) / 2).toFixed(2);
      lines.push(
        `    <SteadyState Duration="${dur}" Power="${power}">` +
        (name ? `<textevent timeoffset="0" message="${name}"/>` : "") +
        `</SteadyState>`
      );
    }
  }

  lines.push(`  </workout>`);
  lines.push(`</workout_file>`);
  return lines.join("\n");
}

export function downloadZwo(workout: ZwoWorkout, ftp: number, filename: string) {
  const xml = encodeZwo(workout, ftp);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zwo") ? filename : `${filename}.zwo`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
