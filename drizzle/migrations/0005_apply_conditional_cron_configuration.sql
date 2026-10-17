DO $migration$
DECLARE j record; replacement text;
BEGIN
  FOR j IN SELECT jobid, jobname, command FROM cron.job WHERE jobname IN ('activity-detect-15min','beacon-watchdog','readiness-push-hourly') LOOP
    IF j.jobname = 'activity-detect-15min' THEN
      PERFORM cron.alter_job(j.jobid, schedule := '*/15 * * * *');
    ELSIF j.jobname = 'beacon-watchdog' AND j.command NOT LIKE '%sync_beacon_watchdog_schedule%' THEN
      replacement := format($wrapper$DO $job$ BEGIN PERFORM public.sync_beacon_watchdog_schedule(); IF EXISTS (SELECT 1 FROM public.safety_beacons WHERE status IN ('active','sos') AND expires_at > now()) THEN EXECUTE %L; END IF; END $job$;$wrapper$, j.command);
      PERFORM cron.alter_job(j.jobid, command := replacement);
    ELSIF j.jobname = 'readiness-push-hourly' AND j.command NOT LIKE '%notification_slot_due%' THEN
      replacement := format($wrapper$DO $job$ BEGIN IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.deactivated_at IS NULL AND public.notification_slot_due(p.readiness_push_hour, p.readiness_push_enabled, ARRAY[p.notify_daily_brief, p.notify_weather_alerts AND NOT COALESCE(p.notify_daily_brief,false), p.notify_prerace_push, p.notify_maintenance_push, p.notify_fatigue_alerts], now())) THEN EXECUTE %L; END IF; END $job$;$wrapper$, j.command);
      PERFORM cron.alter_job(j.jobid, command := replacement);
    END IF;
  END LOOP;
  PERFORM public.sync_beacon_watchdog_schedule();
END;
$migration$;