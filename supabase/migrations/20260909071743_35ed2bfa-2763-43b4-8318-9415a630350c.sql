ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_lat numeric,
  ADD COLUMN IF NOT EXISTS location_lon numeric,
  ADD COLUMN IF NOT EXISTS location_resolved text,
  ADD COLUMN IF NOT EXISTS notify_weather_alerts boolean NOT NULL DEFAULT true;

UPDATE public.profiles SET country = 'ES' WHERE country IS NULL;