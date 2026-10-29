import { z } from "zod";

export const trialWorkflowData = z.object({
  userId: z.string().uuid(),
  trialEnd: z.string().datetime({ offset: true }),
  kind: z.enum(["trial-day-25", "trial-expired"]),
}).strict();

export function trialNoticeDate(trialEnd: string, kind: "trial-day-25" | "trial-expired") {
  return new Date(Date.parse(trialEnd) - (kind === "trial-day-25" ? 5 * 86400000 : 0));
}