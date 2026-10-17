CREATE OR REPLACE FUNCTION public.intervals_sync_window(instant timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT (instant AT TIME ZONE 'Europe/Madrid')::time BETWEEN time '06:30' AND time '23:30';
$$;
REVOKE ALL ON FUNCTION public.intervals_sync_window(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intervals_sync_window(timestamptz) TO service_role;
COMMENT ON FUNCTION public.intervals_sync_window(timestamptz) IS 'Intervals sync callback allowed only from 06:30 through 23:30 Europe/Madrid, including DST changes.';