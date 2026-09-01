-- A personal profile gets a face, a background, and an age rating.
--
-- Three things, all on social_profiles:
--
--   media        avatar_url / header_url may now point at pictures the person
--                uploaded themselves. They go into a bucket of their own,
--                profile-media, where a session may only write inside the
--                folder named after its own auth.uid(). A trigger refuses any
--                other origin for those two columns, so a profile can never
--                hotlink an arbitrary host (a tracking pixel, an image that
--                changes after review). A `preset:` token names one of the
--                app's built-in backgrounds instead of a file.
--
--   18+ rating   age_rating is computed, never chosen directly. It is '18+'
--                when the owner marks the profile adult_content, or when any
--                link on it points at an adult-only platform. The link check
--                lives in is_adult_link() and is mirrored client-side so the
--                editor can warn before saving; keep the two lists the same.
--
--   restriction  A rated profile is readable only by adults (date of birth
--                on the account, 18 or over) and by its owner, enforced in
--                the select policy. Posts the rated person made in their own
--                voice follow the same rule; posts they published as a page
--                they run are the page speaking and stay public. Minors are
--                never told anything was withheld — the row is simply absent.

-- ------------------------------------------------------------- columns

alter table public.social_profiles
  add column if not exists adult_content boolean not null default false,
  add column if not exists age_rating    text check (age_rating in ('18+')),
  add column if not exists age_reason    text;

create index if not exists social_profiles_age_rating_idx
  on public.social_profiles (age_rating) where age_rating is not null;

-- ------------------------------------------------------- adult links

-- Platforms whose whole purpose is adult content or adult-only meetups.
-- Matched against the host part of a link, case-insensitively. Mirrored in
-- src/lib/profile.ts as ADULT_LINK_PATTERN.
create or replace function public.is_adult_link(url text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(url, '')) ~
    '(^|[/.@\s])(onlyfans|fansly|justfor\.?fans|loyalfans|manyvids|fancentro|fanvue|admireme|unlockt|4my\.?fans|clips4sale|iwantclips|sextpanther|pornhub|xvideos|xhamster|redtube|youporn|brazzers|chaturbate|myfreecams|stripchat|cam4|livejasmin|bongacams|adultfriendfinder|sniffies|grindr|scruff|recon|feeld|rentmen|tryst)\.(com|net|co|xxx|tv|app|io|me|to)(/|$|\s)'
$$;

create or replace function public.rate_social_profile()
returns trigger
language plpgsql
as $$
declare
  spicy text;
  origin text := '/storage/v1/object/public/profile-media/' || new.id::text || '/';
begin
  -- Media may only come from this person's own folder, or be a preset.
  if new.avatar_url is not null and new.avatar_url !~ ('^https?://[^/]+' || origin) then
    raise exception 'avatar_url must be an image uploaded by this profile';
  end if;
  if new.header_url is not null
     and new.header_url !~ ('^https?://[^/]+' || origin)
     and new.header_url !~ '^preset:[a-z0-9-]+$' then
    raise exception 'header_url must be an uploaded image or a preset';
  end if;

  select l into spicy
    from unnest(coalesce(new.social_links, '{}'::text[]) || array[coalesce(new.website, '')]) as l
   where public.is_adult_link(l)
   limit 1;

  if new.adult_content then
    new.age_rating := '18+';
    new.age_reason := 'Marked as adult by its owner';
  elsif spicy is not null then
    new.age_rating := '18+';
    new.age_reason := 'Links to an adult-only platform';
  else
    new.age_rating := null;
    new.age_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists social_profiles_rate on public.social_profiles;
create trigger social_profiles_rate
  before insert or update on public.social_profiles
  for each row execute function public.rate_social_profile();

-- Re-rate anything already there. The trigger recomputes on any update.
update public.social_profiles set updated_at = updated_at;

-- ------------------------------------------------------- who may read

-- Eighteen or over by the date of birth on the account. SECURITY DEFINER so
-- a policy can consult profiles.dob without granting readers the column.
create or replace function public.viewer_is_adult()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.dob <= (current_date - interval '18 years')
  );
$$;

-- Whether a person's profile carries a rating, readable regardless of
-- whether the caller may see the profile itself (so a post's policy can
-- ask without the answer depending on the asker).
create or replace function public.author_is_rated(author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.social_profiles s
     where s.id = author and s.age_rating is not null
  );
$$;

drop policy if exists "social profiles visible to all" on public.social_profiles;
create policy "social profiles visible to all"
  on public.social_profiles for select
  to anon, authenticated
  using (
    visibility in ('visible', 'discoverable')
    and (age_rating is null or public.viewer_is_adult())
  );

-- A rated person's own-voice posts are for adults; what they post as a page
-- is the page's, and stays public.
drop policy if exists "posts are readable" on public.posts;
create policy "posts are readable"
  on public.posts for select
  to anon, authenticated
  using (
    author_kind is not null
    or author_id = auth.uid()
    or not public.author_is_rated(author_id)
    or public.viewer_is_adult()
  );

-- -------------------------------------------------------- profile media

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read profile-media" on storage.objects;
create policy "public read profile-media"
  on storage.objects for select
  using (bucket_id = 'profile-media');

-- Each person writes only inside the folder named after their own id.
drop policy if exists "own folder insert profile-media" on storage.objects;
create policy "own folder insert profile-media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own folder update profile-media" on storage.objects;
create policy "own folder update profile-media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder delete profile-media" on storage.objects;
create policy "own folder delete profile-media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
