-- LGBTQ.UT initial schema.
--
-- Two rules from the auth handoff spec are load-bearing here:
--   1. No table ever holds a raw email address. `profiles.email_hash` is an
--      HMAC over the normalized address with a pepper held in Vault; the alias
--      is the Supabase Auth identity. Do not add an email column, not even
--      nullable, not even temporarily.
--   2. `email_hash` and `alias` are withheld at the GRANT level, not just by
--      policy. A permissive select policy still exposes every column the role
--      can reach, so those two are touched only by the service role inside
--      Edge Functions.

create extension if not exists citext;

-- ---------------------------------------------------------------- accounts

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email_hash bytea  not null unique,  -- HMAC-SHA256(normalized address, pepper)
  alias      text   not null unique,  -- chosen-twist-631@anonymous.appuser.io
  username   citext not null unique,
  dob        date   not null,         -- stored raw; 18+/21+ evaluated at read time
  hide_adult boolean not null default false,
  pause_all  boolean not null default false,
  theme      text not null default 'Rainbow',
  created_at timestamptz not null default now()
);

-- Separate row so the public face can be deleted without destroying the account.
create table public.public_profiles (
  id           uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  pronouns     text,
  county       text,
  bio          text,
  links        text[] not null default '{}',
  avatar_url   text,
  header_url   text,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- content

create table public.splash_tabs (
  id        text primary key,
  name      text not null,
  subtitle  text not null default '',
  image_url text not null default '',
  position  int  not null default 0   -- home cards render in source order, not alphabetized
);

create table public.resources (
  id          text primary key,
  name        text not null,
  category    text not null default '',
  county      text not null default '',
  counties    text[] not null default '{}',
  communities text[] not null default '{}',
  image_url   text not null default '',
  description text not null default '',
  website     text not null default '',
  telephone   text not null default '',
  email       text not null default '',
  address     text not null default '',
  facebook    text not null default '',
  instagram   text not null default '',
  verified    boolean not null default false,
  age_rating  text,                    -- '18+' | '21+' | null
  age_reason  text
);
create index resources_county_idx   on public.resources using gin (counties);
create index resources_category_idx on public.resources (category);

create table public.businesses (
  id             text primary key,
  name           text not null,
  county         text not null default '',
  image_url      text not null default '',
  background_url text not null default '',
  color          text not null default '#7A2FA6',
  address        text not null default '',
  website        text not null default '',
  telephone      text not null default '',
  email          text not null default '',
  map_url        text not null default '',
  tags           text[] not null default '{}',
  rating         numeric not null default 0,
  review_count   int not null default 0,
  verified       boolean not null default false,
  longitude      double precision,
  latitude       double precision,
  -- Backend-configured page layout. `sections` holds at most 2 entries of
  -- { title, sub, layout:{type,size,orient}, items:[...] } — presentation is
  -- data, not code. See the handoff README, "Business detail".
  coupons        jsonb not null default '[]'::jsonb,
  sections       jsonb not null default '[]'::jsonb,
  age_rating     text,
  age_reason     text
);

create table public.hosts (
  id                  text primary key,
  name                text not null,
  image_url           text not null default '',
  header_url          text not null default '',
  bio                 text not null default '',
  verified            boolean not null default false,
  linked_business_id  text references public.businesses(id) on delete set null,
  linked_resource_id  text references public.resources(id) on delete set null
);

create table public.events (
  id          text primary key,
  host_id     text not null references public.hosts(id) on delete cascade,
  name        text not null,
  date_label  text not null default '',
  starts_on   date not null,
  description text not null default '',
  image_url   text not null default '',
  age_rating  text,
  age_reason  text
);
create index events_starts_on_idx on public.events (starts_on);

create table public.crisis_lines (
  id           bigserial primary key,
  name         text not null unique,   -- the seed upserts on this
  description  text not null default '',
  action_label text not null default '',
  telephone    text not null default '',
  position     int not null default 0
);

-- ------------------------------------------------------------ user-owned

-- Entity access is granted by an admin, never self-claimed.
create table public.host_assignments (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  host_id     text references public.hosts(id) on delete cascade,
  business_id text references public.businesses(id) on delete cascade,
  resource_id text references public.resources(id) on delete cascade,
  primary key (profile_id, host_id)
);

create type public.entity_kind as enum ('resource', 'business', 'host');

create table public.saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       public.entity_kind not null,
  entity_id  text not null,
  -- Saving subscribes to all three channels by default.
  events     boolean not null default true,
  offers     boolean not null default true,
  newsletter boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, entity_id)
);

