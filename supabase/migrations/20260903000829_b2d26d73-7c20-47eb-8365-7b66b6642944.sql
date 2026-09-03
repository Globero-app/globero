CREATE INDEX IF NOT EXISTS idx_workouts_user_sched ON public.workouts (user_id, ((plan->>'scheduled_date')));
CREATE INDEX IF NOT EXISTS idx_power_peaks_user_date ON public.power_peaks (user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_coach_alerts_user_date ON public.coach_alerts (user_id, alert_date DESC);
CREATE INDEX IF NOT EXISTS idx_readiness_user_date ON public.readiness_entries (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON public.notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON public.ai_usage_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notification_log WHERE created_at < now() - interval '60 days';
  DELETE FROM public.sync_log WHERE created_at < now() - interval '60 days';
  DELETE FROM public.error_log WHERE created_at < now() - interval '60 days';
  DELETE FROM public.ai_usage_log WHERE created_at < now() - interval '365 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_logs() TO service_role;

SELECT cron.unschedule('purge-old-logs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-logs');
SELECT cron.schedule('purge-old-logs', '0 4 * * 1', $$SELECT public.purge_old_logs();$$);