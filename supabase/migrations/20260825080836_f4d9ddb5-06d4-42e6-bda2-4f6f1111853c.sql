CREATE TABLE public.health_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  weight_kg numeric,
  sleep_hours numeric,
  sleep_quality smallint,
  fatigue smallint,
  soreness smallint,
  resting_hr integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_entries TO authenticated;
GRANT ALL ON public.health_entries TO service_role;
ALTER TABLE public.health_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_entries_own" ON public.health_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER health_entries_updated_at BEFORE UPDATE ON public.health_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.coach_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_date date NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_date, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_alerts TO authenticated;
GRANT ALL ON public.coach_alerts TO service_role;
ALTER TABLE public.coach_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_alerts_own" ON public.coach_alerts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER coach_alerts_updated_at BEFORE UPDATE ON public.coach_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_daily_brief boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_fatigue_alerts boolean NOT NULL DEFAULT true;