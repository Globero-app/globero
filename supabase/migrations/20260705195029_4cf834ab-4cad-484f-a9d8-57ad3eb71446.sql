
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_maintenance_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_maintenance_push boolean NOT NULL DEFAULT false;
