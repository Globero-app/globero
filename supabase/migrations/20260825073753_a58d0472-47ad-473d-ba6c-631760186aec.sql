DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cyclist_type_enum') THEN
    CREATE TYPE public.cyclist_type_enum AS ENUM ('sprinter', 'rodador', 'escalador', 'contrarrelojista', 'mixto');
  END IF;
END $$;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS cyclist_type,
  ADD COLUMN cyclist_type public.cyclist_type_enum NOT NULL DEFAULT 'mixto'::public.cyclist_type_enum,
  ADD COLUMN IF NOT EXISTS strengths text,
  ADD COLUMN IF NOT EXISTS weaknesses text,
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS weather_auto_indoor boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weather_wind_threshold_kmh integer NOT NULL DEFAULT 25;

COMMENT ON COLUMN public.profiles.cyclist_type IS 'Perfil tipológico del ciclista';
COMMENT ON COLUMN public.profiles.strengths IS 'Fortalezas del ciclista (libre)';
COMMENT ON COLUMN public.profiles.weaknesses IS 'Debilidades a trabajar (libre)';
COMMENT ON COLUMN public.profiles.location_city IS 'Ciudad base para previsión meteorológica';
COMMENT ON COLUMN public.profiles.weather_auto_indoor IS 'Sugerir rodillo automáticamente en mal tiempo';
COMMENT ON COLUMN public.profiles.weather_wind_threshold_kmh IS 'Umbral de viento a partir del cual ajustar entrenamiento';