CREATE OR REPLACE FUNCTION public.ai_usage_summary(_since timestamptz)
RETURNS TABLE (fn text, model text, calls bigint, prompt_tokens bigint, completion_tokens bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.fn,
         MAX(l.model) AS model,
         COUNT(*)::bigint AS calls,
         COALESCE(SUM(l.prompt_tokens), 0)::bigint,
         COALESCE(SUM(l.completion_tokens), 0)::bigint
  FROM public.ai_usage_log l
  WHERE l.created_at >= _since
  GROUP BY l.fn
  ORDER BY calls DESC
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_user()
RETURNS TABLE (user_id uuid, calls bigint, tokens bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.user_id,
         COUNT(*)::bigint,
         COALESCE(SUM(l.prompt_tokens + l.completion_tokens), 0)::bigint
  FROM public.ai_usage_log l
  WHERE l.user_id IS NOT NULL
  GROUP BY l.user_id
$$;

REVOKE ALL ON FUNCTION public.ai_usage_summary(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_usage_by_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_summary(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_usage_by_user() TO service_role;