CREATE OR REPLACE FUNCTION public.sync_beacon_watchdog_schedule()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE job_id bigint; should_run boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(170102026);
  SELECT EXISTS (SELECT 1 FROM public.safety_beacons WHERE status IN ('active', 'sos') AND expires_at > now()) INTO should_run;
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'beacon-watchdog';
  IF job_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id, active := should_run);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_beacon_watchdog_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_beacon_watchdog_schedule() TO service_role;

CREATE OR REPLACE FUNCTION public.beacon_watchdog_schedule_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM public.sync_beacon_watchdog_schedule();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.beacon_watchdog_schedule_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER beacon_watchdog_schedule_changed
AFTER INSERT OR UPDATE OR DELETE ON public.safety_beacons
FOR EACH STATEMENT EXECUTE FUNCTION public.beacon_watchdog_schedule_changed();

CREATE OR REPLACE FUNCTION public.notification_slot_due(configured_hour integer, readiness_enabled boolean, extras boolean[], instant timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(
    extract(hour FROM instant AT TIME ZONE 'Europe/Madrid')::integer = configured_hour
    AND CASE
      WHEN floor(extract(minute FROM instant AT TIME ZONE 'Europe/Madrid') / 5)::integer = 0 THEN readiness_enabled
      ELSE floor(extract(minute FROM instant AT TIME ZONE 'Europe/Madrid') / 5)::integer <=
        (SELECT count(*) FROM unnest(extras) enabled WHERE enabled IS TRUE)
    END, false);
$$;
REVOKE ALL ON FUNCTION public.notification_slot_due(integer, boolean, boolean[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_slot_due(integer, boolean, boolean[], timestamptz) TO service_role;