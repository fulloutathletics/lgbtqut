-- Someone administers an entity, and can speak as it.
--
-- host_assignments already gestured at this but was host-shaped: its primary
-- key included host_id, so a business-only or resource-only admin could not
-- be expressed. entity_admins addresses entities the way everything else now
-- does — (entity_kind, entity_id) — so the same person can administer the
-- resource, business and host faces of one organisation.

create table if not exists public.entity_admins (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  entity_kind public.entity_kind not null,
  entity_id   text not null,
  role        text not null default 'admin' check (role in ('admin', 'editor')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, entity_kind, entity_id)
);
create index if not exists entity_admins_entity_idx on public.entity_admins (entity_kind, entity_id);

alter table public.entity_admins enable row level security;

-- Who speaks for an entity is public — it is why a badged reply is
-- trustworthy. Granting the role is an admin action, not a self-serve one,
-- so there is deliberately no insert/update policy for end users.
drop policy if exists "assignments are readable" on public.entity_admins;
create policy "assignments are readable"
  on public.entity_admins for select to anon, authenticated using (true);

-- Does the caller administer this entity? SECURITY DEFINER so the policies
-- below can consult the table without granting readers a way around it.
create or replace function public.administers(kind public.entity_kind, id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entity_admins a
     where a.profile_id = auth.uid()
       and a.entity_kind = kind
       and a.entity_id = id
  );
$$;

-- A comment can be published under an entity's name by someone who
-- administers it. author_id still records the human behind it, so speaking
-- as an entity is attributable rather than anonymous.
alter table public.comments
  add column if not exists as_entity_kind public.entity_kind,
  add column if not exists as_entity_id   text;

alter table public.comments drop constraint if exists comments_as_entity_pair;
alter table public.comments add constraint comments_as_entity_pair check (
  (as_entity_kind is null and as_entity_id is null)
  or (as_entity_kind is not null and as_entity_id is not null)
);

-- A post presenting as an entity now also keeps the human who published it.
-- The previous constraint made those mutually exclusive, which left an
-- entity post with no author of record.
alter table public.posts drop constraint if exists posts_one_author;
alter table public.posts add constraint posts_one_author check (
  author_id is not null or (author_kind is not null and author_entity_id is not null)
);

-- Writing as an entity requires administering it.
drop policy if exists "own comment insertable" on public.comments;
create policy "own comment insertable"
  on public.comments for insert to authenticated
  with check (
    auth.uid() = author_id
    and (as_entity_id is null or public.administers(as_entity_kind, as_entity_id))
  );

drop policy if exists "own post insertable" on public.posts;
create policy "own post insertable"
  on public.posts for insert to authenticated
  with check (
    auth.uid() = author_id
    and (author_entity_id is null or public.administers(author_kind, author_entity_id))
  );
