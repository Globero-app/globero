CREATE OR REPLACE FUNCTION public.ai_usage_summary(_since timestamptz)
RETURNS TABLE (fn text, model text, calls bigint, prompt_tokens bigint, completion_tokens bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.fn,
         l.model,
         COUNT(*)::bigint AS calls,
         COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens
  FROM public.ai_usage_log l
  WHERE l.created_at >= _since
  GROUP BY l.fn, l.model
  ORDER BY calls DESC
$$;

CREATE FUNCTION public.ai_usage_by_user_monthly(_since timestamptz)
RETURNS TABLE (user_id uuid, model text, calls bigint, prompt_tokens bigint, completion_tokens bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.user_id,
         l.model,
         COUNT(*)::bigint AS calls,
         COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens
  FROM public.ai_usage_log l
  WHERE l.created_at >= _since
  GROUP BY l.user_id, l.model
$$;

REVOKE ALL ON FUNCTION public.ai_usage_summary(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_usage_by_user_monthly(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_summary(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_usage_by_user_monthly(timestamptz) TO service_role;