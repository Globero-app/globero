REVOKE ALL ON public.job_runs FROM anon, authenticated;
GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

DROP POLICY IF EXISTS "Authenticated read sponsor files" ON storage.objects;
CREATE POLICY "Read active sponsor files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'sponsors' AND (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.sponsors s WHERE s.active AND s.logo_url LIKE '%' || storage.objects.name)
  )
);