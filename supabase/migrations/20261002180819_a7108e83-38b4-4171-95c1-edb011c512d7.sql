CREATE TABLE public.recipe_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_name text NOT NULL,
  liked boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipe_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_feedback TO authenticated;
GRANT ALL ON public.recipe_feedback TO service_role;
ALTER TABLE public.recipe_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own recipe feedback" ON public.recipe_feedback FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER recipe_feedback_updated_at BEFORE UPDATE ON public.recipe_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();