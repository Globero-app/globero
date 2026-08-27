import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type SiteBlock = {
  id: string;
  section: string;
  block_key: string;
  block_type: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  icon: string | null;
  sort_order: number;
  active: boolean;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getSiteContent = createServerFn({ method: "GET" })
  .inputValidator((d: { section: "landing" | "privacy" }) => d)
  .handler(async ({ data }): Promise<SiteBlock[]> => {
    const sb = publicClient();
    const { data: rows } = await sb
      .from("site_content")
      .select("*")
      .eq("section", data.section)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    return (rows ?? []) as SiteBlock[];
  });

export const listSiteContentAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteBlock[]> => {
    const { data, error } = await context.supabase.from("site_content").select("*").order("section").order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as SiteBlock[];
  });

export const upsertSiteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<SiteBlock> & { section: string; block_key: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("site_content").upsert(
      {
        section: data.section,
        block_key: data.block_key,
        block_type: data.block_type ?? "text",
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        body: data.body ?? null,
        icon: data.icon ?? null,
        sort_order: data.sort_order ?? 0,
        active: data.active ?? true,
      },
      { onConflict: "section,block_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSiteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("site_content").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
