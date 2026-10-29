CREATE OR REPLACE FUNCTION public.notify_trial_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE callback_token text;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.trial_ends_at, NEW.subscription_status, NEW.admin_grant_active, NEW.deactivated_at)
    IS NOT DISTINCT FROM ROW(OLD.trial_ends_at, OLD.subscription_status, OLD.admin_grant_active, OLD.deactivated_at) THEN
    RETURN NEW;
  END IF;
  SELECT token INTO callback_token FROM public.cron_auth WHERE id = 1;
  IF callback_token IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://coach.globero.app/api/public/hooks/trial-lifecycle',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', callback_token),
      body := jsonb_build_object('userId', NEW.id),
      timeout_milliseconds := 10000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Trial lifecycle notification could not be scheduled';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_trial_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_trial_lifecycle() TO service_role;
CREATE TRIGGER trial_notice_lifecycle AFTER INSERT OR UPDATE OF trial_ends_at, subscription_status, admin_grant_active, deactivated_at
ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.notify_trial_lifecycle();