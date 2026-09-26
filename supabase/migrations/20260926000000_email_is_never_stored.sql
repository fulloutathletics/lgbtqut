-- The email address is never stored.
--
-- Until now sign-up wrote the real address twice: as auth.users.email and
-- again as profiles.recovery_email. Both were readable by whoever holds the
-- project. From here on:
--
--   auth.users.email        a random alias on the reserved `.invalid` TLD.
--                           Sign-in resolves username → alias server-side.
--   account_recovery        one fingerprint per account: PBKDF2 over an HMAC
--                           of the address under a pepper that lives in Edge
--                           Function secrets, not in this database. It can
--                           confirm an address someone types; it cannot be
--                           read back into one.
--   email_challenges        the 6-digit sign-up codes, as keyed tags. Rows
--                           are deleted on use and swept on expiry.
--
-- Both tables are for the auth-signup and auth-reset functions (service
-- role) only: RLS on, no policies, no grants to anon or authenticated.

alter table public.profiles drop column if exists recovery_email;

-- Accounts are created by auth-signup, which writes the profile row itself.
-- Without this, an account made by calling Auth directly — with a real
-- address in auth.users — could still give itself a profile.
revoke insert on public.profiles from anon, authenticated;
drop policy if exists "own row insertable" on public.profiles;

create table if not exists public.account_recovery (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  email_hash    text not null,
  -- Reset attempts in the current hour, right address or not.
  window_start  timestamptz,
  window_count  integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.account_recovery enable row level security;
revoke all on public.account_recovery from anon, authenticated;

create table if not exists public.email_challenges (
  id          uuid primary key,
  email_tag   text not null,
  code_tag    text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists email_challenges_tag_idx on public.email_challenges (email_tag, created_at);

alter table public.email_challenges enable row level security;
revoke all on public.email_challenges from anon, authenticated;
