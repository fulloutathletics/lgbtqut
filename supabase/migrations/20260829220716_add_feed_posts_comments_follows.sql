/*
# Feed: posts, comments, follows

## Overview
Adds the social feed layer — text-only posts, threaded comments, and
user-to-user follows. This is the only social feature beyond profiles.
No photo uploads in posts; images are limited to profile avatars/headers.

## New tables

### posts
- id (bigserial PK)
- author_id (uuid FK -> profiles.id, CASCADE)
- body (text, not null, max 280 chars enforced by app)
- created_at (timestamptz)
- Index on created_at desc for feed ordering.

### comments
- id (bigserial PK)
- post_id (bigint FK -> posts.id, CASCADE)
- author_id (uuid FK -> profiles.id, CASCADE)
- parent_id (bigint FK -> comments.id, CASCADE, nullable) — for threading
- body (text, not null)
- created_at (timestamptz)
- Index on (post_id, created_at) for retrieval.

### follows
- follower_id (uuid FK -> profiles.id, CASCADE)
- followee_id (uuid FK -> profiles.id, CASCADE)
- created_at (timestamptz)
- PK (follower_id, followee_id) — one follow per pair
- CHECK: follower_id != followee_id (cannot follow self)

## RLS
- posts: SELECT public to anon+authenticated (feed is public). INSERT/UPDATE/DELETE
  owner-only via auth.uid() = author_id.
- comments: SELECT public. INSERT/UPDATE/DELETE owner-only.
- follows: SELECT public (so people can see who follows whom). INSERT/DELETE
  owner-only (follower controls their follows).

## Important notes
1. Posts are text-only — no image_url column by design.
2. Comments support one level of threading via parent_id (nullable for
   top-level comments, set to reply to another comment).
3. The feed is assembled client-side: fetch posts from authors the user
   follows, plus the user's own posts, ordered by created_at desc.
4. No likes/reactions — comments are the only interaction.
*/

-- posts
CREATE TABLE IF NOT EXISTS public.posts (
  id         bigserial PRIMARY KEY,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_idx ON public.posts (author_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts are readable" ON public.posts;
CREATE POLICY "posts are readable"
  ON public.posts FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "own post insertable" ON public.posts;
CREATE POLICY "own post insertable"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "own post updatable" ON public.posts;
CREATE POLICY "own post updatable"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "own post deletable" ON public.posts;
CREATE POLICY "own post deletable"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- comments
CREATE TABLE IF NOT EXISTS public.comments (
  id         bigserial PRIMARY KEY,
  post_id    bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id  bigint REFERENCES public.comments(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON public.comments (parent_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments are readable" ON public.comments;
CREATE POLICY "comments are readable"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "own comment insertable" ON public.comments;
CREATE POLICY "own comment insertable"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "own comment deletable" ON public.comments;
CREATE POLICY "own comment deletable"
  ON public.comments FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- follows
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows (followee_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows are readable" ON public.follows;
CREATE POLICY "follows are readable"
  ON public.follows FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "own follow insertable" ON public.follows;
CREATE POLICY "own follow insertable"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "own follow deletable" ON public.follows;
CREATE POLICY "own follow deletable"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);
