CREATE TABLE public.garmin_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  garmin_device_id text NOT NULL UNIQUE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE INDEX garmin_devices_user_idx ON public.garmin_devices(user_id);
GRANT SELECT, UPDATE, DELETE ON public.garmin_devices TO authenticated;
GRANT ALL ON public.garmin_devices TO service_role;
ALTER TABLE public.garmin_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own garmin devices select" ON public.garmin_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own garmin devices update" ON public.garmin_devices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own garmin devices delete" ON public.garmin_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.garmin_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_code text NOT NULL UNIQUE CHECK (pairing_code ~ '^[A-Z0-9]{4}$'),
  user_id uuid,
  garmin_device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
CREATE INDEX garmin_pairing_codes_expires_idx ON public.garmin_pairing_codes(expires_at);
GRANT ALL ON public.garmin_pairing_codes TO service_role;
ALTER TABLE public.garmin_pairing_codes ENABLE ROW LEVEL SECURITY;