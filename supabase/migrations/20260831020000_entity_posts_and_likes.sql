-- Posts can now be authored either by a user (author_id) or by a directory
-- entity — a resource, business or host (author_kind + author_entity_id).
-- Reuses the existing public.entity_kind enum so this matches how `saves`
-- already addresses entities as (kind, entity_id).
--
-- Entity posts have no auth.users row behind them; they are published by
-- whoever administers that listing. Exactly one author shape is allowed per
-- row, enforced by a check rather than by convention.

alter table public.posts alter column author_id drop not null;

alter table public.posts
  add column if not exists author_kind      public.entity_kind,
  add column if not exists author_entity_id text;

alter table public.posts
  drop constraint if exists posts_one_author;
alter table public.posts
  add constraint posts_one_author check (
    (author_id is not null and author_kind is null and author_entity_id is null)
    or
    (author_id is null and author_kind is not null and author_entity_id is not null)
  );

create index if not exists posts_entity_author_idx
  on public.posts (author_kind, author_entity_id);

-- Likes. One row per person per post; the count is a simple aggregate.
create table if not exists public.post_likes (
  post_id    bigint not null references public.posts(id) on delete cascade,
  profile_id uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

-- Counts are public; a like is only ever written or removed by its owner.
drop policy if exists "likes are readable" on public.post_likes;
create policy "likes are readable"
  on public.post_likes for select
  to anon, authenticated
  using (true);

drop policy if exists "own like insertable" on public.post_likes;
create policy "own like insertable"
  on public.post_likes for insert
  to authenticated
  with check (auth.uid() = profile_id);

drop policy if exists "own like deletable" on public.post_likes;
create policy "own like deletable"
  on public.post_likes for delete
  to authenticated
  using (auth.uid() = profile_id);
