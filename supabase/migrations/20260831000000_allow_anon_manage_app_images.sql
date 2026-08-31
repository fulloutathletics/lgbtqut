-- The /upload image manager (not linked from any nav — its URL is the only
-- guard) needs to add/replace/delete app-images without a full user sign-in:
-- there is no admin-account concept in this app yet, and requiring one would
-- mean provisioning a real account just to swap a splash image before
-- launch. Until a real admin check exists, allow the anon role the same
-- write access as authenticated. This trades the storage bucket's write
-- access for anyone holding the publishable key (i.e. anyone who loads the
-- site) — acceptable pre-launch, but revisit before this becomes a
-- permanent, unauthenticated content-management surface on a live site.

drop policy if exists "authd upload app-images" on storage.objects;
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
