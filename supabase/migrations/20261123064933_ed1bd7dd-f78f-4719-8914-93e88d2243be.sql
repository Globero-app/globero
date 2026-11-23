CREATE OR REPLACE FUNCTION public.protect_subscription_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
 IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
  IF TG_OP = 'INSERT' THEN
   NEW.trial_ends_at := now() + interval '30 days'; NEW.subscription_status := 'inactive';
   NEW.stripe_customer_id := NULL; NEW.stripe_subscription_id := NULL; NEW.admin_grant_active := false;
   NEW.deactivated_at := NULL;
  ELSE
   IF ROW(NEW.trial_ends_at, NEW.subscription_status, NEW.stripe_customer_id, NEW.stripe_subscription_id, NEW.admin_grant_active)
    IS DISTINCT FROM ROW(OLD.trial_ends_at, OLD.subscription_status, OLD.stripe_customer_id, OLD.stripe_subscription_id, OLD.admin_grant_active) THEN
    RAISE EXCEPTION 'Subscription fields are server managed' USING ERRCODE = '42501';
   END IF;
   IF OLD.deactivated_at IS NOT NULL AND NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at THEN
    RAISE EXCEPTION 'Account deactivation is server managed' USING ERRCODE = '42501';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $function$;