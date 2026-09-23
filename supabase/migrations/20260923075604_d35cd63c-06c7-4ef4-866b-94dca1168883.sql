ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS cp_watts numeric,
  ADD COLUMN IF NOT EXISTS w_prime_kj numeric,
  ADD COLUMN IF NOT EXISTS frc_kj numeric,
  ADD COLUMN IF NOT EXISTS pd_curve jsonb,
  ADD COLUMN IF NOT EXISTS pd_fit_quality numeric;