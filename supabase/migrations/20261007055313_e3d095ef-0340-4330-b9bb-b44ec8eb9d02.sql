CREATE OR REPLACE FUNCTION public.get_live_beacon(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'name', b.name, 'status', b.status, 'expires_at', b.expires_at, 'last_seen_at', b.last_seen_at,
    'last_lat', b.last_lat, 'last_lon', b.last_lon, 'battery_pct', b.battery_pct,
    'points', COALESCE((SELECT jsonb_agg(jsonb_build_array(p.lat, p.lon) ORDER BY p.recorded_at)
      FROM (SELECT lat, lon, recorded_at FROM public.beacon_points WHERE beacon_id = b.id ORDER BY recorded_at DESC LIMIT 2000) p), '[]'::jsonb))
  FROM public.safety_beacons b
  WHERE b.share_token = _token AND length(_token) >= 32 AND b.expires_at > now()
$$;
REVOKE ALL ON FUNCTION public.get_live_beacon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_live_beacon(text) TO anon, authenticated;