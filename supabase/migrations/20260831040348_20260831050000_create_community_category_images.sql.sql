/*
# Create community_images and category_images tables

## Purpose
Community Search and Category Search chooser cards were showing plain color
swatches with no images and no way to edit them. This migration creates two
tables so those cards can carry editable images, the same way county_images
already works for Location Search.

## New Tables
- `community_images`
  - `id` (text, primary key) — the community name, e.g. "Trans", "Gay Men"
  - `image_url` (text) — the public URL of the community card image
  - `position` (int, default 0) — display order

- `category_images`
  - `id` (text, primary key) — the category name, e.g. "Mental Health/Counseling"
  - `image_url` (text) — the public URL of the category card image
  - `position` (int, default 0) — display order

## Security
- RLS enabled on both tables.
- Public read (anon + authenticated SELECT).
- Anon + authenticated UPDATE on image_url (pre-launch image editing).
- Anon + authenticated INSERT.
- Mirrors the existing county_images pattern.

## Notes
1. Both tables are seeded with every community/category name found in the
   resource data, with empty image_url strings. The app falls back to the
   color swatch when no URL is set, so cards look the same until an image
   is uploaded through the editor.
2. The `id` is the community/category name itself (text PK), so the inline
   editor can target a specific row without a separate lookup.
*/

-- community_images
CREATE TABLE IF NOT EXISTS community_images (
  id text PRIMARY KEY,
  image_url text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0
);

ALTER TABLE community_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content is readable" ON community_images;
CREATE POLICY "content is readable" ON community_images
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anyone may update image columns" ON community_images;
CREATE POLICY "anyone may update image columns" ON community_images
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anyone may insert" ON community_images;
CREATE POLICY "anyone may insert" ON community_images
  FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE UPDATE ON community_images FROM anon, authenticated;
GRANT UPDATE (image_url) ON community_images TO anon, authenticated;

-- category_images
CREATE TABLE IF NOT EXISTS category_images (
  id text PRIMARY KEY,
  image_url text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0
);

ALTER TABLE category_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content is readable" ON category_images;
CREATE POLICY "content is readable" ON category_images
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anyone may update image columns" ON category_images;
CREATE POLICY "anyone may update image columns" ON category_images
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anyone may insert" ON category_images;
CREATE POLICY "anyone may insert" ON category_images
  FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE UPDATE ON category_images FROM anon, authenticated;
GRANT UPDATE (image_url) ON category_images TO anon, authenticated;

-- Seed community_images with all community names from the resources data
-- (extracted from the live database to ensure completeness)
INSERT INTO community_images (id, image_url, position) VALUES
  ('Adults', '', 0),
  ('Age 18 and up.', '', 1),
  ('Allies', '', 2),
  ('Asexual', '', 3),
  ('Bi/Pansexual', '', 4),
  ('Families/Youth', '', 5),
  ('Gay Men', '', 6),
  ('LDS', '', 7),
  ('LGBTQ', '', 8),
  ('LGBTQ Adult', '', 9),
  ('LGBTQ Adults', '', 10),
  ('LGBTQ+ Adult', '', 11),
  ('Lesbian', '', 12),
  ('Mixed Orientation', '', 13),
  ('Parent', '', 14),
  ('QPOC', '', 15),
  ('Senior', '', 16),
  ('Student', '', 17),
  ('Trans', '', 18),
  ('Young Adult', '', 19),
  ('Youth', '', 20)
ON CONFLICT (id) DO NOTHING;

-- Seed category_images with all category names from the resources data
INSERT INTO category_images (id, image_url, position) VALUES
  ('Blog', '', 0),
  ('Business', '', 1),
  ('College Resources', '', 2),
  ('Community Project', '', 3),
  ('Community Projects', '', 4),
  ('Crisis', '', 5),
  ('Education/Advocacy', '', 6),
  ('FHE/Sunday Service', '', 7),
  ('Homeless', '', 8),
  ('Medical and Wellness', '', 9),
  ('Mental Health/Counseling', '', 10),
  ('Name/Gender Change Assistance', '', 11),
  ('Online Community', '', 12),
  ('Other', '', 13),
  ('Philanthropy', '', 14),
  ('Pride Center', '', 15),
  ('Professional Services', '', 16),
  ('Publications/Media', '', 17),
  ('Queer Housing', '', 18),
  ('Research', '', 19),
  ('Resource Page', '', 20),
  ('Social Groups', '', 21),
  ('Speaker Series', '', 22),
  ('Support Circles', '', 23),
  ('Support Organization', '', 24),
  ('Video Project', '', 25),
  ('Wellness/Medical', '', 26)
ON CONFLICT (id) DO NOTHING;