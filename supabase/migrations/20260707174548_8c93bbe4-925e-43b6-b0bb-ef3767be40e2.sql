
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hrv_push_hour smallint NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS hrv_push_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.hrv_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  value integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrv_entries TO authenticated;
GRANT ALL ON public.hrv_entries TO service_role;

ALTER TABLE public.hrv_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hrv"
  ON public.hrv_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER hrv_entries_set_updated_at
  BEFORE UPDATE ON public.hrv_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS hrv_entries_user_date_idx ON public.hrv_entries (user_id, entry_date DESC);
