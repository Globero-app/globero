CREATE TABLE public.training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  focus text NOT NULL DEFAULT 'base',
  week_index smallint NOT NULL DEFAULT 1,
  target_tss numeric,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_blocks TO authenticated;
GRANT ALL ON public.training_blocks TO service_role;

ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own training blocks" ON public.training_blocks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER training_blocks_updated_at BEFORE UPDATE ON public.training_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_training_blocks_user_start ON public.training_blocks(user_id, start_date DESC);

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS planned_tss numeric,
  ADD COLUMN IF NOT EXISTS actual_tss numeric,
  ADD COLUMN IF NOT EXISTS actual_if numeric,
  ADD COLUMN IF NOT EXISTS compliance numeric;