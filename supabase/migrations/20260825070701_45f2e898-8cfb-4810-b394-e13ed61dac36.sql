CREATE TABLE public.job_runs (
  job_name text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  paused_until timestamptz,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read job runs" ON public.job_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER job_runs_updated_at BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.daily_activities ADD COLUMN IF NOT EXISTS match_notified_at timestamptz;