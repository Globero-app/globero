CREATE TABLE public.ai_model_fallbacks (
 primary_model text PRIMARY KEY,
 fallback_model text NOT NULL,
 reason text NOT NULL CHECK (reason IN ('retired', 'unavailable')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_model_fallbacks TO authenticated;
GRANT ALL ON public.ai_model_fallbacks TO service_role;
ALTER TABLE public.ai_model_fallbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators read AI fallback notices" ON public.ai_model_fallbacks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ai_model_fallbacks_updated BEFORE UPDATE ON public.ai_model_fallbacks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();