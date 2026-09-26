-- Link rules and automated moderation.
--
-- Two layers, so the cheap and certain answers never wait on a model:
--
--   known domains   Decided here, in the database, on every write. A link to
--                   an adult platform rates the profile 18+ (as before); a
--                   link-in-bio page (Linktree, Beacons, bio.link, …) is
--                   refused outright, on a profile or in a post or reply. A
--                   link-in-bio page is where the other links go to hide, so
--                   the rule stays checkable only if the links are listed
--                   here directly. Mirrored in src/lib/profile.ts and
--                   supabase/functions/_shared/links.ts — keep all three in
--                   step.
--
--   everything else The `moderate` Edge Function, called by pg_net after the
--                   write lands:
--                     links  An unfamiliar domain, or one whose name only
--                            hints (`fans`, `jff`, `link`, `bio`), is resolved
--                            (redirects followed, page title read) and put to
--                            Jev. The verdict is cached in link_checks, per
--                            link, and reused for every profile that has it.
--                     text   Posts, replies, bios and display names go to
--                            OpenAI's moderation endpoint and to Jev at once.
--                            OpenAI scores the standard harms; Jev answers
--                            this app's own questions (is a slur reclaimed or
--                            aimed? is this solicitation? is someone being
--                            outed?). Hiding needs both to agree, except for
--                            the unambiguous cases.
--                   Results land in moderation_flags, the reviewers' queue.
--
-- Fail-open by design: if the function or a provider is down, content stays
-- up and the known-domain rules still hold. Nothing here blocks a write on a
-- network call.

create extension if not exists pg_net;

-- ------------------------------------------------------------ link shape

-- A link as stored: lower case, no scheme, no leading www., no query or
-- fragment, no trailing slash. Links are stored this way already
-- (normalizeLink); this makes the comparison exact for anything older.
create or replace function public.link_key(url text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce(url, ''))), '^[a-z][a-z0-9+.-]*://', ''),
        '^www\.', ''),
      '[?#].*$', ''),
    '/+$', ''),
  '')
$$;

-- The host alone: no path, port or user@.
create or replace function public.link_host(url text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(split_part(split_part(coalesce(public.link_key(url), ''), '/', 1), ':', 1), '^.*@', ''), '')
$$;

-- ------------------------------------------------------- known domains

-- Platforms whose whole purpose is adult content or adult-only meetups,
-- matched on the host (subdomains included), plus the adult-only TLDs.
-- Replaces the pattern from profile_media_and_adult_profiles, which missed
-- justfor.fans (its TLD is .fans) and anything with www. in front.
create or replace function public.is_adult_link(url text)
returns boolean
language sql
immutable
as $$
  select coalesce(public.link_host(url), '') ~
    ('(^|\.)('
     || 'onlyfans|fansly|justforfans|loyalfans|manyvids|fancentro|fanvue|fanhouse|admireme|unlockt|4myfans|'
     || 'clips4sale|iwantclips|sextpanther|pornhub|xvideos|xhamster|redtube|youporn|brazzers|'
     || 'chaturbate|myfreecams|stripchat|cam4|livejasmin|bongacams|adultfriendfinder|'
     || 'sniffies|grindr|scruff|recon|feeld|rentmen|tryst'
     || ')\.(com|net|co|xxx|tv|app|io|me|to|vip|fans|gg|club)$'
     || '|(^|\.)justfor\.fans$'
     || '|\.(xxx|porn|adult|sex)$')
$$;

-- Link-in-bio pages. Matched on the host, subdomains included.
create or replace function public.is_link_in_bio(url text)
returns boolean
language sql
immutable
as $$
  select coalesce(public.link_host(url), '') ~
    ('(^|\.)('
     || 'linktr\.ee|linktree\.com|beacons\.ai|beacons\.page|bio\.link|linkin\.bio|lnk\.bio|linkbio\.co|'
     || 'allmylinks\.com|campsite\.bio|solo\.to|taplink\.cc|taplink\.at|tap\.bio|bio\.site|hoo\.be|'
     || 'milkshake\.app|msha\.ke|komi\.io|snipfeed\.co|linkpop\.com|many\.link|bento\.me|linkr\.bio|'
     || 'hopp\.bio|link\.me|heylink\.me|contactin\.bio|direct\.me|flow\.page|linkfly\.to|linkme\.bio|'
     || 'carrd\.co|withkoji\.com|koji\.to|stan\.store|linkbun\.ch|biolinky\.co|shor\.by|'
     || 'getallmylinks\.com|linkinprofile\.com|linkinbio\.com|url\.bio|joy\.link'
     || ')$')
