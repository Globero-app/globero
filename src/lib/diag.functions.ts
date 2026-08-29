import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Historial de notificaciones enviadas (Push/Telegram) del usuario. */
export const getNotificationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("notification_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);
    return { items: data ?? [] };
  });

/** Estado de sincronización con Intervals.icu. */
export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key,intervals_oauth")
      .eq("id", userId)
      .maybeSingle();
    const connected = Boolean((profile as any)?.intervals_athlete_id && ((profile as any)?.intervals_api_key || (profile as any)?.intervals_oauth));

    const { data: lastAct } = await supabase
      .from("intervals_activities")
      .select("id,name,start_date,synced_at")
      .eq("user_id", userId)
      .order("synced_at", { ascending: false })
      .limit(1);

    const { count: activityCount } = await supabase
      .from("intervals_activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: logs } = await supabase
      .from("sync_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      connected,
      last_activity: (lastAct?.[0] as any) ?? null,
      activity_count: activityCount ?? 0,
      logs: logs ?? [],
    };
  });

/** Recuento agrupado de errores del servidor (solo admin). */
export const getErrorStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().min(1).max(90).default(7) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Solo administradores.");

    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { data: rows } = await supabase
      .from("error_log")
      .select("source,message,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const groups = new Map<string, { source: string; message: string; count: number; last: string }>();
    for (const r of (rows ?? []) as any[]) {
      const key = `${r.source}::${String(r.message).slice(0, 120)}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { source: r.source, message: String(r.message).slice(0, 200), count: 1, last: r.created_at });
    }
    return {
      total: rows?.length ?? 0,
      groups: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 50),
    };
  });

/** Indica si toca hacer un test de FTP/FC (cada 6-8 semanas). */
export const getFtpTestStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,ftp_test_completed_at")
      .eq("id", userId)
      .maybeSingle();
    const last = (profile as any)?.ftp_test_completed_at as string | null;
    const weeks = last ? Math.floor((Date.now() - new Date(last).getTime()) / (7 * 86400000)) : null;
    const due = weeks == null || weeks >= 6;
    return {
      last_test_at: last,
      weeks_since: weeks,
      due,
      overdue: weeks != null && weeks >= 8,
      ftp: (profile as any)?.ftp ?? null,
    };
  });

/** Uso de IA del mes actual, agrupado por función. */
export const getAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("ai_usage_log")
      .select("fn,model,prompt_tokens,completion_tokens")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .limit(2000);

    const groups = new Map<string, { fn: string; model: string; calls: number; prompt_tokens: number; completion_tokens: number }>();
    for (const r of (data ?? []) as any[]) {
      const g = groups.get(r.fn) ?? { fn: r.fn, model: r.model, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
      g.calls++;
      g.prompt_tokens += Number(r.prompt_tokens) || 0;
      g.completion_tokens += Number(r.completion_tokens) || 0;
      groups.set(r.fn, g);
    }
    const items = [...groups.values()].sort((a, b) => b.calls - a.calls);
    return {
      since: since.toISOString().slice(0, 10),
      total_calls: items.reduce((t, i) => t + i.calls, 0),
      total_tokens: items.reduce((t, i) => t + i.prompt_tokens + i.completion_tokens, 0),
      items,
    };
  });

/** Uso global de IA (todos los usuarios) del mes actual. Solo admin. */
export const getGlobalAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Solo administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await supabaseAdmin
      .from("ai_usage_log")
      .select("fn,model,prompt_tokens,completion_tokens")
      .gte("created_at", since.toISOString())
      .limit(5000);

    const groups = new Map<string, { fn: string; model: string; calls: number; prompt_tokens: number; completion_tokens: number }>();
    for (const r of (data ?? []) as any[]) {
      const g = groups.get(r.fn) ?? { fn: r.fn, model: r.model, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
      g.calls++;
      g.prompt_tokens += Number(r.prompt_tokens) || 0;
      g.completion_tokens += Number(r.completion_tokens) || 0;
      groups.set(r.fn, g);
    }
    const items = [...groups.values()].sort((a, b) => b.calls - a.calls);
    return {
      since: since.toISOString().slice(0, 10),
      total_calls: items.reduce((t, i) => t + i.calls, 0),
      total_tokens: items.reduce((t, i) => t + i.prompt_tokens + i.completion_tokens, 0),
      items,
    };
  });
