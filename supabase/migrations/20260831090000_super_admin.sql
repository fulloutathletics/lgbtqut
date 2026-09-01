/*
# Super-admin role

## Overview
Adds an app-level super-admin flag so directory content (splash tabs,
resources, businesses, hosts, events, crisis lines, the image-label tables)
and the app-images bucket can be managed from inside the app instead of the
Supabase dashboard.

- `profiles.is_admin` — the flag. Readable by its owner (so the client can
  gate the admin UI) but NOT client-writable: there is no UPDATE grant on the
  column, so it can only be set via the service role / SQL. Nobody can
  promote themselves.
- `public.is_admin()` — SECURITY DEFINER helper used by every policy below.
  Definer mode also sidesteps RLS recursion when policies on `profiles`
  themselves call it.
- Admins get full CRUD on every content table, may read all profiles (to
  look up accounts when granting entity admin roles), may manage
  `entity_admins` / `host_assignments`, and may delete posts, comments and
  reviews (moderation).

## Lockdown
The earlier `allow_anon_manage_app_images` / `allow_public_image_column_updates`
stopgaps let ANONYMOUS clients update image columns and write to the
app-images bucket. Those existed only because there was no admin role; they
are dropped here and replaced with admin-gated equivalents. Public read
access is unchanged everywhere.
*/

-- ------------------------------------------------------------------ flag

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Owner may see the flag (client gates the admin UI on it); no UPDATE grant
-- on the column anywhere, so it is service-role-only to change.
grant select (is_admin) on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- --------------------------------------------------- content tables: CRUD

do $$
declare
  t text;
begin
  foreach t in array array[
    'splash_tabs', 'resources', 'businesses', 'hosts', 'events',
    'crisis_lines', 'county_images', 'community_images', 'category_images',
    'event_polls', 'entity_admins', 'host_assignments'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "admins manage %s" on public.%I', t, t);
    execute format(
      'create policy "admins manage %s" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- bigserial tables need their sequences for inserts.
grant usage, select on sequence public.crisis_lines_id_seq  to authenticated;
grant usage, select on sequence public.event_polls_id_seq   to authenticated;

-- Admins can look up any account (safe columns only — the column grants on
-- profiles still exclude recovery_email).
drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------- moderation

drop policy if exists "admins moderate event comments" on public.event_comments;
create policy "admins moderate event comments" on public.event_comments
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins moderate event reviews" on public.event_reviews;
create policy "admins moderate event reviews" on public.event_reviews
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins moderate posts" on public.posts;
create policy "admins moderate posts" on public.posts
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins moderate comments" on public.comments;
create policy "admins moderate comments" on public.comments
  for delete to authenticated using (public.is_admin());

-- ------------------------------------ drop the anonymous-write stopgaps

do $$
declare
  t text;
begin
  foreach t in array array[
    'splash_tabs', 'resources', 'businesses', 'hosts', 'events',
    'county_images', 'community_images', 'category_images'
  ] loop
    execute format('drop policy if exists "anyone may update image columns" on public.%I', t);
  end loop;
  foreach t in array array['county_images', 'community_images', 'category_images'] loop
    execute format('drop policy if exists "anyone may insert" on public.%I', t);
  end loop;
end $$;

revoke insert, update, delete on
  public.splash_tabs, public.resources, public.businesses, public.hosts,
  public.events, public.crisis_lines, public.county_images,
  public.community_images, public.category_images, public.event_polls,
  public.entity_admins, public.host_assignments
from anon;

-- ------------------------------------------------- storage: admin uploads

drop policy if exists "manage app-images insert" on storage.objects;
drop policy if exists "manage app-images update" on storage.objects;
drop policy if exists "manage app-images delete" on storage.objects;
drop policy if exists "authd upload app-images"  on storage.objects;
drop policy if exists "authd update app-images"  on storage.objects;
drop policy if exists "authd delete app-images"  on storage.objects;

create policy "admins upload app-images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'app-images' and public.is_admin());

create policy "admins update app-images"
  on storage.objects for update to authenticated
  using (bucket_id = 'app-images' and public.is_admin())
  with check (bucket_id = 'app-images' and public.is_admin());

create policy "admins delete app-images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'app-images' and public.is_admin());

-- ------------------------------------------------------------- first admin

update public.profiles set is_admin = true where login_username = 'jordanjackson2';
