ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intervals_athlete_id text,
  ADD COLUMN IF NOT EXISTS intervals_api_key text;