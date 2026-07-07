ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_hr integer,
  ADD COLUMN IF NOT EXISTS lthr integer,
  ADD COLUMN IF NOT EXISTS zones_display_mode text NOT NULL DEFAULT 'watts' CHECK (zones_display_mode IN ('watts','hr'));