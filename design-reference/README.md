# Handoff: LGBTQ.UT — Utah Queer Resource App

## Overview

A mobile app for finding LGBTQ+ resources, events, and affirming businesses across Utah. It replaces an existing Glide app, with two goals the Glide version could not meet: **backend-configured page layouts** (a listing's presentation is data, not code) and **an authentication model where the application database never stores a user's email address**.

The prototype runs on the client's real production data exported from Glide: 171 resources, 36 businesses, 6 router tabs, 2 events, 2 event hosts.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. `LGBTQ UT App.dc.html` is a single-file prototype using a custom template runtime; do not port that runtime.

The task is to **recreate these designs in the target codebase's environment** using its established patterns. If no codebase exists yet, React Native or Expo is the natural fit: the design is phone-first, needs push notifications, and assumes an App Store presence. The data layer is specified as Supabase throughout.

Read `Auth Handoff Spec.html` before implementing sign-in. It is a complete engineering spec — schema, RLS policies, Edge Function pseudocode, and the operational rules that make the privacy claim true rather than aspirational. Several of its rules exist because Supabase's defaults work against the design.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-accurately using the target codebase's component library. Every measurement below is taken from the prototype source.

Two caveats:
- **Font**: Garet (commercial, licensed by the client) is the intended typeface. Files were not available, so the prototype falls back to **Outfit** (Google Fonts). The stack is `Garet, Outfit, sans-serif` throughout. Ship Garet when licensed.
- **Imagery**: images are live Glide CDN URLs. Six county photos and a handful of business images resolve; everything else falls back to a hatched placeholder. Real photography is outstanding.

---

## Screens / Views

### 1. Resources (home / router)

**Purpose** — entry point. Routes into the resource directory six ways.

**Layout** — Profile header (158px rainbow gradient banner, 104px circular logo centered and overlapping by 52px, page title + tagline centered below), then a 16px-padded column with 14px gaps.

**Components**
- **Crisis card** — full width, `#1C1B1A` background, 14px radius, 16px/18px padding, flex row with 14px gap. 40px circular `#E4373C` icon well. Title 15px/700 white; subtitle 12.5px/400 `#B4B0AA`. Chevron right, `#8A8680`. Taps to the Crisis screen.
- **Router cards** — full width, **240px tall**, 14px radius, cover image with a 160° scrim (`rgba(0,0,0,.62)` → `.05`). Title 18px/700 white at top-left with `0 1px 6px rgba(0,0,0,.45)` shadow; subtitle 12.5px/400 `rgba(255,255,255,.88)`. Count pill bottom-right: `rgba(255,255,255,.92)`, 999px radius, 4px/11px padding, 11px/600 `#2A2A28`.
- Cards come from the Splash Page Tabs table in source order (**not** alphabetized — this is deliberate and differs from every other gallery).

### 2. Resource list (chooser → results)

**Purpose** — two-level drill-down: pick a county / category / community, then browse its resources.

**Layout** — Sticky bar (56px top padding for the status bar, 34px circular back button, screen title). Below it, on the **chooser level only**, a 104px darkened banner image with title + tagline. Then the search field. Then content.

**Components**
- **Search** — `#F3F1ED` fill, 11px radius, 9px/12px padding, magnifier icon `#938F88`, 14px/400 input. Placeholder is screen-specific: "Search counties on this page", "Search in Salt Lake County", etc.
- **Chooser cards** — identical to the home router cards: full width, 240px, count pill reading "N resources". Six counties carry real photos; categories and communities fall back to a rotating 8-color swatch set.
- **Result rows** — 50px rounded-11px thumbnail, name 14.5px/600, meta 11.5px/400 `#89857E` reading "Category · County", chevron. 1px `#F3F0EC` separators.
- **Verified badge** — 15px scalloped seal filled with the theme accent, white check, inline after the name.

**Behavior** — selecting a chooser card replaces the sticky title with the selection ("Cache County"). Back steps up to the chooser before leaving the screen. The banner is hidden on the results level. Galleries are alphabetized everywhere except home.

### 3. Resource detail

**Layout** — Sticky bar (back, truncated name, heart). 4:3 cover image on the theme tint. Then 18px-padded content.

**Components**
- Title 25px/800, `-.02em` tracking.
- **Subscription panel** (only when saved) — see *Subscriptions* below.
- Description 15px/1.6 `#33322F`, preserving source line breaks.
- **Action rows** — one per populated column: Website, Facebook, Instagram, Telephone (labeled "Hotline" when the number matches a toll-free pattern), Email, Address. Label 15px/700, value 14px/400 `#6E6A64`, chevron. Each opens the correct handler: `https://`, `tel:`, `mailto:`, Google Maps.

No tags — they were removed deliberately; the taxonomy is already expressed by how the user navigated here.

### 4. Events

**Layout** — Profile header, search field, then 16px-padded column of cards with 16px gaps.

**Components**
- **Event card** — 16px radius, 1px `#EDEAE5` border, `0 3px 14px rgba(0,0,0,.06)` shadow. 190px cover image. Date 11px/700 uppercase in the accent, `.09em` tracking, with an optional age pill (`#EFEBE4` fill, `#7A6E58` text). Name 19px/800. Host row: 26px avatar, name 12.5px/500, taps through to the host profile.
- **Become a host card** — 1.5px dashed `#DAD6D0`, opens the host application flow.

Events are chronological, not alphabetized.

### 5. Event detail

The most feature-dense screen. Order: hero → title block → RSVP → warnings → host controls → host card → details → poll → reviews → discussion.

**Upcoming events**
- **Avatar stack** — 30px circles, 2px white border, `-9px` overlap, initials 10.5px/700. Overflow chip shows "+142". Each avatar opens that person's profile.
- **Counts** — "148 going · 62 interested", updating live with your own RSVP.
- **RSVP** — three equal buttons (Going / Interested / Can't go). Active: accent fill, white text. Inactive: `#F3F1ED` fill, 1.5px `#EAE7E2` border.
- **Poll** — 16px-padded card. Options are tap targets with a `width` transition (`.35s cubic-bezier(.22,1,.36,1)`) revealing a tinted fill and percentage. **Results stay hidden until the user votes** (hosts and past events always see them).

**Past events** — RSVP is replaced by an ended notice; a Reviews block appears with a 34px/800 average, tappable 5-star rating, and the review list. Reviews exist only after the event date.

**Host mode** — a black-headed Host Controls panel: post an update, create a poll, see the guest list, edit details.

**Discussion** — 34px avatar, name, HOST badge where applicable, relative timestamp, body 13.5px/1.55. Muted authors collapse to a tappable "Hidden — you muted X". Blocked authors are removed entirely and excluded from the count. Composer posts under the current display name.

### 6. Host profile

Header image with a 112px centered avatar overlapping it. Name with verified badge, review count, Follow / Report buttons, subscription panel, events-hosted count, then that host's event cards.

### 7. Shop Queer (map + finder)

**Layout** — Profile header, search, then a **Leaflet map** (Carto light tiles) at 244px, then the business list on an 18px-radius sheet that overlaps the map by 10px.

**Map** — circle markers at 7px radius, accent fill, 2px white border, name tooltip on hover, tap opens the business. Auto-fits bounds, max zoom 9. Geocoding is a city lookup table with a county-centroid fallback — **replace with real coordinates**.

**List rows** — 56px thumbnail on the business's brand color, name with verified badge and optional age pill, meta "County · Tag".

Three layouts exist behind a prop: Split (default), Map first (400px), List first (104px).

### 8. Business detail — the dynamic section system

**This is the most important screen to understand.** Presentation is configured per business in the database; the front end reads three fields and renders accordingly.

```
coupons: [{ title, terms, code, expires }]
sections: [{                      // max 2
  title, sub,
  layout: { type, size, orient },
  items:  [{ img, title, sub, value, link }]
}]
```

- `type` — `carousel` | `stack` | `grid` | `list`
- `size` — `large` | `medium` | `small`
- `orient` — `horizontal` | `vertical` | `full` | `tile`

Size and orientation resolve through a lookup table:

| Key | Card width | Card height |
|---|---|---|
| large-horizontal | 294px | 198px |
| medium-horizontal | 214px | 142px |
| small-horizontal | 150px | 100px |
| large-vertical | 186px | 256px |
| medium-vertical | 150px | 206px |
| large-full | auto | 206px |
| medium-full | auto | 150px |
| large-tile | auto | 128px |
| medium-tile | auto | 104px |

**Page order** — hero → photo carousel (294×198 scroll-snap, dot indicators that track scroll position) → coupon carousel → up to two dynamic sections → Visit action rows.

**Coupon card** — 262px wide, 1.5px dashed border in the business color at 40% alpha, 12% tint fill. Title 19px/800 in the business color, terms 12.5px/400, code in a white chip with `.06em` tracking, expiry right-aligned.

Four worked examples ship in the prototype: a restaurant (full-width menu stack + medium catering rail), a salon (priced list with no imagery + vertical gallery), a gym (schedule list + tile grid), a bookstore (event rail + staff-picks grid).

Two hero treatments exist behind a prop: Glide match (200px banner, 96px overlapping logo tile) and Editorial (330px full-bleed with bottom scrim and 30px title).

### 9. Profile

Segmented pill bar — **Saved · Themes · Contribute · Alerts · Account** — switching panes below.

- **Saved** — device-only notice for anonymous users, then saved resources, businesses, and hosts.
- **Themes** — 7 standard solid colors, 6 pride themes (LGBTQ, Trans, Bi, MLM, Asexual, Roy G. Biv). Themes swap the header, accent, and card tint app-wide.
- **Contribute** — become a host, submit a resource, suggest a business, report a listing.
- **Alerts** — pause-all master switch, per-listing subscriptions with expandable channels, plus two first-party broadcasts.
- **Account** — identity tier, sign-in rows, public profile editor, blocked/muted list, age settings.

### 10. Become a host

Four steps, adapting to the user's assignments:
1. **Identity** — only listings an admin assigned to this account appear. **Self-claiming is not possible**; this was an explicit requirement.
2. **Choose listing** — short list of assigned entities. Search appears only above 6.
3. **Profile** — every field tagged FROM LISTING or HOST ONLY. Verification inherits from the linked entity.
4. **Channels** — Events locked on. Offers defaults on for businesses. **Newsletter requires a linked business or resource** and is disabled otherwise.

Then a review summary and a pending-approval screen with a three-stage timeline. Users with no assignments skip step 1 and get a three-step flow that asks for proof of affiliation.

### 11. User profiles

Centered layout: 96px avatar over a 132px color header, name, pronouns chip, area, bio (300px max width), then style-specific content.

Three layouts behind a prop — **Social is the default**: interest chips, three bordered stat tiles, full-width link buttons. Community uses a stat strip between rules plus a "Going to" card. Minimal is bio and link rows only.

Own profile shows Edit. Others show Mute / Block / Report. **Blocked profiles render a stub** — avatar and name only, so the user knows who they are unblocking, with everything else suppressed.

**Edit screen** — Cancel/Save header, photo and background pickers, inputs for display name, pronouns, area, bio, and links (one per line). Saving propagates to the account pane and to comment attribution.

---

## Interactions & Behavior

### Subscriptions
Saving a business, resource, or host subscribes the user to **three channels: Events, Offers, Newsletter**, all on by default.

- The detail page shows a collapsed row: "Subscribed / Events, offers and newsletters" with a chevron. Expanding reveals a toggle per channel.
- The summary line rewrites itself: "Events and Newsletter", "Offers", "Not receiving updates".
- Hosts without a linked listing do not offer the Newsletter channel.
- Profile → Alerts lists every subscription with the same expandable channels, plus a pause-all master switch.

### Block vs mute
- **Block is mutual and total.** Comments removed from the thread and from the count, reviews removed from the list (**but not from the event's average rating**), face removed from the guest stack, profile reduced to a stub. The event warning still fires — knowing they'll be there is the point.
- **Mute is one-directional and soft.** Comments collapse behind a tap, reviews are hidden, they can still see you.

### Age gating
`18+` and `21+` are separate thresholds evaluated against the stored date of birth. Anonymous users fail both regardless of any setting, because no DOB is on file.

**Critically: minors are never told content was filtered.** No hidden-count note, no age-settings section, and the interstitial reads only "Not available. This listing is not available on your account" with no tag or reason. The explanatory version appears **only** for adults who deliberately opted out.

### Account tiers
1. **Anonymous** — search, save, alerts, all cached on-device only. Cannot comment, RSVP, review, or see age-restricted listings. Both Saved and Alerts carry a notice that data does not persist.
2. **Account** — username, DOB, and a hashed email. Full participation. Nothing public.
3. **Public profile** — adds name, images, pronouns, bio, links.

### Transitions
- Taps: `transform .12s ease`, `scale(.985)` active.
- Toggles: `background .18s ease`.
- Poll bars: `width .35s cubic-bezier(.22,1,.36,1)`.
- Chevron rotation: `transform .2s ease`.

---

## State Management

Client state in the prototype, and where each belongs in production:

| State | Purpose | Production home |
|---|---|---|
| `tab`, `stack` | Navigation, screen params | Router |
| `saved` | id → { kind, id } | Server, keyed to user |
| `chan` | Per-listing channel overrides | Server |
| `pauseAll` | Master notification switch | Server |
| `blocked`, `muted` | Moderation, by user | Server |
| `rsvp`, `votes`, `myReview` | Event participation | Server |
| `posted` | Optimistic comments | Server + local queue |
| `profile` | Public profile fields | `public_profiles` table |
| `theme` | Selected theme | Local, synced |
| `hideAdult` | Adult opt-out | Server (with DOB) |
| `q`, `sel`, `openPanels` | Ephemeral UI | Local only |

**Data fetching** — resources, businesses, and splash tabs are static enough to cache aggressively. Events, comments, polls, and RSVP counts need realtime or short polling. Supabase Realtime on the comments and RSVP tables is the natural fit.

---

## Design Tokens

### Color

| Token | Value | Use |
|---|---|---|
| Page | `#FFFFFF` | Screen background |
| Ink | `#111111` / `#141413` | Titles |
| Body | `#3D3C39` / `#4A4945` | Body copy |
| Muted | `#89857E` / `#8C887F` | Secondary |
| Faint | `#A19D95` / `#9A968F` | Labels, timestamps |
| Hairline | `#F1EEEA` / `#F3F0EC` | Separators |
| Border | `#EDEAE5` / `#E5E2DC` | Card borders |
| Fill | `#F3F1ED` / `#F7F5F1` | Inputs, wells |
| Crisis | `#E4373C` on `#1C1B1A` | Crisis card |
| Danger | `#B4494E` / `#7C3438` on `#FBF3F3` | Block warnings |
| Success | `#2E8B5F` on `#F2F8F5` | Verification |
| Age pill | `#7A6E58` on `#EFEBE4` | 18+ / 21+ |

### Themes
Each theme supplies a header treatment, an accent, and a card tint. Accent drives buttons, active nav, verified badges, links, and toggles.

**Standard** — Red `#D62839`, Orange `#DD6317`, Yellow `#D19A00`, Green `#2E8B45`, Blue `#1F6FD0`, Indigo `#4B3FBF`, Violet `#8E2FA8`.

**Pride** — LGBTQ (accent `#7A2FA6`, tint `#F6F1FA`, six-stop flag gradient), Trans (`#2C86B5` / `#EDF7FC`), Bi (`#9B4F96` / `#F8F0F7`), MLM (`#2A7F70` / `#EDF7F4`), Asexual (`#6B2E7A` / `#F5F0F7`), Roy G. Biv (`#C2453B` / `#FBF1EF`, uses a supplied header image).

### Typography
`Garet, Outfit, sans-serif` — weights 400/500/600/700/800.

| Role | Size / weight / leading | Tracking |
|---|---|---|
| Page title | 27px / 800 / 1.15 | `-.02em` |
| Detail title | 25px / 800 / 1.16 | `-.02em` |
| Section head | 21px / 800 / 1.2 | `-.01em` |
| Card title | 19px / 800 / 1.2 | `-.01em` |
| Row title | 14.5px / 600 / 1.25 | — |
| Body | 15px / 400 / 1.6–1.65 | — |
| Meta | 11.5–12.5px / 400 / 1.3–1.45 | — |
| Eyebrow | 11–12px / 700 uppercase | `.09–.1em` |
| Nav label | 9.5px / 600 | — |

### Spacing
4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 26 / 28. Screen gutters 16–18px.

### Radius
4px tags · 7–11px chips and wells · 12–14px cards · 16px event cards · 18px sheets · 999px pills and avatars.

### Shadow
- Card: `0 3px 14px rgba(0,0,0,.06)`
- Raised: `0 4px 16px rgba(0,0,0,.18)`
- Avatar: `0 6px 20px rgba(0,0,0,.22)`
- Toggle knob: `0 1px 3px rgba(0,0,0,.28)`

### Touch targets
Nav items, toggles, and buttons are 44px minimum. Toggle 44×26 with a 20px knob and 3px inset.

---

## Assets

| Asset | Source | Status |
|---|---|---|
| App logo | Glide CDN, client-supplied | In use |
| County photos (6) | Glide CDN, client-supplied | In use |
| Sub-page banner | Glide CDN, client-supplied | In use |
| Roy G. Biv header | Glide CDN, client-supplied | In use |
| Host images | Glide CDN | In use |
| Business images | Glide CDN | Partial — most missing |
| Category / community art | — | **Outstanding** |
| Garet font | Client-licensed | **Outstanding** — falls back to Outfit |

Migrate all Glide CDN assets to your own storage before launch; those URLs die with the Glide subscription.

---

## Files

| File | What it is |
|---|---|
| `LGBTQ UT App.html` | The prototype. Open in a browser. |
| `Auth Handoff Spec.html` | Authentication engineering spec. Read before implementing sign-in. |
| `app-data.js` | Real data extracted from the client's Glide exports. |
| `source-data/` | Original CSV exports. |

The prototype has a jump strip beneath the phone linking every screen, and a Tweaks panel exposing account tier, age bracket, host mode, entity assignments, and all layout variants.

---

## Recommended order

1. **Auth first.** It constrains everything — no email means push notifications carry all messaging, and the age gate depends on the DOB captured at sign-up.
2. **Data model second**, including the business `sections` config. Retrofitting it is painful.
3. **Read-only screens third**: home, lists, details, map. This is most of the app's value and needs no accounts.
4. **Social last**: RSVPs, comments, polls, reviews, blocking, host tools.

Steps 1–3 are a shippable product. Step 4 is where moderation load begins, and it should not launch without the moderation queue.
