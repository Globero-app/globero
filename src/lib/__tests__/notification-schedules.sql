DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activity-detect-15min' AND schedule = '*/15 * * * *') THEN
    RAISE EXCEPTION 'Activity detection must run every 15 minutes';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'beacon-watchdog' AND active IS DISTINCT FROM EXISTS (SELECT 1 FROM public.safety_beacons WHERE status IN ('active','sos') AND expires_at > now())) THEN
    RAISE EXCEPTION 'Watchdog must pause without live beacons';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.safety_beacons'::regclass AND tgname = 'beacon_watchdog_schedule_changed' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Beacon changes must refresh watchdog scheduling';
  END IF;
  IF NOT public.notification_slot_due(7,true,ARRAY[true,false,false,false,false], '2026-10-17T05:00:00Z') THEN
    RAISE EXCEPTION 'Readiness must run in configured Madrid hour';
  END IF;
  IF NOT public.notification_slot_due(7,false,ARRAY[true,false,false,false,false], '2026-10-17T05:05:00Z') THEN
    RAISE EXCEPTION 'Enabled extra must run five minutes later';
  END IF;
  IF public.notification_slot_due(7,true,ARRAY[true,false,false,false,false], '2026-10-17T05:10:00Z') THEN
    RAISE EXCEPTION 'Unused slots must not call readiness';
  END IF;
  IF public.notification_slot_due(7,true,ARRAY[true,false,false,false,false], '2026-10-17T06:00:00Z') THEN
    RAISE EXCEPTION 'Other hours must not call readiness';
  END IF;
  IF public.notification_slot_due(7,false,ARRAY[false,false,false,false,false], '2026-10-17T05:00:00Z') THEN
    RAISE EXCEPTION 'Disabled notifications must not run';
  END IF;
  IF NOT public.notification_slot_due(7,true,ARRAY[false,false,false,false,false], '2026-12-17T06:00:00Z') THEN
    RAISE EXCEPTION 'Madrid winter timezone must be respected';
  END IF;
END;
$test$;