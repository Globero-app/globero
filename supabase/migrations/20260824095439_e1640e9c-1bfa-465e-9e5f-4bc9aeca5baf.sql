CREATE TABLE public.daily_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notification_sent boolean NOT NULL DEFAULT false,
  feedback_completed boolean NOT NULL DEFAULT false,
  rpe integer,
  feel integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_activities TO authenticated;
GRANT ALL ON public.daily_activities TO service_role;

ALTER TABLE public.daily_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily activities" ON public.daily_activities
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER daily_activities_updated_at BEFORE UPDATE ON public.daily_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_daily_activities_user_date ON public.daily_activities (user_id, date);