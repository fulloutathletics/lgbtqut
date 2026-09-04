-- Re-open image editing to anon for pre-launch content updates.
-- This is intentionally permissive so images can be managed without signing in
-- during the pre-launch phase. Lock down to authenticated before going live.

-- ── Storage bucket: app-images ──
drop policy if exists "read app-images" on storage.objects;
drop policy if exists "authd insert app-images" on storage.objects;
drop policy if exists "authd update app-images" on storage.objects;
drop policy if exists "authd delete app-images" on storage.objects;

create policy "manage app-images insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'app-images');
create policy "manage app-images update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'app-images')
  with check (bucket_id = 'app-images');
create policy "manage app-images delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'app-images');
create policy "read app-images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'app-images');

-- ── Table image-column updates ──
drop policy if exists "authd update image columns" on public.splash_tabs;
drop policy if exists "authd update image columns" on public.resources;
drop policy if exists "authd update image columns" on public.businesses;
drop policy if exists "authd update image columns" on public.hosts;
drop policy if exists "authd update image columns" on public.events;

-- Re-grant column update privileges to anon
grant update (image_url) on public.splash_tabs to anon;
grant update (image_url) on public.resources to anon;
grant update (image_url, background_url) on public.businesses to anon;
grant update (image_url, header_url) on public.hosts to anon;
grant update (image_url) on public.events to anon;

create policy "anyone may update image columns" on public.splash_tabs
  for update to anon, authenticated using (true) with check (true);
create policy "anyone may update image columns" on public.resources
  for update to anon, authenticated using (true) with check (true);
create policy "anyone may update image columns" on public.businesses
  for update to anon, authenticated using (true) with check (true);
create policy "anyone may update image columns" on public.hosts
  for update to anon, authenticated using (true) with check (true);
create policy "anyone may update image columns" on public.events
  for update to anon, authenticated using (true) with check (true);