-- Inline "change image" buttons write straight to these tables with no
-- sign-in (same trade-off as the app-images storage policies added in
-- 20260831000000). To keep the blast radius small, anon/authenticated get
-- UPDATE on the image columns only — never name, description, verification,
-- coupons, or any other field — via column-level grants layered under a
-- permissive row policy. A visitor with only the publishable key can swap a
-- photo; they cannot rewrite content.

revoke all on public.splash_tabs from anon, authenticated;
grant select on public.splash_tabs to anon, authenticated;
grant update (image_url) on public.splash_tabs to anon, authenticated;

revoke all on public.resources from anon, authenticated;
grant select on public.resources to anon, authenticated;
grant update (image_url) on public.resources to anon, authenticated;

revoke all on public.businesses from anon, authenticated;
grant select on public.businesses to anon, authenticated;
grant update (image_url, background_url) on public.businesses to anon, authenticated;

revoke all on public.hosts from anon, authenticated;
grant select on public.hosts to anon, authenticated;
grant update (image_url, header_url) on public.hosts to anon, authenticated;

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant update (image_url) on public.events to anon, authenticated;

create policy "anyone may update image columns" on public.splash_tabs
  for update to anon, authenticated using (true) with check (true);

create policy "anyone may update image columns" on public.resources
  for update to anon, authenticated using (true) with check (true);

create policy "anyone may update image columns" on public.businesses
  for update to anon, authenticated using (true) with check (true);

create policy "anyone may update image columns" on public.hosts
  for update to anon, authenticated using (true) with check (true);

create policy "anyone may update image columns" on public.events
  for update to anon, authenticated using (true) with check (true);
