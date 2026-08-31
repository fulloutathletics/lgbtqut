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

## Attribution

Most of this directory was typed in by LGBTQ.UT from public information. The
organisation named on such a listing never agreed to run a page here, does not
read the discussion under it, and cannot correct it when an event moves or is
cancelled. `events.source` says which of the two an event is:

| `source` | Meaning |
|---|---|
| `directory` | LGBTQ.UT listed it. We are answerable for it being right. |
| `entity` | The organiser posted it from their own account and maintains it. |

The mark is earned rather than typed. RLS lets whoever administers an entity
run its events, and only ever as `source = 'entity'` — they are standing behind
it. They cannot edit or delete a `directory` row: a listing we added stays ours
until a super-admin deliberately hands it over by flipping `source` in the admin
console. That is what keeps the badge worth reading.

On screen, both states are labelled — an unbadged card among badged ones would
read as endorsed by whoever it names. The label is a tag, not a paragraph: the
full explanation matters to whoever stops to ask and is a footnote for everyone
else, so tapping it (or hovering, with a mouse) opens the detail over the page
rather than inside it. A `directory` event additionally drops every host voice
from its discussion, says who is actually moderating, and carries `source_url`
and `last_checked_on` so a reader can go check the organiser's own posting when
ours may have gone stale.

## Descriptions

Descriptions and bios render a small Markdown subset — `#`–`######` headings,
`**bold**`, `_italic_`, `[text](url)`, bare URLs, `-`/`*`/`•` bullets, `1.`
numbered lists, blank-line paragraphs. This is not a new capability so much as
catching up with the content: the imported directory was already written in
Markdown against fields that rendered none of it, so listings were showing
readers their own `**Our aims:**` and `## Let's grow together.`.

`src/components/RichText.tsx` builds React elements and never touches
`dangerouslySetInnerHTML`. There is deliberately no path from a description to
markup: entity admins write their own events now, and a directory of queer
resources is the wrong place to trust an author with raw HTML. Link targets are
limited to http(s), mailto and tel — a `javascript:` or `data:` URL renders as
inert text, as does anything that looks like a tag.

**Single-asterisk italics are not supported, on purpose.** `Trans*` is a term
this directory uses in earnest; `*text*` emphasis would italicise everything
between two of them. Use `_italic_`.

Plain prose passes through unchanged, so a listing with no markup reads exactly
as it did. The admin console previews the rendered result through the same
component the app uses.

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
- **Reporting a stale listing.** A `directory` event tells a reader to tell us
  when something on it is wrong, but there is no button that does it — they
  have to find another way to reach us. Wire one to the moderation queue.
