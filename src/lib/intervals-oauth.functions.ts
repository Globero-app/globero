import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createIntervalsOAuthState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["INTERVALS_OAUTH_STATE_SECRET"];
    if (!secret) throw new Error("Falta INTERVALS_OAUTH_STATE_SECRET");
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = `${context.userId}.${expiresAt}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    return { state: `${payload}.${encodedSignature}` };
  });
