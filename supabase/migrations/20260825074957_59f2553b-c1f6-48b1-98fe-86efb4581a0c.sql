CREATE TABLE public.power_peaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id bigint NOT NULL,
  duration_seconds integer NOT NULL,
  watts numeric NOT NULL,
  wkg numeric,
  activity_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id, duration_seconds)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.power_peaks TO authenticated;
GRANT ALL ON public.power_peaks TO service_role;

ALTER TABLE public.power_peaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own power peaks"
ON public.power_peaks
FOR ALL
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_power_peaks_updated_at
BEFORE UPDATE ON public.power_peaks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();