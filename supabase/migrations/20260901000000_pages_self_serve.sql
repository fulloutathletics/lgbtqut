-- One account, many faces.
--
-- A person signs in once. Behind that account they may have a personal
-- profile (social_profiles) and any number of *pages* they administer — a
-- resource, a business, or a host (entity_admins). Until now the only way
-- onto entity_admins was a hand-written row, the "Become a host" screen
-- submitted nothing, and no screen read the table back. This migration adds
-- the self-serve half:
--
--   page_requests   a person asks to manage an existing listing (with proof
--                   of affiliation) or proposes a page that is not listed
--                   yet. Approval is still a human act: a reviewer inserts
--                   the entity_admins row (and the hosts row for a new host
--                   page) from the SQL editor or a future admin tool. There
--                   is deliberately no client-side approve path — a listing
--                   is never self-claimed.
--
--   page editing    whoever administers a page may edit its own text and
--                   contact columns, and run its events. `verified` stays a
--                   reviewer's call: a trigger refuses to let a client
--                   session flip it.

-- ------------------------------------------------------------- requests

create table if not exists public.page_requests (
  id            bigserial primary key,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  entity_kind   public.entity_kind not null,
  -- null means "propose a new page of this kind"; otherwise claim this listing.
  entity_id     text,
  proposed_name text not null default '',
  proposed_bio  text not null default '',
  -- A link or a sentence a reviewer can check: staff page, org email, etc.
  proof         text not null default '',
  contact       text not null default '',
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'declined')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists page_requests_profile_idx on public.page_requests (profile_id, created_at desc);
create index if not exists page_requests_status_idx  on public.page_requests (status);

alter table public.page_requests enable row level security;

drop policy if exists "own requests readable" on public.page_requests;
create policy "own requests readable"
  on public.page_requests for select to authenticated
  using (auth.uid() = profile_id);

drop policy if exists "own request insertable" on public.page_requests;
create policy "own request insertable"
  on public.page_requests for insert to authenticated
  with check (auth.uid() = profile_id and status = 'pending');

-- Withdrawing is allowed while it is still waiting on a reviewer.
drop policy if exists "own pending request deletable" on public.page_requests;
create policy "own pending request deletable"
  on public.page_requests for delete to authenticated
  using (auth.uid() = profile_id and status = 'pending');

-- ------------------------------------------------------- page editing

drop policy if exists "page admins edit hosts" on public.hosts;
create policy "page admins edit hosts"
  on public.hosts for update to authenticated
  using (public.administers('host', id))
  with check (public.administers('host', id));

drop policy if exists "page admins edit businesses" on public.businesses;
create policy "page admins edit businesses"
  on public.businesses for update to authenticated
  using (public.administers('business', id))
  with check (public.administers('business', id));

drop policy if exists "page admins edit resources" on public.resources;
create policy "page admins edit resources"
  on public.resources for update to authenticated
  using (public.administers('resource', id))
  with check (public.administers('resource', id));

-- A page's admins run its events. The organiser columns must name a page
-- the caller administers on the way in *and* on the way out, so an event
-- cannot be re-homed onto someone else's page.
drop policy if exists "page admins run their events" on public.events;
create policy "page admins run their events"
  on public.events for all to authenticated
  using (entity_kind is not null and public.administers(entity_kind, entity_id))
  with check (entity_kind is not null and public.administers(entity_kind, entity_id));

-- Verification is granted by a reviewer, never by the page itself. Client
-- sessions carry auth.uid(); the SQL editor and service role do not.
create or replace function public.keep_verified_reviewer_only()
returns trigger
language plpgsql
as $$
begin
  if new.verified is distinct from old.verified and auth.uid() is not null then
    raise exception 'verified is set by a reviewer, not by the page';
  end if;
  return new;
end;
$$;

drop trigger if exists hosts_verified_guard on public.hosts;
create trigger hosts_verified_guard
  before update on public.hosts
  for each row execute function public.keep_verified_reviewer_only();

drop trigger if exists businesses_verified_guard on public.businesses;
create trigger businesses_verified_guard
  before update on public.businesses
  for each row execute function public.keep_verified_reviewer_only();

drop trigger if exists resources_verified_guard on public.resources;
create trigger resources_verified_guard
  before update on public.resources
  for each row execute function public.keep_verified_reviewer_only();

-- ---------------------------------------------------- approval helper
--
-- For the reviewer. Run from the SQL editor (service role):
--   select public.approve_page_request(42);
-- Creates the hosts row when the request proposes a new host page, then
-- grants the requester admin on the page and marks the request approved.
-- New resource/business pages are still entered by hand — they carry far
-- more columns than a request holds — so for those, insert the listing
-- first and approve with its id:
--   select public.approve_page_request(42, 'new-listing-id');

create or replace function public.approve_page_request(request_id bigint, listing_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.page_requests%rowtype;
  target text;
begin
  if auth.uid() is not null then
    raise exception 'approve_page_request is a reviewer action';
  end if;

  select * into r from public.page_requests where id = request_id for update;
  if not found then raise exception 'no such request'; end if;
  if r.status <> 'pending' then raise exception 'request already %', r.status; end if;

  target := coalesce(listing_id, r.entity_id);

  if target is null then
    if r.entity_kind <> 'host' then
      raise exception 'a new % page must be inserted first; pass its id', r.entity_kind;
    end if;
    target := 'host-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into public.hosts (id, name, bio) values (target, r.proposed_name, r.proposed_bio);
  end if;

  insert into public.entity_admins (profile_id, entity_kind, entity_id, role)
  values (r.profile_id, r.entity_kind, target, 'admin')
  on conflict do nothing;

  update public.page_requests
     set status = 'approved', reviewed_at = now(), entity_id = target
   where id = request_id;
end;
$$;

revoke all on function public.approve_page_request(bigint, text) from public, anon, authenticated;
