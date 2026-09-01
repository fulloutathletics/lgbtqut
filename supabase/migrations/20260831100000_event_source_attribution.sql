/*
# Who listed this event, and who is actually watching it

## The problem
Most of the directory was typed in by LGBTQ.UT from public information. The
organisation named on an event never agreed to run a page here, does not see
the discussion under it, and cannot fix the listing when the event moves or is
cancelled. Nothing on screen said so, which left readers addressing an absent
host and blaming an organisation for a listing it has never seen.

## The mark
`events.source` says which of the two an event is:

- `directory` — LGBTQ.UT added it. We are answerable for it being right.
- `entity`    — the organiser posted it from their own account and maintains it.

`source_url` is where a directory listing came from, so a reader can check the
organiser's own posting when ours may have gone stale. `last_checked_on` is the
last time a person confirmed a directory listing still holds; `added_by` keeps
the account that entered it.

## The mark is earned, not typed
Until now only a super-admin could touch `events`, so `entity` had no way to
become true. The policies below let whoever administers an entity run its
events — and only ever as `source = 'entity'`, since they are standing behind
it. They cannot edit or delete a `directory` row: a listing we added stays ours
until a super-admin deliberately hands it over by flipping `source`. That is
what keeps the badge worth reading.
*/

do $$
begin
  create type public.content_source as enum ('directory', 'entity');
exception
  when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists source          public.content_source not null default 'directory',
  add column if not exists source_url      text not null default '',
  add column if not exists last_checked_on date,
  add column if not exists added_by        uuid references public.profiles(id) on delete set null;

-- Set separately so the backfill above leaves existing rows null rather than
-- stamping every one of them with whoever runs the migration.
alter table public.events alter column added_by set default auth.uid();

comment on column public.events.source is
  'directory = LGBTQ.UT listed this from public information; entity = the organiser posted and maintains it.';
comment on column public.events.source_url is
  'Where a directory listing was taken from — the organiser''s own posting, for readers to check against.';
comment on column public.events.last_checked_on is
  'Last date a person confirmed a directory listing is still accurate.';

-- ------------------------------------------------- entity-run events

drop policy if exists "entity admins add own events" on public.events;
create policy "entity admins add own events"
  on public.events for insert to authenticated
  with check (public.administers(entity_kind, entity_id) and source = 'entity');

drop policy if exists "entity admins edit own events" on public.events;
create policy "entity admins edit own events"
  on public.events for update to authenticated
  using (public.administers(entity_kind, entity_id) and source = 'entity')
  with check (public.administers(entity_kind, entity_id) and source = 'entity');

drop policy if exists "entity admins remove own events" on public.events;
create policy "entity admins remove own events"
  on public.events for delete to authenticated
  using (public.administers(entity_kind, entity_id) and source = 'entity');
