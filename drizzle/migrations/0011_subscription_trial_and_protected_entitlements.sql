ALTER TABLE public.profiles
 ADD COLUMN trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
 ADD COLUMN subscription_status text NOT NULL DEFAULT 'inactive',
 ADD COLUMN stripe_customer_id text,
 ADD COLUMN stripe_subscription_id text,
 ADD COLUMN admin_grant_active boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET trial_ends_at = now() + interval '30 days';
CREATE UNIQUE INDEX profiles_stripe_customer_unique ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX profiles_stripe_subscription_unique ON public.profiles(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.protect_subscription_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
  IF TG_OP = 'INSERT' THEN
   NEW.trial_ends_at := now() + interval '30 days'; NEW.subscription_status := 'inactive';
   NEW.stripe_customer_id := NULL; NEW.stripe_subscription_id := NULL; NEW.admin_grant_active := false;
  ELSIF ROW(NEW.trial_ends_at, NEW.subscription_status, NEW.stripe_customer_id, NEW.stripe_subscription_id, NEW.admin_grant_active)
   IS DISTINCT FROM ROW(OLD.trial_ends_at, OLD.subscription_status, OLD.stripe_customer_id, OLD.stripe_subscription_id, OLD.admin_grant_active) THEN
   RAISE EXCEPTION 'Subscription fields are server managed' USING ERRCODE = '42501';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_subscription_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields();
CREATE OR REPLACE FUNCTION public.can_generate_for_user(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND deactivated_at IS NULL
  AND (admin_grant_active OR subscription_status = 'active' OR trial_ends_at > now()));
$$;
REVOKE ALL ON FUNCTION public.can_generate_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_generate_for_user(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.enforce_generation_entitlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.can_generate_for_user(NEW.user_id) THEN
  RAISE EXCEPTION 'Tu prueba gratuita ha finalizado. Activa una suscripción en Ajustes para generar entrenamientos y menús.' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER workouts_generation_entitlement BEFORE INSERT ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.enforce_generation_entitlement();
CREATE TRIGGER nutrition_generation_entitlement BEFORE INSERT OR UPDATE OF plan ON public.weekly_nutrition_plans FOR EACH ROW EXECUTE FUNCTION public.enforce_generation_entitlement();
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.profiles (id, email, full_name, country, trial_ends_at)
 VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.raw_user_meta_data->>'country', NEW.created_at + interval '30 days');
 INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;