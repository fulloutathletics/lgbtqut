-- The moderation helpers are internal. Supabase grants EXECUTE on new
-- functions in `public` straight to anon and authenticated, so revoking from
-- PUBLIC (as link_rules_and_moderation did) leaves them callable over
-- /rest/v1/rpc. Called directly, moderation_hook and queue_link_checks would
-- let anyone spend the Jev budget and have the function fetch arbitrary
-- pages. Triggers and the definer lookups still run: they execute as their
-- owner.
revoke execute on function public.moderation_hook(jsonb) from anon, authenticated;
revoke execute on function public.queue_link_checks(text[]) from anon, authenticated;
revoke execute on function public.link_verdict_adult(text) from anon, authenticated;
revoke execute on function public.link_verdict_bio(text) from anon, authenticated;
revoke execute on function public.link_checks_enqueue() from public, anon, authenticated;
revoke execute on function public.social_profiles_enqueue() from public, anon, authenticated;
revoke execute on function public.content_enqueue() from public, anon, authenticated;
revoke execute on function public.check_post_links() from public, anon, authenticated;
revoke execute on function public.rate_social_profile() from public, anon, authenticated;
