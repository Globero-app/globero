import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notifyBeaconContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ beaconId: z.string().uuid(), kind: z.enum(["start", "sos", "ended"]), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: beacon } = await supabase.from("safety_beacons")
      .select("id,share_token,last_lat,last_lon,battery_pct").eq("id", data.beaconId).eq("user_id", userId).maybeSingle();
    if (!beacon) throw new Error("Baliza no encontrada");
    let q = supabase.from("emergency_contacts").select("email").eq("user_id", userId);
    if (data.kind !== "sos") q = q.eq("notify_on_start", true);
    const { data: contacts } = await q;
    if (!contacts?.length) return { sent: 0 };
    const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle();
    const { sendBeaconEmails } = await import("./beacon-email.server");
    const sent = await sendBeaconEmails({
      kind: data.kind, riderName: prof?.full_name || prof?.email, beacon, contacts,
      link: `${new URL(data.origin).origin}/live/${beacon.share_token}`,
    });
    return { sent, total: contacts.length };
  });
