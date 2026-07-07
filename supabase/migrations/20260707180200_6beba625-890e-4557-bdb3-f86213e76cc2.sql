
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ftp_test_completed_at timestamptz;
