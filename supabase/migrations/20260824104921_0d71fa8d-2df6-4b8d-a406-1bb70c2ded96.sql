-- 1. Lock down SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- has_role must stay executable by authenticated: RLS policies evaluate it as the caller
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. app_config: restrict reads to signed-in users
DROP POLICY IF EXISTS "Anyone reads config" ON public.app_config;
REVOKE ALL ON public.app_config FROM anon;
CREATE POLICY "Signed-in users read config"
ON public.app_config FOR SELECT TO authenticated USING (true);

-- 3. storage.objects policies for the private sponsors bucket
CREATE POLICY "Authenticated read sponsor files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'sponsors');

CREATE POLICY "Admins upload sponsor files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sponsors' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update sponsor files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'sponsors' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'sponsors' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete sponsor files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'sponsors' AND public.has_role(auth.uid(), 'admin'));