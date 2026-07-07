// Hidratación & sodio ajustados por clima previsto
// Base: ACSM/ISSN + práctica en resistencia. Ajustes por temperatura y humedad.

export interface WeatherDay {
  date: string;                 // YYYY-MM-DD
  temp_max_c: number;
  temp_min_c: number;
  apparent_max_c: number;
  humidity_pct: number;         // media diaria
  wind_kmh: number;
  precip_mm: number;
  weather_code: number;
  summary: string;              // p.ej. "Calor moderado y seco"
}

export interface HydrationPlan {
  fluid_ml_per_hour: number;
  sodium_mg_per_hour: number;
  total_fluid_ml: number;
  total_sodium_mg: number;
  bottles_500ml: number;
  heat_risk: "bajo" | "moderado" | "alto" | "extremo";
  recommendations: string[];
}

const WCODE: Record<number, string> = {
  0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Niebla", 48: "Niebla helada",
  51: "Llovizna débil", 53: "Llovizna", 55: "Llovizna intensa",
  61: "Lluvia débil", 63: "Lluvia", 65: "Lluvia intensa",
  71: "Nieve débil", 73: "Nieve", 75: "Nieve intensa",
  80: "Chubascos", 81: "Chubascos fuertes", 82: "Chubascos violentos",
  95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta con granizo intenso",
};

export function describeWeather(w: WeatherDay): string {
  const cond = WCODE[w.weather_code] ?? "Condiciones variables";
  const heat =
    w.apparent_max_c >= 32 ? "calor extremo" :
    w.apparent_max_c >= 27 ? "calor alto" :
    w.apparent_max_c >= 22 ? "calor moderado" :
    w.apparent_max_c >= 15 ? "templado" :
    w.apparent_max_c >= 8 ? "fresco" : "frío";
  const hum = w.humidity_pct >= 75 ? "muy húmedo" : w.humidity_pct >= 60 ? "húmedo" : "seco";
  return `${cond} · ${heat} · ${hum}`;
}

export function heatRisk(apparentC: number, humidity: number): HydrationPlan["heat_risk"] {
  // Índice simplificado
  const idx = apparentC + Math.max(0, humidity - 50) * 0.08;
  if (idx >= 34) return "extremo";
  if (idx >= 29) return "alto";
  if (idx >= 23) return "moderado";
  return "bajo";
}

/**
 * Plan de hidratación basado en clima previsto.
 * - Base 500 ml/h a 15 °C.
 * - +60 ml/h por cada °C por encima de 15.
 * - +100 ml/h si humedad > 70%.
 * - Rango 400–1400 ml/h.
 * Sodio:
 * - Base 400 mg/L a 20 °C.
 * - +40 mg/L por °C >20 y +200 mg/L si humedad > 70%.
 * - Convertido a mg/h con el fluido correspondiente.
 */
export function planHydration(
  weight_kg: number,
  durationH: number,
  weather: WeatherDay
): HydrationPlan {
  const t = weather.apparent_max_c;
  const h = weather.humidity_pct;
  const baseFluid = 500 + Math.max(0, t - 15) * 60 + (h > 70 ? 100 : 0);
  // Escala ligera por peso (ref 70 kg)
  const scale = Math.max(0.85, Math.min(1.2, weight_kg / 70));
  const fluid = Math.max(400, Math.min(1400, Math.round((baseFluid * scale) / 50) * 50));

  const sodiumPerL = 400 + Math.max(0, t - 20) * 40 + (h > 70 ? 200 : 0);
  const sodium = Math.round(((sodiumPerL * fluid) / 1000) / 50) * 50;

  const risk = heatRisk(t, h);
  const totalFluid = Math.round(fluid * durationH);
  const totalSodium = Math.round(sodium * durationH);

  const recs: string[] = [];
  if (risk === "extremo" || risk === "alto") {
    recs.push("Pre-hidratar 500 ml con electrolitos 90-60 min antes de salir.");
    recs.push("Beber a sorbos cada 10-15 min, no esperar a tener sed.");
    recs.push("Refrescar cabeza/nuca en avituallamientos; considera manguitos mojados.");
  }
  if (risk === "moderado") {
    recs.push("Bebida deportiva con sales desde el primer momento.");
    recs.push("Reforzar sodio si sudas visiblemente por el maillot.");
  }
  if (h > 70) recs.push("Humedad alta: la sudoración no evapora bien, prioriza volumen y electrolitos.");
  if (weather.precip_mm >= 3) recs.push("Lluvia probable: cuidado con la hipotermia si baja la temperatura, no descuides ingesta.");
  if (weather.temp_min_c <= 5) recs.push("Frío al inicio: usa manguitos y evita bebida helada; puede reducir la ingesta y provocar deshidratación silenciosa.");
  if (weather.wind_kmh >= 30) recs.push("Viento fuerte: mayor pérdida por evaporación, no reduzcas el volumen aunque no notes sudor.");
  if (risk === "bajo") recs.push("Clima favorable: mantén 500-600 ml/h con electrolitos suaves.");

  return {
    fluid_ml_per_hour: fluid,
    sodium_mg_per_hour: sodium,
    total_fluid_ml: totalFluid,
    total_sodium_mg: totalSodium,
    bottles_500ml: Math.ceil(totalFluid / 500),
    heat_risk: risk,
    recommendations: recs,
  };
}
