/** Lógica pura del webhook de Wahoo (testeable con dependencias inyectadas). */
export type WahooAction = "workout" | "deauth" | "ignore";

export function resolveWahooEvent(body: any): WahooAction {
  const t = String(body?.event_type ?? body?.event ?? "").trim();
  if (t === "workout_summary") return "workout";
  if (!t || t === "deauthorize" || t === "user_deauthorized") return "deauth";
  return "ignore";
}

export interface WahooDeps {
  findProfile: (wahooUserId: string) => Promise<any | null>;
  pullActivities: (userId: string) => Promise<number>;
  refreshPmc: (userId: string, profile: any) => Promise<void>;
  deauthorize: (wahooUserId: string) => Promise<void>;
}

export async function handleWahooEvent(body: any, deps: WahooDeps) {
  const wahooUserId = body?.user?.id ?? body?.user_id;
  if (wahooUserId == null) return { status: 400, ok: false, error: "missing_user_id" } as const;
  const action = resolveWahooEvent(body);
  if (action === "ignore") return { status: 200, ok: true, ignored: true, refreshed: false } as const;
  if (action === "deauth") {
    await deps.deauthorize(String(wahooUserId));
    return { status: 200, ok: true, refreshed: false } as const;
  }
  const p = await deps.findProfile(String(wahooUserId));
  if (!p) return { status: 200, ok: true, ignored: true, refreshed: false } as const;
  const stored = await deps.pullActivities(p.id);
  let refreshed = false;
  if (stored > 0) {
    try {
      await deps.refreshPmc(p.id, p);
      refreshed = true;
    } catch (e) {
      console.error("[wahoo webhook] PMC refresh", e);
    }
  }
  return { status: 200, ok: true, stored, refreshed } as const;
}
