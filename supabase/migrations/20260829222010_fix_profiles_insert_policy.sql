/*
# Fix: profiles INSERT policy and grant

## Problem
The `20260829220103_switch_to_username_password_auth.sql` migration
revoked all grants on `profiles` and only re-added SELECT and UPDATE.
There was no INSERT policy or grant, so when a user signs up via the
SignIn screen, `supabase.auth.signUp()` succeeds (creates the auth.users
row) but the subsequent `profiles.insert()` is blocked by RLS. The profile
row never gets created, and the `auth-signin` edge function can't find
the `login_username` — resulting in "Wrong username or password" even
though the account was just created.

## Fix
- Add an INSERT policy on `profiles` scoped to `authenticated` with
  `auth.uid() = id` check (the user can only insert their own row).
- Grant INSERT on the safe columns to `authenticated`.
*/
DROP POLICY IF EXISTS "own row insertable" ON public.profiles;
CREATE POLICY "own row insertable"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

GRANT INSERT (id, username, login_username, dob, hide_adult, pause_all, theme, recovery_email) ON public.profiles TO authenticated;
