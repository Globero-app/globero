ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_training_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_prerace_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_strava_push boolean NOT NULL DEFAULT true;