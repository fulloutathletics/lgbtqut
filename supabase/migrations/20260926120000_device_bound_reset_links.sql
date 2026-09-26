-- Password resets bound to the screen that asked for them.
--
-- Every sending service keeps a copy of what it sent, and anyone who can read
-- those logs could otherwise use what is in the email. So a reset needs two
-- halves that never travel together:
--
--   code         the 6 digits in the email; stored only as a keyed tag
--                (HMAC under EMAIL_PEPPER, bound to this ticket's id).
--   device key   a random secret kept by the screen that asked; stored only
--                as its SHA-256.
--
-- auth-reset completes a reset only with both, within 15 minutes, in at most
-- five tries. The person types the code back into the screen they asked
-- from, so this works in a home-screen app as well as any browser. Service
-- role only.

create table if not exists public.reset_tickets (
  id           uuid primary key,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  device_hash  text not null,
  code_tag     text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists reset_tickets_device_idx on public.reset_tickets (device_hash, expires_at);
create index if not exists reset_tickets_profile_idx on public.reset_tickets (profile_id);

alter table public.reset_tickets enable row level security;
revoke all on public.reset_tickets from anon, authenticated;
