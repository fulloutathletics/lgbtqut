-- Lock down image editing to authenticated users only.
-- The previous migrations opened storage and table image-column writes to
-- the anon role, which meant anyone with the public anon key (embedded in
-- the client bundle) could upload, replace, delete images and point any
-- row's image_url at an arbitrary URL. This restricts all of those to
-- authenticated users.

-- ── Storage bucket: app-images ──
drop policy if exists "manage app-images insert" on storage.objects;
drop policy if exists "manage app-images update" on storage.objects;
drop policy if exists "manage app-images delete" on storage.objects;
drop policy if exists "authd upload app-images" on storage.objects;
drop policy if exists "authd update app-images" on storage.objects;
drop policy if exists "authd delete app-images" on storage.objects;

-- Public read so images display without auth
create policy "read app-images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'app-images');

-- Only signed-in users can write/delete
create policy "authd insert app-images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'app-images');

create policy "authd update app-images" on storage.objects
  for update to authenticated
  using (bucket_id = 'app-images')
  with check (bucket_id = 'app-images');

create policy "authd delete app-images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'app-images');

-- ── Table image-column updates ──
-- Revoke the anon grants and open-to-all policies from the previous migration.
revoke update (image_url) on public.splash_tabs from anon;
revoke update (image_url) on public.resources from anon;
revoke update (image_url, background_url) on public.businesses from anon;
revoke update (image_url, header_url) on public.hosts from anon;
revoke update (image_url) on public.events from anon;

-- Drop the "anyone may update image columns" policies (granted to anon, authenticated)
drop policy if exists "anyone may update image columns" on public.splash_tabs;
drop policy if exists "anyone may update image columns" on public.resources;
drop policy if exists "anyone may update image columns" on public.businesses;
drop policy if exists "anyone may update image columns" on public.hosts;
drop policy if exists "anyone may update image columns" on public.events;

-- Replace with authenticated-only policies
create policy "authd update image columns" on public.splash_tabs
  for update to authenticated using (true) with check (true);
create policy "authd update image columns" on public.resources
  for update to authenticated using (true) with check (true);
create policy "authd update image columns" on public.businesses
  for update to authenticated using (true) with check (true);
create policy "authd update image columns" on public.hosts
  for update to authenticated using (true) with check (true);
create policy "authd update image columns" on public.events
  for update to authenticated using (true) with check (true);