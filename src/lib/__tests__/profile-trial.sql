-- Transactional integration tests: all fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  test_id uuid := gen_random_uuid();
  signup_at timestamptz := '2026-10-01T12:00:00Z';
  expected_end timestamptz := '2026-10-31T12:00:00Z';
  actual_end timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Signup profile trigger must be enabled';
  END IF;

  INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data)
  VALUES (test_id, 'profile-trial-test@example.invalid', signup_at, signup_at, '{"full_name":"Trial test","country":"ES","admin_grant_active":true,"role":"admin"}'::jsonb);
  SELECT trial_ends_at INTO actual_end FROM public.profiles WHERE id = test_id;
  IF actual_end IS DISTINCT FROM expected_end THEN
    RAISE EXCEPTION 'Signup must create profile with exactly 30 days: got %', actual_end;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = test_id AND role = 'user') OR
     EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = test_id AND role = 'admin') OR
     EXISTS (SELECT 1 FROM public.profiles WHERE id = test_id AND admin_grant_active) THEN
    RAISE EXCEPTION 'Signup metadata must not grant privileged access';
  END IF;

  DELETE FROM public.profiles WHERE id = test_id;
  INSERT INTO public.profiles (id, email, trial_ends_at)
  VALUES (test_id, 'profile-trial-test@example.invalid', now() + interval '365 days');
  SELECT trial_ends_at INTO actual_end FROM public.profiles WHERE id = test_id;
  IF actual_end IS DISTINCT FROM expected_end THEN
    RAISE EXCEPTION 'Recreating a profile must not restart or extend its trial';
  END IF;

  UPDATE public.profiles SET full_name = 'Updated name' WHERE id = test_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = test_id AND trial_ends_at = expected_end AND created_at = signup_at) THEN
    RAISE EXCEPTION 'Editing a profile must preserve the original signup and trial dates';
  END IF;
END;
$$;
ROLLBACK;