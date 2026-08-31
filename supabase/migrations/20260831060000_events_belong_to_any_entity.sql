-- An event could only hang off a host, so a resource or business that runs
-- events needed a phantom host row standing in for it. Events now address
-- their organiser the same way posts and saves do — (entity_kind, entity_id)
-- over the shared entity_kind enum — so one profile can be entered from its
-- resource, business or host face and still own the same events.
--
-- host_id stays for now, backfilled and nullable, so existing reads keep
-- working while screens move across.

alter table public.events
  add column if not exists entity_kind public.entity_kind,
  add column if not exists entity_id   text;

update public.events
   set entity_kind = 'host', entity_id = host_id
 where entity_id is null and host_id is not null;

alter table public.events alter column host_id drop not null;

alter table public.events
  drop constraint if exists events_has_organiser;
alter table public.events
  add constraint events_has_organiser check (entity_kind is not null and entity_id is not null);

create index if not exists events_entity_idx on public.events (entity_kind, entity_id);
