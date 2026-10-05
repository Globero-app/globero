CREATE TABLE public.safety_beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended','sos')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  last_lat double precision,
  last_lon double precision,
  last_seen_at timestamptz,
  battery_pct smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_beacons TO authenticated;
GRANT ALL ON public.safety_beacons TO service_role;
ALTER TABLE public.safety_beacons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages beacons" ON public.safety_beacons FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX safety_beacons_user_idx ON public.safety_beacons(user_id, started_at DESC);
CREATE TRIGGER safety_beacons_updated_at BEFORE UPDATE ON public.safety_beacons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.beacon_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  beacon_id uuid NOT NULL REFERENCES public.safety_beacons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  altitude_m real,
  speed_kmh real,
  heading real,
  accuracy_m real,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.beacon_points TO authenticated;
GRANT ALL ON public.beacon_points TO service_role;
ALTER TABLE public.beacon_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads points" ON public.beacon_points FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner deletes points" ON public.beacon_points FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner adds points to own beacon" ON public.beacon_points FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.safety_beacons b WHERE b.id = beacon_id AND b.user_id = auth.uid()));
CREATE INDEX beacon_points_beacon_idx ON public.beacon_points(beacon_id, recorded_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_beacons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.beacon_points;