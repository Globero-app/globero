/** Verifica que la petición proviene de una tarea programada autorizada. */
export async function verifyCronRequest(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;

  const envSecret = process.env["CRON_SECRET"];
  if (envSecret && provided === envSecret) return true;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("cron_auth").select("token").eq("id", 1).maybeSingle();
    const token = (data as any)?.token as string | undefined;
    return !!token && provided === token;
  } catch {
    return false;
  }
}
