drop policy if exists "Signed-in users read config" on public.app_config;
create policy "Signed-in users read config" on public.app_config
for select to authenticated using (id = 1);

drop policy if exists "Sponsors are viewable by everyone" on public.sponsors;
create policy "Sponsors are viewable by everyone" on public.sponsors
for select to anon, authenticated using (active = true);

drop policy if exists "Read active sponsor files" on storage.objects;
create policy "Read active sponsor files" on storage.objects
for select to authenticated using (
  bucket_id = 'sponsors'
  and (owner_id = (select auth.uid()::text) or has_role(auth.uid(), 'admin'::app_role))
);