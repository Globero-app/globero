CREATE OR REPLACE FUNCTION public.initialize_profile_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE signup_at timestamptz;
BEGIN
  SELECT u.created_at INTO signup_at FROM auth.users u WHERE u.id = NEW.id;
  IF signup_at IS NULL THEN
    RAISE EXCEPTION 'No existe una fecha de alta válida para el perfil' USING ERRCODE = '23503';
  END IF;
  NEW.trial_ends_at := signup_at + interval '30 days';
  NEW.created_at := signup_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_profile_trial() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER zz_initialize_profile_trial
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.initialize_profile_trial();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, country, created_at, trial_ends_at)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, ''), NEW.raw_user_meta_data->>'country', NEW.created_at, NEW.created_at + interval '30 days')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();