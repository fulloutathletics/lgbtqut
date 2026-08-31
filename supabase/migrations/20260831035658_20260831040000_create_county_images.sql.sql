/*
# Create county_images table for editable county card images

## Purpose
County card images (Cache County, Davis County, etc.) were previously hardcoded
in the bundled seed.json with no way to update them through the app. This
migration creates a database table so they can be edited with the inline
image editor, the same way splash page cards, resources, businesses, hosts,
and events already work.

## New Tables
- `county_images`
  - `id` (text, primary key) — the county name, e.g. "Cache County"
  - `image_url` (text) — the public URL of the county card image
  - `position` (int, default 0) — display order

## Security
- RLS enabled.
- Public read (anon + authenticated SELECT).
- Anon + authenticated UPDATE on image_url (pre-launch image editing).
- This mirrors the existing splash_tabs / resources / businesses / hosts / events pattern.

## Notes
1. Seeded with the six existing county image URLs from the bundled seed.json.
2. The `id` is the county name itself (text PK), so the inline editor can
   target a specific county row without a separate lookup.
*/

CREATE TABLE IF NOT EXISTS county_images (
  id text PRIMARY KEY,
  image_url text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0
);

ALTER TABLE county_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content is readable" ON county_images;
CREATE POLICY "content is readable" ON county_images
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anyone may update image columns" ON county_images;
CREATE POLICY "anyone may update image columns" ON county_images
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anyone may insert" ON county_images;
CREATE POLICY "anyone may insert" ON county_images
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Seed the six counties with their existing bundled image URLs
INSERT INTO county_images (id, image_url, position) VALUES
  ('Cache County',    'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/AY58wkQy3qGWOpQJbKTj.png', 0),
  ('Davis County',    'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/wXWQPFDqk5sYKfx69KNh.png', 1),
  ('Salt Lake County','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/f209QfRSH198UjpeQ0Xn.png', 2),
  ('Utah County',     'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/rps4K3DxViXDhKSyjuU4.png', 3),
  ('Weber County',    'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/IPkATfqPwX93VCUbkOpl.png', 4),
  ('Washington County','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/dEU92UGNbuK547YFYqsx.png', 5)
ON CONFLICT (id) DO NOTHING;

-- Grant column-level UPDATE on image_url only (matches the pattern on other tables)
REVOKE UPDATE ON county_images FROM anon, authenticated;
GRANT UPDATE (image_url) ON county_images TO anon, authenticated;