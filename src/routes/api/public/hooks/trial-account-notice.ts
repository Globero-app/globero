import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/hooks/trial-account-notice")({
  server: { handlers: { POST: async ({ request }) => {
    const { verifyCronRequest } = await import("@/lib/cron-auth.server");
    if (!(await verifyCronRequest(request))) return new Response("Unauthorized", { status: 401 });
    const parsed = z.object({ userId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid request", { status: 400 });
    try {
      const { sendTrialAccountNotice } = await import("@/lib/trial-notice.server");
      return Response.json(await sendTrialAccountNotice(parsed.data.userId));
    } catch {
      return new Response("Notification temporarily unavailable", { status: 503 });
    }
  } } },
});