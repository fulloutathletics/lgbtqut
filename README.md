# LGBTQ.UT

Utah queer resource directory — resources, events, and affirming businesses. A Vite + React PWA backed by Supabase.

See `design_handoff_lgbtq_ut_app/` (not committed — provided out of band) for the full design/engineering handoff, including the auth spec that must be read before implementing sign-in: the app database never stores a user's raw email.

## Setup

```bash
npm install
cp .env.example .env   # fill in Supabase + VAPID values
npm run dev
```

## Environment variables

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — from Supabase project Settings → API.
- `VITE_VAPID_PUBLIC_KEY` — for Web Push. Generate a pair with `npx web-push generate-vapid-keys`; keep the private key server-side only (Edge Function secret), never in the client env.

## Structure

- `src/lib/supabase.ts` — Supabase client.
- `src/lib/push.ts` — Web Push subscription helper (push carries all messaging since there's no stored email).
- `supabase/functions/` — Edge Functions (e.g. transactional email).

## Status

Scaffold only: Supabase client wired up, PWA manifest/service worker configured, no screens or data model built yet. Recommended build order per the handoff doc: auth → data model → read-only screens → social features.
