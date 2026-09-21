ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS strava_athlete_id text,
  ADD COLUMN IF NOT EXISTS strava_access_token text,
  ADD COLUMN IF NOT EXISTS strava_refresh_token text,
  ADD COLUMN IF NOT EXISTS strava_token_expires_at timestamptz;