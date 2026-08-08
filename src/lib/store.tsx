import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { DEFAULT_THEME, THEMES } from './theme'
import type { AccountTier, Channels, EntityKind, SavedEntry } from './types'

// Anonymous state is device-only by design — the Saved and Alerts panes say so.
// Once signed in the same shape is mirrored to `public.saves`, so the local copy
// stays authoritative for the session and writes are pushed through.

const KEY = 'lgbtqut.state'

interface Persisted {
  theme: string
  saved: Record<string, SavedEntry>
  pauseAll: boolean
  blocked: string[]
  muted: string[]
  rsvp: Record<string, 'going' | 'interested' | 'cant_go'>
  votes: Record<string, number>
  hideAdult: boolean
}

const EMPTY: Persisted = {
  theme: DEFAULT_THEME, saved: {}, pauseAll: false,
  blocked: [], muted: [], rsvp: {}, votes: {}, hideAdult: false,
}

function read(): Persisted {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return EMPTY
  }
}

interface Account {
  tier: AccountTier
  /** Date of birth from sign-up. Anonymous users have none, so both gates fail. */
  dob: string | null
  username: string | null
  displayName: string | null
  profileId: string | null
}

interface Store extends Persisted {
  account: Account
  theme: string
  accent: string
  tint: string
  themeBar: string
  headerImg: string
  setTheme: (t: string) => void
  isSaved: (id: string) => boolean
  channels: (id: string) => Channels
  toggleSave: (id: string, kind: EntityKind) => void
  toggleChannel: (id: string, key: keyof Channels) => void
  setPauseAll: (v: boolean) => void
  setHideAdult: (v: boolean) => void
  setRsvp: (eventId: string, status: 'going' | 'interested' | 'cant_go') => void
  vote: (pollId: string, option: number) => void
  block: (name: string) => void
  unblock: (name: string) => void
  mute: (name: string) => void
  unmute: (name: string) => void
  isBlocked: (name: string) => boolean
  isMuted: (name: string) => boolean
  /** Age in years from the stored DOB, or null when anonymous. */
  age: number | null
  canSee: (ageRating: string | null) => boolean
  signedIn: boolean
}

const Ctx = createContext<Store | null>(null)

function yearsSince(dob: string): number {
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(read)
  const [account, setAccount] = useState<Account>({
    tier: 'anonymous', dob: null, username: null, displayName: null, profileId: null,
  })

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  // The session carries only the alias identity; the profile row supplies the
  // DOB the age gates read. No email is involved on either side.
  useEffect(() => {
    let alive = true
    const sync = async (userId: string | undefined) => {
      if (!userId) {
        if (alive) setAccount({ tier: 'anonymous', dob: null, username: null, displayName: null, profileId: null })
        return
      }
      const { data: profile } = await supabase
        .from('profiles').select('id, username, dob').eq('id', userId).maybeSingle()
      const { data: pub } = await supabase
        .from('public_profiles').select('display_name').eq('id', userId).maybeSingle()
      if (!alive || !profile) return
      setAccount({
        tier: pub ? 'public' : 'account',
        dob: profile.dob,
        username: profile.username,
        displayName: pub?.display_name ?? null,
        profileId: profile.id,
      })
    }
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user.id))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => sync(session?.user.id))
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const patch = useCallback((fn: (s: Persisted) => Persisted) => setState(fn), [])

  const value = useMemo<Store>(() => {
    const theme = THEMES[state.theme] ?? THEMES[DEFAULT_THEME]
    const signedIn = account.tier !== 'anonymous'
    const age = account.dob ? yearsSince(account.dob) : null

    return {
      ...state,
      account,
      signedIn,
      age,
      accent: theme.accent,
      tint: theme.tint,
      themeBar: theme.bar,
      headerImg: theme.img,

      setTheme: (t) => patch((s) => ({ ...s, theme: t })),

      isSaved: (id) => !!state.saved[id],

      channels: (id) => {
        const e = state.saved[id]
        return { events: e?.events ?? true, offers: e?.offers ?? true, newsletter: e?.newsletter ?? true }
      },

      toggleSave: (id, kind) =>
        patch((s) => {
          const saved = { ...s.saved }
          if (saved[id]) delete saved[id]
          // Saving subscribes to all three channels by default.
          else saved[id] = { kind, id, events: true, offers: true, newsletter: true }
          if (account.profileId) void syncSave(account.profileId, id, kind, saved[id])
          return { ...s, saved }
        }),

      toggleChannel: (id, key) =>
        patch((s) => {
          const entry = s.saved[id]
          if (!entry) return s
          const next = { ...entry, [key]: !entry[key] }
          if (account.profileId) void syncSave(account.profileId, id, entry.kind, next)
          return { ...s, saved: { ...s.saved, [id]: next } }
        }),

      setPauseAll: (v) => patch((s) => ({ ...s, pauseAll: v })),
      setHideAdult: (v) => patch((s) => ({ ...s, hideAdult: v })),

      setRsvp: (eventId, status) =>
        patch((s) => ({ ...s, rsvp: { ...s.rsvp, [eventId]: status } })),

      vote: (pollId, option) =>
        patch((s) => ({ ...s, votes: { ...s.votes, [pollId]: option } })),

      block: (name) => patch((s) => ({ ...s, blocked: [...new Set([...s.blocked, name])] })),
      unblock: (name) => patch((s) => ({ ...s, blocked: s.blocked.filter((n) => n !== name) })),
      mute: (name) => patch((s) => ({ ...s, muted: [...new Set([...s.muted, name])] })),
      unmute: (name) => patch((s) => ({ ...s, muted: s.muted.filter((n) => n !== name) })),
      isBlocked: (name) => state.blocked.includes(name),
      isMuted: (name) => state.muted.includes(name),

      // Anonymous users fail both thresholds regardless of any setting, because
      // no date of birth is on file.
      canSee: (ageRating) => {
        if (!ageRating) return true
        if (!signedIn || state.hideAdult || age === null) return false
        return age >= (ageRating === '21+' ? 21 : 18)
      },
    }
  }, [state, account, patch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

async function syncSave(
  profileId: string, entityId: string, kind: EntityKind, entry: SavedEntry | undefined,
) {
  if (!entry) {
    await supabase.from('saves').delete().match({ profile_id: profileId, kind, entity_id: entityId })
    return
  }
  await supabase.from('saves').upsert({
    profile_id: profileId, kind, entity_id: entityId,
    events: entry.events, offers: entry.offers, newsletter: entry.newsletter,
  })
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
