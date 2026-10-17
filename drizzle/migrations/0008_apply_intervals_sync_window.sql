DO $configure$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job WHERE jobname = 'intervals-sync-15min' LOOP
    IF j.command NOT LIKE '%public.intervals_sync_window(now())%' THEN
      PERFORM cron.alter_job(j.jobid, command := format($wrapper$DO $job$ BEGIN IF public.intervals_sync_window(now()) THEN EXECUTE %L; END IF; END $job$;$wrapper$, j.command));
    END IF;
  END LOOP;
END;
$configure$;