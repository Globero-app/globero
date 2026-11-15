/** Only definitive, pre-execution model-availability rejections permit substitution. */
export function unavailableModelReason(status: number, payload: unknown): "retired" | "unavailable" | null {
  if (![400, 404, 410, 503].includes(status) || !payload || typeof payload !== "object") return null;
  const error = "error" in payload ? payload.error : payload;
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? error.code : undefined;
  if (["model_retired", "model_decommissioned", "model_removed"].includes(String(code))) return "retired";
  if (["model_not_found", "model_unavailable", "model_not_available"].includes(String(code))) return "unavailable";
  // Some providers expose only a message. Require both the model and an explicit retirement.
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return /\bmodel\b.*\b(retired|decommissioned|no longer available)\b/i.test(message) ? "retired" : null;
}