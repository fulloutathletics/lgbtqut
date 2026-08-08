# LGBTQ.UT

Utah queer resource directory — resources, events, and affirming businesses. A Vite + React PWA on Supabase, rebuilt from the Glide app it replaces.

Two things the Glide version could not do, and which shape everything here:

- **Page layouts are backend-configured.** A business listing's presentation is data (`businesses.sections`), not code. One renderer produces a different page per listing.
- **The database never stores a user's email address.** Sign-in uses a proxy alias plus a peppered blind index. See [Authentication](#authentication).

## Setup

```bash
npm install
cp .env.example .env    # fill in the values below
npm run dev
```

### Environment

| Variable | Where it comes from |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same page (the publishable / anon key) |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` — **public half only** |

The VAPID private key belongs in Supabase Edge Function secrets, never in `.env`.

### Database

The app runs against the bundled directory export until the tables exist, so
`npm run dev` works immediately. To move onto the real database:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                                  # applies supabase/migrations/
psql "$DATABASE_URL" -f supabase/seed.sql         # or paste into the SQL editor
```

`supabase/seed.sql` is generated — re-run `npm run generate:data` after changing
anything in `design-reference/`, never hand-edit it.

Once `resources` returns rows, `src/lib/data.ts` switches to Supabase on its own.
No code change, no flag.

## Authentication

Read `design-reference/Auth Handoff Spec.html` before touching sign-in. The short
version:

`auth.users.email` holds an alias (`chosen-twist-631@anonymous.appuser.io`), not
the user's address. `profiles.email_hash` is an HMAC of the normalized address
under a pepper in Supabase Vault, which is what makes an account findable at
login. The real address exists in exactly one system — an SES + Lambda forwarder
in a **separate AWS account** — and never in this project.

Deploying it takes four things beyond `supabase functions deploy`:

1. **Store the pepper in Vault** as `EMAIL_PEPPER`. Not an env var — a pepper
   sitting beside the hashes it protects is no pepper at all.
2. **Stand up the forwarder** and set `FORWARDER_URL`, `FORWARDER_TOKEN` and
   `ALIAS_DOMAIN` as function secrets. Set its log retention to zero; SES writes
   recipients to CloudWatch by default, which quietly creates a second copy of
   the mapping the forwarder is supposed to solely hold.
3. **Disable Edge Function request logging.** The address arrives in the request
   body, so logging writes to disk exactly what the schema refuses to store.
4. **Point custom SMTP at the forwarder.** Supabase's built-in mailer echoes the
   recipient into logs and headers you do not control.

`supabase/functions/_shared/identity.ts` marks the one call that hands the
address to another system. Nothing in these functions logs a request body — that
is the single most common way this design leaks.

**`auth-start` returns `{status:"code_sent"}` whether or not the account exists.**
That is deliberate and load-bearing: a distinguishable response makes the endpoint
an oracle for whether a given person has an account in a queer directory.

## Structure

```
src/
  lib/        supabase client, data layer, theme tokens, app store, push
  components/ shared kit — header, sticky bar, cards, rows, toggles, age gate
  screens/    one file per screen
  sw.ts       service worker: push + notificationclick
supabase/
  migrations/ schema, RLS policies, column grants
  functions/  auth-start, auth-verify
  seed.sql    generated content rows
design-reference/  the original handoff bundle — the source of truth for specs
scripts/generate-data.mjs   design-reference → seed.json + seed.sql
```

## What is built

Screens are complete against the handoff: home/router, resource chooser and
results, resource detail, crisis, events, event detail (RSVP, polls, reviews,
discussion, block/mute), host profile, Shop Queer map + finder, business detail
with the dynamic section system, profile (Saved · Themes · Contribute · Alerts ·
Account), sign-in, become-a-host, and user profiles. All 13 themes work app-wide.

Social features render against **deterministic local stand-ins** for participation
data — RSVPs, comments, polls, reviews and user profiles — because those tables
ship empty. The tables and policies exist in `0001_init.sql`; wiring the screens
to them is the remaining step. Each stand-in is commented with the table it
represents.

## Known gaps

- **Garet font.** Licensed by the client, files not supplied. Drop the woff2s into
  `public/fonts/` and `src/index.css` picks them up; until then it renders in Outfit.
- **Imagery.** Most business images and all category/community artwork are missing;
  those fall back to a hatched placeholder and a rotating swatch set. Every image
  still points at the Glide CDN — **migrate these before launch, those URLs die
  with the Glide subscription.**
- **Business coordinates** are a city lookup with a county-centroid fallback.
  Replace with real per-business coordinates.
- **Section config** exists for five worked examples; the other 31 businesses
  render with no sections until an admin configures them.
- **PWA icons** are a generated pride-flag placeholder. Swap in the real logo.
- **Moderation queue.** Per the handoff, the social layer should not launch
  without one, and it does not exist yet.
