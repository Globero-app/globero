import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const emailSchema = z.object({ email: z.string().trim().email().max(255) });

/** Comprueba si el email pertenece a un usuario existente (sin exponer datos). */
export const emailExists = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => emailSchema.parse(d))
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    return { exists: !!row };
  });

/** Desactiva la cuenta del usuario actual: corta conexiones y detiene automatismos. */
export const deactivateMyAccount = (await import("@tanstack/react-start")).createServerFn({ method: "POST" })
