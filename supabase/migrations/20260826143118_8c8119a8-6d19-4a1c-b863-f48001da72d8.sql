CREATE TABLE public.intervals_activities (
  id text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  type text,
  start_date timestamptz,
  moving_time integer,
  distance numeric,
  total_elevation_gain numeric,
  average_speed numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  average_watts numeric,
  icu_training_load numeric,
  icu_intensity numeric,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervals_activities TO authenticated;
GRANT ALL ON public.intervals_activities TO service_role;

ALTER TABLE public.intervals_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own intervals activities"
ON public.intervals_activities FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX intervals_activities_user_date_idx ON public.intervals_activities (user_id, start_date DESC);

ALTER TABLE public.power_peaks ALTER COLUMN activity_id TYPE text USING activity_id::text;