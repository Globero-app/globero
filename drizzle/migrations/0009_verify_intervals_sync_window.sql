DO $test$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('summer before opening','2026-10-17T04:15:00Z'::timestamptz,false),
    ('summer opening 06:30','2026-10-17T04:30:00Z'::timestamptz,true),
    ('summer closing 23:30','2026-10-17T21:30:00Z'::timestamptz,true),
    ('summer after closing','2026-10-17T21:45:00Z'::timestamptz,false),
    ('winter before opening','2026-12-17T05:15:00Z'::timestamptz,false),
    ('winter opening 06:30','2026-12-17T05:30:00Z'::timestamptz,true),
    ('winter closing 23:30','2026-12-17T22:30:00Z'::timestamptz,true),
    ('winter after closing','2026-12-17T22:45:00Z'::timestamptz,false),
    ('Madrid midnight','2026-10-17T22:00:00Z'::timestamptz,false)
  ) AS cases(label,instant,expected) LOOP
    IF public.intervals_sync_window(c.instant) IS DISTINCT FROM c.expected THEN
      RAISE EXCEPTION 'Intervals sync window failed: %',c.label;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='intervals-sync-15min' AND schedule='*/15 * * * *' AND active AND command LIKE '%IF public.intervals_sync_window(now()) THEN EXECUTE%') THEN
    RAISE EXCEPTION 'Intervals sync schedule must preserve 15 minute cadence and Madrid guard';
  END IF;
END;
$test$;