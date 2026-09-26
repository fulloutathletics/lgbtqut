# Pending: device-bound password reset links

`device-bound-reset.patch` holds a finished but **unapplied** change. Nothing in
it is live, and it is kept out of `src/` and `supabase/` on purpose so no build
or migration runner picks it up.

**What it does.** A reset link only works on the device and browser that asked
for it. The device keeps a random secret and sends only its hash; the email
carries a one-time token of which only a hash is stored (`reset_tickets`). The
reset completes only with both, within an hour, once — so the copy of the
email a sending service keeps in its logs cannot reset anything. It also signs
out every other session on success, and only emails links to `lgbtqut.app`
(plus any origin in the `APP_ORIGINS` function secret).

**Why it is parked.** Its migration was not approved yet, and the new reset
screen cannot read the links the current `auth-reset` sends, so the pieces must
go live together:

1. `git apply design-reference/pending/device-bound-reset.patch`
2. Apply `supabase/migrations/20260926120000_device_bound_reset_links.sql`
3. Deploy `auth-reset` (with `_shared/recovery.ts`)
4. Push the app, then delete this folder.