$$;

-- Link-looking tokens in free text (a bio, a post). Deliberately loose on
-- scheme but strict on shape: a dot must be followed by a real-looking TLD,
-- and trailing punctuation ("see linktr.ee/me.") is not part of the link.
create or replace function public.links_in_text(body text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(m[1]), '{}')
    from regexp_matches(coalesce(body, ''),
      '((https?://)?([a-z0-9-]+\.)+(com|net|org|io|co|me|ee|bio|link|page|site|app|ai|fans|xxx|porn|to|cc|gg|vip|store|tv|at|ch|be|by|us|club|lgbt)(/[^\s)>"'']*[^\s)>"''.,!?;:])?)(?![a-z0-9-])',
      'gi') as m
$$;

-- ------------------------------------------------------------ verdicts

-- One row per link the rules above could not settle. Service role only;
-- the rating trigger reads it as definer.
create table if not exists public.link_checks (
  link          text primary key,              -- link_key() form
  status        text not null default 'pending' check (status in ('pending', 'done', 'error')),
  final_host    text,                           -- after redirects
  adult         boolean,
  link_in_bio   boolean,
  adult_p       real,                           -- Jev's probabilities, for review
  link_in_bio_p real,
  source        text,                           -- 'rules' | 'jev' | 'allowlist'
  checked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists link_checks_final_host_idx on public.link_checks (final_host) where status = 'done';

alter table public.link_checks enable row level security;
revoke all on public.link_checks from anon, authenticated;

create or replace function public.link_verdict_adult(url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_adult_link(url)
      or exists (select 1 from public.link_checks c where c.link = public.link_key(url) and c.adult)
$$;

create or replace function public.link_verdict_bio(url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_link_in_bio(url)
      or exists (select 1 from public.link_checks c where c.link = public.link_key(url) and c.link_in_bio)
$$;

-- Unknown links go on the list; the insert trigger below hands them to the
-- function.
create or replace function public.queue_link_checks(links text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.link_checks (link)
  select distinct public.link_key(l)
    from unnest(coalesce(links, '{}')) as l
   where public.link_key(l) is not null
     and not public.is_adult_link(l)
     and not public.is_link_in_bio(l)
  on conflict (link) do nothing
$$;

revoke all on function public.link_verdict_adult(text) from public;
revoke all on function public.link_verdict_bio(text) from public;
revoke all on function public.queue_link_checks(text[]) from public;

-- ------------------------------------------------------ calling the hook

-- Posts a job to the `moderate` Edge Function. Needs two Vault secrets
-- (see README → Moderation); without them it does nothing, so a fresh
-- database or a local one works without the function deployed.
create or replace function public.moderation_hook(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'moderation_hook_secret';
  if base is null or secret is null then return; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/moderate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-moderation-secret', secret),
    body := payload,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.moderation_hook(jsonb) from public;

create or replace function public.link_checks_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.moderation_hook(jsonb_build_object('kind', 'link', 'link', new.link));
  return null;
end;
$$;

drop trigger if exists link_checks_enqueue on public.link_checks;
create trigger link_checks_enqueue
  after insert on public.link_checks
  for each row when (new.status = 'pending')
  execute function public.link_checks_enqueue();

-- ------------------------------------------------------ moderation state

-- Set only by the moderate function (service role) or a reviewer.
alter table public.posts
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_reason text,
  add column if not exists adult         boolean not null default false;

alter table public.comments
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_reason text,
  add column if not exists adult         boolean not null default false;

-- The bio reads as adult content (or points at it: "🌶️ link", "18+ acc").
alter table public.social_profiles
  add column if not exists ai_adult boolean not null default false;

create or replace function public.keep_moderation_reviewer_only()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_table_name = 'social_profiles' then
      if tg_op = 'INSERT' then new.ai_adult := false;
      elsif new.ai_adult is distinct from old.ai_adult then
        raise exception 'ai_adult is set by moderation, not by the profile';
      end if;
    elsif tg_op = 'INSERT' then
      new.hidden_at := null; new.hidden_reason := null; new.adult := false;
    elsif new.hidden_at is distinct from old.hidden_at
       or new.hidden_reason is distinct from old.hidden_reason
       or new.adult is distinct from old.adult then
      raise exception 'moderation fields are set by moderation, not by the author';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_moderation on public.posts;
create trigger posts_guard_moderation
  before insert or update on public.posts
  for each row execute function public.keep_moderation_reviewer_only();

drop trigger if exists comments_guard_moderation on public.comments;
create trigger comments_guard_moderation
  before insert or update on public.comments
  for each row execute function public.keep_moderation_reviewer_only();

drop trigger if exists social_profiles_guard_moderation on public.social_profiles;
create trigger social_profiles_guard_moderation
  before insert or update on public.social_profiles
  for each row execute function public.keep_moderation_reviewer_only();

-- The reviewers' queue. One row per finding; the function clears its own
-- open findings for a subject before writing fresh ones, so an edit that
-- fixes a post also clears its flags.
create table if not exists public.moderation_flags (
  id            bigserial primary key,
  subject_kind  text not null check (subject_kind in ('post', 'comment', 'profile')),
  subject_id    text not null,
  author_id     uuid references public.profiles(id) on delete cascade,
  reason        text not null,        -- e.g. 'hate_or_harassment', 'link_in_bio', 'self_harm'
  action        text not null check (action in ('hidden', 'rated_18', 'removed_link', 'review', 'support')),
  detail        jsonb not null default '{}',   -- scores only, never the text
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles(id) on delete set null
);
create index if not exists moderation_flags_open_idx
  on public.moderation_flags (created_at desc) where resolved_at is null;
create index if not exists moderation_flags_subject_idx
  on public.moderation_flags (subject_kind, subject_id);

alter table public.moderation_flags enable row level security;
revoke all on public.moderation_flags from anon, authenticated;
grant select, update (resolved_at, resolved_by) on public.moderation_flags to authenticated;

drop policy if exists "reviewers read flags" on public.moderation_flags;
create policy "reviewers read flags"
  on public.moderation_flags for select
  to authenticated
  using (public.is_admin());

drop policy if exists "reviewers resolve flags" on public.moderation_flags;
create policy "reviewers resolve flags"
  on public.moderation_flags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The person is told what was done to their own things; what is merely
-- queued for a reviewer, or noted for support, is not shown to them.
drop policy if exists "authors read actions on their own" on public.moderation_flags;
create policy "authors read actions on their own"
  on public.moderation_flags for select
  to authenticated
  using (author_id = auth.uid() and action in ('hidden', 'rated_18', 'removed_link'));

-- ------------------------------------------------------ profile rating

create or replace function public.rate_social_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  links text[];
  spicy text;
  bio_link text;
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

  links := coalesce(new.social_links, '{}'::text[])
        || array[coalesce(new.website, '')]
        || public.links_in_text(new.bio);

  select l into bio_link from unnest(links) as l where l <> '' and public.link_verdict_bio(l) limit 1;
  if bio_link is not null then
    raise exception 'link-in-bio pages are not allowed: %', public.link_host(bio_link)
      using errcode = 'P0001', hint = 'link_in_bio';
  end if;

  select l into spicy from unnest(links) as l where l <> '' and public.link_verdict_adult(l) limit 1;

  if new.adult_content then
    new.age_rating := '18+';
    new.age_reason := 'Marked as adult by its owner';
  elsif spicy is not null then
    new.age_rating := '18+';
    new.age_reason := 'Links to an adult-only platform';
  elsif new.ai_adult then
    new.age_rating := '18+';
    new.age_reason := 'Its bio points to adult content';
  else
    new.age_rating := null;
    new.age_reason := null;
  end if;

  perform public.queue_link_checks(links);
  return new;
end;
$$;

-- Bio and name go to text moderation when they change.
create or replace function public.social_profiles_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.bio is distinct from old.bio
     or new.display_name is distinct from old.display_name then
    perform public.moderation_hook(jsonb_build_object('kind', 'profile', 'id', new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists social_profiles_enqueue on public.social_profiles;
create trigger social_profiles_enqueue
  after insert or update on public.social_profiles
  for each row execute function public.social_profiles_enqueue();

-- ------------------------------------------------- posts and replies

-- Known link-in-bio pages are refused here too, so a post is not the way
-- around the profile rule; a known adult link makes the post 18+.
create or replace function public.check_post_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  links text[] := public.links_in_text(new.body);
  bio_link text;
begin
  select l into bio_link from unnest(links) as l where public.link_verdict_bio(l) limit 1;
  if bio_link is not null then
    raise exception 'link-in-bio pages are not allowed: %', public.link_host(bio_link)
      using errcode = 'P0001', hint = 'link_in_bio';
  end if;
  if exists (select 1 from unnest(links) as l where public.link_verdict_adult(l)) then
    new.adult := true;
  end if;
  perform public.queue_link_checks(links);
  return new;
end;
$$;

-- Same-event triggers fire in name order: "*_guard_moderation" runs before
-- "*_links" (and before social_profiles_rate), so the guard's reset on
-- insert does not undo the adult mark.
drop trigger if exists posts_links on public.posts;
create trigger posts_links
  before insert or update of body on public.posts
  for each row execute function public.check_post_links();

drop trigger if exists comments_links on public.comments;
create trigger comments_links
  before insert or update of body on public.comments
  for each row execute function public.check_post_links();

create or replace function public.content_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    perform public.moderation_hook(jsonb_build_object(
      'kind', case tg_table_name when 'posts' then 'post' else 'comment' end,
      'id', new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists posts_enqueue on public.posts;
create trigger posts_enqueue
  after insert or update on public.posts
  for each row execute function public.content_enqueue();

drop trigger if exists comments_enqueue on public.comments;
create trigger comments_enqueue
  after insert or update on public.comments
  for each row execute function public.content_enqueue();

-- ------------------------------------------------------ who may read

-- Hidden is hidden from everyone but the author (who sees it marked) and
-- reviewers. Adult posts follow the adult-profile rule.
drop policy if exists "posts are readable" on public.posts;
create policy "posts are readable"
  on public.posts for select
  to anon, authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or (
      hidden_at is null
      and (not adult or public.viewer_is_adult())
      and (author_kind is not null or not public.author_is_rated(author_id) or public.viewer_is_adult())
    )
  );

drop policy if exists "comments are readable" on public.comments;
create policy "comments are readable"
  on public.comments for select
  to anon, authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or (hidden_at is null and (not adult or public.viewer_is_adult()))
  );

-- ------------------------------------------------ late link verdicts

-- The function calls this once Jev has ruled on a link that may already be
-- in use. A link-in-bio page comes off every profile that lists it (and
-- out of any bio), and any post or reply carrying it is hidden; an adult
-- link re-rates the profiles that list it and marks posts that carry it.
-- Each person affected gets a flag saying what happened. Service role only.
create or replace function public.apply_link_verdict(k text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.link_checks;
  r record;
  l text;
  cleaned text;
  hit boolean;
begin
  select * into v from public.link_checks where link = k and status = 'done';
  if not found or not (coalesce(v.adult, false) or coalesce(v.link_in_bio, false)) then return; end if;

  for r in
    select s.id, s.social_links, s.website, s.bio, s.age_rating
      from public.social_profiles s
     where public.link_key(s.website) = k
        or exists (select 1 from unnest(s.social_links) as x where public.link_key(x) = k)
        or exists (select 1 from unnest(public.links_in_text(s.bio)) as x where public.link_key(x) = k)
  loop
    if v.link_in_bio then
      cleaned := r.bio;
      foreach l in array public.links_in_text(r.bio) loop
        if public.link_key(l) = k then cleaned := replace(cleaned, l, ''); end if;
      end loop;
      update public.social_profiles
         set social_links = coalesce((select array_agg(x) from unnest(social_links) as x where public.link_key(x) is distinct from k), '{}'),
             website = case when public.link_key(website) = k then null else website end,
             bio = nullif(btrim(regexp_replace(coalesce(cleaned, ''), '\s{2,}', ' ', 'g')), '')
       where id = r.id;
      insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
      values ('profile', r.id::text, r.id, 'link_in_bio', 'removed_link',
              jsonb_build_object('host', public.link_host(k), 'p', v.link_in_bio_p));
    else
      update public.social_profiles set updated_at = updated_at where id = r.id;  -- re-rate
      if r.age_rating is null then
        insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
        values ('profile', r.id::text, r.id, 'adult_link', 'rated_18',
                jsonb_build_object('host', public.link_host(k), 'p', v.adult_p));
      end if;
    end if;
  end loop;

  for r in select 'post' as kind, p.id, p.author_id, p.body from public.posts p
           union all
           select 'comment', c.id, c.author_id, c.body from public.comments c
  loop
    select exists (select 1 from unnest(public.links_in_text(r.body)) as x where public.link_key(x) = k) into hit;
    continue when not hit;
    if v.link_in_bio then
      if r.kind = 'post' then
        update public.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, 'auto:link_in_bio') where id = r.id;
      else
        update public.comments set hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, 'auto:link_in_bio') where id = r.id;
      end if;
      insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
      values (r.kind, r.id::text, r.author_id, 'link_in_bio', 'hidden', jsonb_build_object('host', public.link_host(k)));
    else
      if r.kind = 'post' then
        update public.posts set adult = true where id = r.id;
      else
        update public.comments set adult = true where id = r.id;
      end if;
      insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
      values (r.kind, r.id::text, r.author_id, 'adult_link', 'rated_18', jsonb_build_object('host', public.link_host(k)));
    end if;
  end loop;
end;
$$;

revoke all on function public.apply_link_verdict(text) from public, anon, authenticated;
grant execute on function public.apply_link_verdict(text) to service_role;

-- ---------------------------------------------------- existing content

-- Link-in-bio links already on profiles come off, with a note to the
-- person, before the stricter trigger re-rates everything.
-- The rating trigger is paused while links come out of both the link list
-- and the bio, which it would otherwise refuse one at a time.
alter table public.social_profiles disable trigger social_profiles_rate;

insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
select 'profile', s.id::text, s.id, 'link_in_bio', 'removed_link', jsonb_build_object('host', public.link_host(l))
  from public.social_profiles s,
       unnest(coalesce(s.social_links, '{}'::text[]) || array[coalesce(s.website, '')]) as l
 where l <> '' and public.is_link_in_bio(l);

update public.social_profiles s
   set social_links = coalesce((select array_agg(l) from unnest(s.social_links) as l where not public.is_link_in_bio(l)), '{}'),
       website = case when public.is_link_in_bio(s.website) then null else s.website end
 where exists (select 1 from unnest(coalesce(s.social_links, '{}'::text[]) || array[coalesce(s.website, '')]) as l
                where l <> '' and public.is_link_in_bio(l));

-- A link-in-bio URL written into a bio is cut out of the text, the rest of
-- the bio kept.
do $$
declare
  r record;
  l text;
  cleaned text;
begin
  for r in select id, bio from public.social_profiles
            where exists (select 1 from unnest(public.links_in_text(bio)) as x where public.is_link_in_bio(x))
  loop
    cleaned := r.bio;
    foreach l in array public.links_in_text(r.bio) loop
      if public.is_link_in_bio(l) then
        insert into public.moderation_flags (subject_kind, subject_id, author_id, reason, action, detail)
        values ('profile', r.id::text, r.id, 'link_in_bio', 'removed_link', jsonb_build_object('host', public.link_host(l)));
        cleaned := replace(cleaned, l, '');
      end if;
    end loop;
    update public.social_profiles set bio = nullif(btrim(regexp_replace(cleaned, '\s{2,}', ' ', 'g')), '') where id = r.id;
  end loop;
end;
$$;

alter table public.social_profiles enable trigger social_profiles_rate;

-- Re-rate everything under the new rules.
update public.social_profiles set updated_at = updated_at;
