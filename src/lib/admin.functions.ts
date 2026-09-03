import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Solo administradores");
}

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,country,deactivated_at,telegram_chat_id,intervals_athlete_id,intervals_oauth");
    const { data: usage } = await supabaseAdmin.rpc("ai_usage_by_user");
    const usageMap = new Map<string, { calls: number; tokens: number }>(
      ((usage ?? []) as any[]).map((r) => [r.user_id as string, { calls: Number(r.calls) || 0, tokens: Number(r.tokens) || 0 }]),
    );
    return list.users.map((u) => {
      const p: any = profiles?.find((x: any) => x.id === u.id) ?? null;
      const mine = usageMap.get(u.id) ?? { calls: 0, tokens: 0 };
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: (u as any).last_sign_in_at ?? null,
        full_name: p?.full_name ?? null,
        country: p?.country ?? null,
        deactivated_at: p?.deactivated_at ?? null,
        telegram: !!p?.telegram_chat_id,
        intervals: !!(p?.intervals_athlete_id || p?.intervals_oauth),
        ai_calls: mine.length,
        ai_tokens: mine.reduce((s: number, r: any) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0),
        roles: roles?.filter((r) => r.user_id === u.id).map((r) => r.role) ?? [],
      };
    });
  });


const CreateInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: z.enum(["admin", "user"]),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw error;
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: created.user!.id, role: "admin" },
        { onConflict: "user_id,role" }
      );
    }
    return { id: created.user!.id };
  });

const UpdateRoleInput = z.object({ userId: z.string().uuid(), role: z.enum(["admin", "user"]) });
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Borra todos los roles y reasigna
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

const DeleteInput = z.object({ userId: z.string().uuid() });
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    if (data.userId === context.userId) throw new Error("No puedes eliminar tu propia cuenta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

const ConfigInput = z.object({
  primary_color: z.string().min(3),
  accent_color: z.string().min(3),
  button_color: z.string().min(3),
  font_family: z.string().min(1),
  display_font: z.string().min(1),
  team_name: z.string().min(1),
});

export const updateAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_config").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    return { ok: true };
  });
