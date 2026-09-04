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

## Accounts, profiles and pages

One sign-in, many faces. The pieces:

| Layer | Table | What it is |
|---|---|---|
| Account | `profiles` | Private. A login username, a date of birth for age gates. Never shown. |
| Personal profile | `social_profiles` | Optional public face for the *person*: name, pronouns, bio, visibility. At most one per account. |
| Pages | `resources` / `businesses` / `hosts` + `entity_admins` | An organization, business or event host. Belongs to the organisation, not the person; several people can run one, and one person can run several. |
| Requests | `page_requests` | A person asking to run a listed page (with proof) or proposing a new one. |

Someone who leads a local nonprofit, owns a shop and runs a hiking series has
one account, one personal profile, and three pages. They post, reply and run
events *as* whichever page fits from the same session; the feed composer and
the event page's host controls follow `entity_admins`. Their personal profile
shows which pages they run, and a page's replies are badged so an official
answer reads differently from the same person speaking for themselves.

**Hosting is a capability of any page**, not a separate identity. A resource or
business posts events from its own page (`events.entity_kind/entity_id`); a
`hosts` row is only for people or collectives that run events *outside* an
existing listing.

The journey:

1. **Sign up** (`/signin`) — login, password, recovery email, date of birth.
2. **Welcome** (`/welcome`, once) — pick what you are here for: a personal
   profile, an organization, a business, an event host. Any mix, all optional.
   Creates the personal profile and files page requests in one pass.
3. **Profile → Account** — the hub. Your personal profile, the pages you run
   (each with **Manage**), pending requests, and **Manage a page** to ask for more.
4. **Manage** (`/manage/:kind/:id`) — edit a page's details and run its events.
   Reached from the hub or from the "You manage this page" strip on the public page.

### The personal profile

`/u/:handle` is a person's public face: picture, background, pronouns,
identity tags, interests, links, the pages they run, and every post they made
in their own voice, with likes and replies. `/profile/edit` edits all of it
with a live preview.

- **Pictures** upload to the `profile-media` bucket, under a folder named
  after the account's id — the only folder that session may write to. They are
  re-encoded client-side (bounded size, metadata stripped). A trigger refuses
  any `avatar_url`/`header_url` that is not from that folder, so a profile can
  never hotlink an outside host. Backgrounds can also be one of the built-in
  presets in `src/lib/profile.ts`, stored as `preset:<id>`.
- **18+ is computed, not chosen.** `social_profiles.age_rating` is set by a
  trigger: `'18+'` when the owner turns on *My profile is for adults*, or when
  any link points at an adult-only platform (`public.is_adult_link`, mirrored
  as `ADULT_LINK_PATTERN` on the client so the editor warns before Save). A
  rated profile and its own-voice posts are readable only by signed-in adults
  and by the owner, enforced in the select policies; posts made *as a page*
  stay public. Minors are never told a row was withheld.

**Listings are never self-claimed.** A request goes to a reviewer, who approves
it from the SQL editor: `select public.approve_page_request(<id>);` (pass the
new listing's id as a second argument for a new resource or business page). The
`verified` badge is likewise reviewer-only; a trigger refuses to let a page
change it on itself.

## Structure

```
src/
  lib/        supabase client, data layer, theme tokens, app store, push, back-trail
  components/ shared kit — header, sticky bar, cards, rows, toggles, age gate
  screens/    one file per screen (Welcome, BecomeHost and ManagePage are the account flows)
  sw.ts       service worker: push + notificationclick
supabase/
  migrations/ schema, RLS policies, column grants
  functions/  auth-start, auth-verify
  seed.sql    generated content rows
design-reference/  the original handoff bundle — the source of truth for specs
scripts/generate-data.mjs   design-reference → seed.json + seed.sql
```

## Going back

`src/lib/trail.tsx` decides where every back button lands, and nothing draws it —
the breadcrumb exists so the app knows where a reader came from, not so they have
to read it.

It keeps two things. A **trail**, the stack of entries actually visited, held in
step with the browser's own history; and **`parentOf`**, the directory's shape,
for a reader who arrived from a shared link with no history at all. `back()`
prefers the trail, because returning to the page you came from brings its scroll
position and its search box with you, and falls through to the parent whenever
the entry behind sits *below* the current page.

That last rule is the whole point. A screen that "goes up" by navigating to its
parent pushes a new entry, so the page it just left ends up sitting *behind* the
one it lands on. The resource chooser did exactly that: Location Search → a
county → back put `/list/county` on top of `/list/county/Cache County`, and the
next back walked the reader into the county again instead of out to Resources —
a loop with no way home. Screens no longer pass their own `onBack` for this;
`StickyBar` uses the trail, and the back button's accessible name says where it
goes ("Back to Location Search").

Pass `onBack` only for a screen that steps through its own stages before it is
ready to leave, like sign-in.

Two things keep the trail honest, and getting either wrong reads as a back
button that does nothing:

- **It is indexed by the browser's own position**, `history.state.idx`, rather
  than inferred from the kind of navigation. A push lands one slot deeper, a
  replace overwrites the slot it stands on, a step back trims the slots ahead —
  and `idx === 0` is the one trustworthy answer to "is anything of ours behind
  us?", so `back()` never steps out of the app.
- **It survives a reload**, in `sessionStorage`. A refresh, a PWA relaunch, or
  an evicted tab drops the stack while leaving history untouched, and an
  amnesiac trail climbs to the parent with `replace` — laying a copy of the
  entry behind on top of it. The next press of the system back button then
  lands the reader on the page they are already looking at. `history.state`
  comes back from a reload intact, keys and all, so the trail comes with it.

When the trail cannot see what is behind — storage refused, or a stack from
another tab — `back()` steps rather than replaces. A step is never wrong by more
than a page; a replace over a real entry costs a press.

## What is built

Screens are complete against the handoff: home/router, resource chooser and
results, resource detail, crisis, events, event detail (RSVP, polls, reviews,
discussion, block/mute), host profile, Shop Queer map + finder, business detail
with the dynamic section system, profile (Saved · Themes · Contribute · Alerts ·
Account), sign-in, become-a-host, and user profiles. All 13 themes work app-wide.

User profiles, posts, likes and replies read and write the real tables. Event
RSVPs, polls and reviews still render against **deterministic local stand-ins**
because those tables ship empty; each stand-in is commented with the table it
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
- **Reviewer tooling.** Page requests are approved with a SQL call. An in-app
  queue for reviewers would replace that; the data model does not change.
