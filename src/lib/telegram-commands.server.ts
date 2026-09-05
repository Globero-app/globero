/** Vinculación (/start) y comandos rápidos del bot de Telegram. */
import { telegramSend } from "./telegram-api.server";

/** Gestiona "/start [código]". Devuelve true si el mensaje ya se ha atendido. */
export async function handleStartCommand(supabaseAdmin: any, chatId: any, text: string): Promise<boolean> {
  const startMatch = text.match(/^\/start(?:\s+(\S+))?/i);
  if (!startMatch) return false;

  const code = startMatch[1];
  if (!code) {
    await telegramSend(chatId, "Hola 👋 Para vincular tu cuenta, entra en la app → Perfil → Conectar Telegram y pulsa el botón.");
    return true;
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("linking_code", code)
    .maybeSingle();
  if (!profile) {
    await telegramSend(chatId, "❌ Código no válido o caducado. Genera uno nuevo en la app (Perfil → Conectar Telegram).");
    return true;
  }
  await supabaseAdmin
    .from("profiles")
    .update({ telegram_chat_id: String(chatId), linking_code: null })
    .eq("id", (profile as any).id);
  await telegramSend(
    chatId,
    `✅ Cuenta vinculada, ${(profile as any).full_name ?? "ciclista"}.\n\nYa puedes escribirme:\n· "hoy me encuentro a 4" para registrar tu readiness\n· "pásame el entreno de hoy a rodillo 1h" para adaptarlo\n· o preguntarme cualquier duda sobre tu entrenamiento.`,
  );
  return true;
}

/**
 * Comandos rápidos (/ayuda, /hoy, /forma, /semana, /readiness, /menu).
 * Devuelve true si el comando ya se ha atendido; "readiness" si debe reprocesarse como texto natural.
 */
export async function handleQuickCommand(
  supabaseAdmin: any,
  chatId: any,
  userId: string,
  profile: any,
  text: string,
): Promise<boolean | { rerunAs: string }> {
  const cmdMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s);
  if (!cmdMatch) return false;
  const cmd = cmdMatch[1]!.toLowerCase();
  const arg = (cmdMatch[2] ?? "").trim();

  if (cmd === "ayuda" || cmd === "help") {
    await telegramSend(
      chatId,
      `Comandos disponibles:
/hoy — resumen del día (entreno, forma y consejo)
/forma — CTL, ATL, TSB y alertas de fatiga
/semana — resumen semanal y objetivos
/menu — menú de hoy
/readiness N — registra tu readiness (1-5)
/ayuda — esta lista

También puedes escribirme en lenguaje natural: "pásame el entreno de hoy a rodillo 1h", "mi peso es 72 kg", "cámbiame la cena".`,
    );
    return true;
  }

  if (cmd === "hoy" || cmd === "forma") {
    const { buildDailyBrief, runCoachAlerts } = await import("./coach.server");
    if (cmd === "hoy") {
      const brief = await buildDailyBrief(supabaseAdmin, userId);
      await telegramSend(chatId, `🧭 ${brief.date}\n${brief.detail}`);
      return true;
    }
    const res = await runCoachAlerts(supabaseAdmin, userId, false);
    const { buildTrainingLoad } = await import("./training-load.server");
    const load = await buildTrainingLoad(supabaseAdmin, userId, profile);
    const alerts = res.alerts.length ? res.alerts.map((a) => `· ${a.title}: ${a.message}`).join("\n") : "Sin alertas.";
    await telegramSend(
      chatId,
      `📈 Forma actual\nCTL ${Math.round(load.ctl)} · ATL ${Math.round(load.atl)} · TSB ${Math.round(load.tsb)}\nAdherencia 28d: ${load.adherence_pct ?? "n/a"}%\nReadiness 7d: ${load.readiness_7d ?? "n/a"}/5 (${load.readiness_trend})\n\n${alerts}`,
    );
    return true;
  }

  if (cmd === "semana") {
    const { buildWeeklySummaryText } = await import("./weekly-summary.server");
    const s = await buildWeeklySummaryText(supabaseAdmin, userId);
    await telegramSend(chatId, `📊 ${s.detail}`);
    return true;
  }

  if (cmd === "readiness") {
    const n = Number(arg.match(/[1-5]/)?.[0]);
    if (!n) {
      await telegramSend(chatId, "Indica un valor del 1 al 5. Ejemplo: /readiness 4");
      return true;
    }
    return { rerunAs: `hoy me encuentro a ${n}` };
  }

  // /menu continúa al flujo normal; la IA responderá con el menú
  return false;
}
