CREATE TABLE public.athlete_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  availability_minutes jsonb NOT NULL DEFAULT '{"0":null,"1":null,"2":null,"3":null,"4":null,"5":null,"6":null}'::jsonb,
  preferred_hour smallint,
  indoor_tolerance text NOT NULL DEFAULT 'media',
  terrain text NOT NULL DEFAULT 'mixto',
  natural_cadence smallint,
  detected_type text,
  peak_5s numeric,
  peak_1m numeric,
  peak_5m numeric,
  peak_20m numeric,
  wkg_20m numeric,
  anaerobic_ratio numeric,
  weekly_tss_ceiling numeric,
  tsb_recovery_threshold numeric,
  readiness_low_threshold numeric,
  recovery_days_after_hard numeric,
  deload_every_weeks smallint,
  session_bias jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_profile TO authenticated;
GRANT ALL ON public.athlete_profile TO service_role;

ALTER TABLE public.athlete_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own athlete profile" ON public.athlete_profile
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER athlete_profile_updated_at
  BEFORE UPDATE ON public.athlete_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS session_goal text,
  ADD COLUMN IF NOT EXISTS energy_system text;