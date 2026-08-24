ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_auto_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_training_days smallint[] NOT NULL DEFAULT '{2,4,6}',
  ADD COLUMN IF NOT EXISTS weekly_long_ride_day smallint,
  ADD COLUMN IF NOT EXISTS weekly_bike_type text NOT NULL DEFAULT 'carretera',
  ADD COLUMN IF NOT EXISTS weekly_duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS weekly_target_basis text NOT NULL DEFAULT 'power',
  ADD COLUMN IF NOT EXISTS weekly_last_generated_at timestamptz;