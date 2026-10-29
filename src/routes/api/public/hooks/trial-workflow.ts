import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  if (!process.env["INNGEST_SIGNING_KEY"]) return new Response("Workflow unavailable", { status: 503 });
  const { createTrialWorkflowHandler } = await import("@/lib/trial-workflow.server");
  return createTrialWorkflowHandler()(request);
}

export const Route = createFileRoute("/api/public/hooks/trial-workflow")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle } },
});