CREATE TABLE public.readiness_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  note text,
  ai_action text,
  ai_message text,
  workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.readiness_entries TO authenticated;
GRANT ALL ON public.readiness_entries TO service_role;

ALTER TABLE public.readiness_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own readiness" ON public.readiness_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_readiness_updated_at BEFORE UPDATE ON public.readiness_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles RENAME COLUMN hrv_push_enabled TO readiness_push_enabled;
ALTER TABLE public.profiles RENAME COLUMN hrv_push_hour TO readiness_push_hour;