CREATE TABLE public.ftp_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Madrid')::date,
  avg_watts_20min numeric,
  ftp integer,
  avg_hr_20min numeric,
  lthr integer,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ftp_tests TO authenticated;
GRANT ALL ON public.ftp_tests TO service_role;
ALTER TABLE public.ftp_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ftp_tests_own" ON public.ftp_tests FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ftp_tests_user_date ON public.ftp_tests (user_id, test_date DESC);