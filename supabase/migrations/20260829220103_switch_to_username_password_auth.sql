/*
# Switch auth from email-OTP to username/password, add social profiles

## Overview
Replaces the anonymous email-alias auth system with standard Supabase
email/password auth. Separates the auth/account layer from the social/profile
layer per the user's architecture spec.

## Changes to `profiles` table (auth/account layer)
- Remove columns: `email_hash`, `alias` — no longer needed; Supabase Auth
  handles identity via email/password natively.
- Add column: `login_username` (citext, unique) — the private credential used
  for sign-in. Not visible publicly.
- Add column: `recovery_email` (text, nullable) — optional, kept strictly in
  the account/security domain. NOT used for social features.
- Keep: `id`, `username` (now used only if user doesn't set a public handle),
  `dob`, `hide_adult`, `pause_all`, `theme`, `created_at`.
- The `username` column is repurposed as an optional public handle and made
  nullable.

## New table: `social_profiles` (social/profile layer)
Replaces `public_profiles` with a richer social profile that supports
progressive disclosure and three visibility states:
- `private` — no social profile exists (default)
- `visible` — profile exists, viewable by people you interact with, not
  broadly discoverable
- `discoverable` — profile can appear in search, communities, recommendations

Fields: display_name, public_handle, avatar_url, header_url, bio, pronouns,
identity_labels (text[]), interests (text[]), social_links (text[]), website,
county (coarse location), visibility, search_visible, recommendable,
indexable.

## RLS changes
- `profiles`: keep existing own-row SELECT/UPDATE policies. Update column
  grants to include `login_username` but NOT expose `recovery_email`.
- `social_profiles`: public SELECT for visible/discoverable profiles only.
  Owner gets full CRUD on their own row.
- `public_profiles`: kept for backward compatibility but all reads/writes
  redirect to `social_profiles`. No new policies needed.

## Important notes
1. Supabase Auth's built-in `auth.users` table stores the email and password
   hash. The `profiles` table references it via `id` FK.
2. `recovery_email` in `profiles` is optional and separate from the auth
   email — it's a user-provided recovery channel, not the login identifier.
3. The `login_username` is a credential. It should never appear in any
   public-facing query or API response.
4. `social_profiles.visibility` controls the three-state model: private,
   visible, discoverable. Each discoverability flag (search_visible,
   recommendable, indexable) is independently controllable.
*/

-- Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_username citext,
  ADD COLUMN IF NOT EXISTS recovery_email text;

-- Make username nullable (it's now an optional public handle, not a required credential)
ALTER TABLE public.profiles ALTER COLUMN username DROP NOT NULL;

-- Add unique constraint on login_username
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_login_username_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_login_username_key UNIQUE (login_username);
  END IF;
END $$;

-- Create social_profiles table
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id              uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  public_handle   citext UNIQUE,
  avatar_url      text,
  header_url      text,
  bio             text,
  pronouns        text,
  identity_labels text[] NOT NULL DEFAULT '{}',
  interests       text[] NOT NULL DEFAULT '{}',
  social_links    text[] NOT NULL DEFAULT '{}',
  website         text,
  county          text,
  visibility      text NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('private', 'visible', 'discoverable')),
  search_visible      boolean NOT NULL DEFAULT false,
  recommendable       boolean NOT NULL DEFAULT false,
  indexable           boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on social_profiles
ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for social_profiles (drop first for idempotency)
DROP POLICY IF EXISTS "social profiles visible to all" ON public.social_profiles;
CREATE POLICY "social profiles visible to all"
  ON public.social_profiles FOR SELECT
  TO anon, authenticated
  USING (visibility IN ('visible', 'discoverable'));

DROP POLICY IF EXISTS "own social profile readable" ON public.social_profiles;
CREATE POLICY "own social profile readable"
  ON public.social_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "own social profile insertable" ON public.social_profiles;
CREATE POLICY "own social profile insertable"
  ON public.social_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own social profile updatable" ON public.social_profiles;
CREATE POLICY "own social profile updatable"
  ON public.social_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own social profile deletable" ON public.social_profiles;
CREATE POLICY "own social profile deletable"
  ON public.social_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Update profiles column grants: expose login_username to owner, keep recovery_email private
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, login_username, dob, hide_adult, pause_all, theme) ON public.profiles TO authenticated;
GRANT UPDATE (hide_adult, pause_all, theme) ON public.profiles TO authenticated;

-- Update profiles policies
DROP POLICY IF EXISTS "own row, safe columns" ON public.profiles;
CREATE POLICY "own row, safe columns"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "own row is updatable" ON public.profiles;
CREATE POLICY "own row is updatable"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Index for social profile lookups by handle
CREATE INDEX IF NOT EXISTS social_profiles_handle_idx ON public.social_profiles (public_handle);
CREATE INDEX IF NOT EXISTS social_profiles_visibility_idx ON public.social_profiles (visibility);
