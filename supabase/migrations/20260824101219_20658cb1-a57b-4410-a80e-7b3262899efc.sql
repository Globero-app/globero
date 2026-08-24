ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nutrition_plan_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nutrition_goal text NOT NULL DEFAULT 'mantenimiento';

CREATE TABLE IF NOT EXISTS public.weekly_nutrition_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  goal text NOT NULL DEFAULT 'mantenimiento',
  plan jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_nutrition_plans TO authenticated;
GRANT ALL ON public.weekly_nutrition_plans TO service_role;

ALTER TABLE public.weekly_nutrition_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition plans" ON public.weekly_nutrition_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER weekly_nutrition_plans_updated_at
  BEFORE UPDATE ON public.weekly_nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();