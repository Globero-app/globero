
-- Bikes table
CREATE TABLE public.bikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  model text,
  bike_type text,
  current_km numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bikes TO authenticated;
GRANT ALL ON public.bikes TO service_role;

ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bikes" ON public.bikes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER bikes_updated_at BEFORE UPDATE ON public.bikes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Components table
CREATE TABLE public.bike_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id uuid NOT NULL REFERENCES public.bikes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_type text NOT NULL, -- cadena, pastillas_del, pastillas_tras, cubierta_del, cubierta_tras, transmision, cassette, plato, rodamientos, otros
  name text,
  install_km numeric NOT NULL DEFAULT 0, -- bike km when installed
  lifespan_km numeric NOT NULL DEFAULT 3000, -- expected lifespan
  installed_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bike_components TO authenticated;
GRANT ALL ON public.bike_components TO service_role;

ALTER TABLE public.bike_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own components" ON public.bike_components
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER bike_components_updated_at BEFORE UPDATE ON public.bike_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_bikes_user ON public.bikes(user_id);
CREATE INDEX idx_bike_components_bike ON public.bike_components(bike_id);
