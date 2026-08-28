ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intervals_oauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intervals_refresh_token text,
  ADD COLUMN IF NOT EXISTS intervals_token_expires_at timestamptz;