create type public.rsvp_status as enum ('going', 'interested', 'cant_go');

create table public.rsvps (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id   text not null references public.events(id) on delete cascade,
  status     public.rsvp_status not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create table public.event_comments (
  id         bigserial primary key,
  event_id   text not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index event_comments_event_idx on public.event_comments (event_id, created_at);

create table public.event_polls (
  id       bigserial primary key,
  event_id text not null references public.events(id) on delete cascade,
  question text not null,
  options  jsonb not null default '[]'::jsonb
);

create table public.poll_votes (
  poll_id      bigint not null references public.event_polls(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  primary key (poll_id, profile_id)
);

create table public.event_reviews (
  event_id   text not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text not null default '',
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Block is mutual and total; mute is one-directional and soft.
create table public.blocks (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (profile_id, blocked_id)
);

create table public.mutes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  muted_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (profile_id, muted_id)
);

-- Push is the only messaging channel — there is no address to email.
create table public.push_subscriptions (
  id         bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- security

alter table public.profiles           enable row level security;
alter table public.public_profiles    enable row level security;
alter table public.host_assignments   enable row level security;
alter table public.saves              enable row level security;
alter table public.rsvps              enable row level security;
alter table public.event_comments     enable row level security;
alter table public.event_polls        enable row level security;
alter table public.poll_votes         enable row level security;
alter table public.event_reviews      enable row level security;
alter table public.blocks             enable row level security;
alter table public.mutes              enable row level security;
alter table public.push_subscriptions enable row level security;

alter table public.splash_tabs  enable row level security;
alter table public.resources    enable row level security;
alter table public.businesses   enable row level security;
alter table public.hosts        enable row level security;
alter table public.events       enable row level security;
alter table public.crisis_lines enable row level security;

-- Content is public and read-only to clients; writes go through admin tooling.
create policy "content is readable" on public.splash_tabs  for select using (true);
create policy "content is readable" on public.resources    for select using (true);
create policy "content is readable" on public.businesses   for select using (true);
create policy "content is readable" on public.hosts        for select using (true);
create policy "content is readable" on public.events       for select using (true);
create policy "content is readable" on public.crisis_lines for select using (true);

-- Only the owner reads their own row, and only through the column grant below.
create policy "own row, safe columns" on public.profiles
  for select using (auth.uid() = id);
create policy "own row is updatable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke all on public.profiles from anon, authenticated;
-- email_hash and alias are deliberately absent from this grant.
grant select (id, username, dob, hide_adult, pause_all, theme) on public.profiles to authenticated;
grant update (hide_adult, pause_all, theme) on public.profiles to authenticated;

create policy "public profiles are readable" on public.public_profiles
  for select using (true);
create policy "own public profile is writable" on public.public_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own assignments" on public.host_assignments
  for select using (auth.uid() = profile_id);

create policy "own saves" on public.saves
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own blocks" on public.blocks
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own mutes" on public.mutes
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Participation is publicly readable (counts, guest stacks, threads) but only
-- ever written by its owner.
create policy "rsvps are readable" on public.rsvps for select using (true);
create policy "own rsvp is writable" on public.rsvps
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "comments are readable" on public.event_comments for select using (true);
create policy "own comment is writable" on public.event_comments
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "polls are readable" on public.event_polls for select using (true);

create policy "votes are readable" on public.poll_votes for select using (true);
create policy "own vote is writable" on public.poll_votes
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "reviews are readable" on public.event_reviews for select using (true);
create policy "own review is writable" on public.event_reviews
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
