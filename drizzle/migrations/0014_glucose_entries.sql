CREATE TABLE public.glucose_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  value_mgdl smallint NOT NULL CHECK (value_mgdl BETWEEN 20 AND 600),
  context text NOT NULL DEFAULT 'other' CHECK (context IN ('fasting','pre_ride','during_ride','post_ride','meal','bedtime','other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.glucose_entries TO authenticated;
GRANT ALL ON public.glucose_entries TO service_role;
ALTER TABLE public.glucose_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own glucose" ON public.glucose_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX glucose_entries_user_time ON public.glucose_entries (user_id, measured_at DESC);