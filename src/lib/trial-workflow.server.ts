import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { trialNoticeDate, trialWorkflowData } from "./trial-workflow";
import { sendTrialAccountNotice } from "./trial-notice.server";

export function createTrialWorkflowHandler() {
  const client = new Inngest({ id: "globero-account-notices", isDev: false, signingKey: process.env["INNGEST_SIGNING_KEY"] });
  const notice = client.createFunction({
    id: "individual-trial-account-notice",
    triggers: [{ event: "globero/account.trial-notice" }],
    idempotency: "event.data.userId + ':' + event.data.trialEnd + ':' + event.data.kind",
    retries: 5,
  }, async ({ event, step }) => {
    const data = trialWorkflowData.parse(event.data);
    await step.sleepUntil("wait-for-trial-milestone", trialNoticeDate(data.trialEnd, data.kind));
    return step.run("send-account-notice", () => sendTrialAccountNotice(data.userId, { kind: data.kind, trialEnd: data.trialEnd }));
  });
  return serve({ client, functions: [notice] });
}

export async function scheduleTrialNotices(userId: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["INNGEST_API_KEY"];
  if (!apiKey || !connectionKey) throw new Error("Trial scheduling is not configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin.from("profiles")
    .select("trial_ends_at,subscription_status,admin_grant_active,deactivated_at").eq("id", userId).maybeSingle();
  if (error) throw new Error("Account check failed");
  if (!profile || profile.deactivated_at || profile.admin_grant_active || profile.subscription_status === "active") return { scheduled: 0 };
  const events = (["trial-day-25", "trial-expired"] as const)
    .filter(kind => trialNoticeDate(profile.trial_ends_at, kind).getTime() + 86400000 > Date.now())
    .map(kind => ({
      id: `trial:${userId}:${profile.trial_ends_at}:${kind}`,
      name: "globero/account.trial-notice",
      data: trialWorkflowData.parse({ userId, trialEnd: profile.trial_ends_at, kind }),
    }));
  if (!events.length) return { scheduled: 0 };
  const response = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Trial scheduling failed [${response.status}]: ${body}`);
    throw new Error(`Trial scheduling failed [${response.status}]`);
  }
  return { scheduled: events.length };
}