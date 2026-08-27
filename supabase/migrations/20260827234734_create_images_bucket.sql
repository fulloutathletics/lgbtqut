-- Public bucket for splash page cards, menu cards, and other app imagery.
-- Images are read by anonymous (not-yet-signed-in) visitors, so the bucket
-- must be publicly readable. Uploads are admin-only (service role), never
-- done from the client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-images',
  'app-images',
  true,
  10 * 1024 * 1024,  -- 10 MB per file
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Public read: anyone can view images without authentication.
create policy "public read app-images"
  on storage.objects for select
  using (bucket_id = 'app-images');

-- No client-side upload policy — uploads go through the service role only.
