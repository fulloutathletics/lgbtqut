import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { DEFAULT_THEME, THEMES } from './theme'
import type {
  AccountTier, Channels, EntityKind, ManagedPage, PageRequest, SavedEntry, SavedGroupKey,
} from './types'
import { SAVED_GROUP_KEYS } from './types'

// Anonymous state is device-only by design — the Saved and Alerts panes say so.
// Once signed in the same shape is mirrored to `public.saves`, so the local copy
// stays authoritative for the session and writes are pushed through.

const KEY = 'lgbtqut.state'
const SEEN_KEY = 'lgbtqut.lastSeen'

// An anonymous reader's follows and saves are the only copy that exists — there
// is no account to sync them to. They are kept so the feed has something to
// read, but they lapse after this long without opening the app, so a shared or
// borrowed device does not carry someone's interests forever.
const ANON_TTL_DAYS = 14

/** ms since the app was last opened, or null when there is no record. */
function idleFor(): number | null {
  const raw = localStorage.getItem(SEEN_KEY)
  if (!raw) return null
  const seen = Number(raw)
  return Number.isFinite(seen) ? Date.now() - seen : null
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())) } catch { /* private mode */ }
}

interface Persisted {
  theme: string
  saved: Record<string, SavedEntry>
  pauseAll: boolean
  blocked: string[]
  muted: string[]
  rsvp: Record<string, 'going' | 'interested' | 'cant_go'>
  votes: Record<string, number>
  hideAdult: boolean
  follows: string[]
  /** Shows the inline "change image" button on every content image. Local-only, off by default. */
  editMode: boolean
  /** Order the Saved pane lists its groups in, newest keys appended on read. */
  savedGroupOrder: SavedGroupKey[]
  /** Saved groups the reader has folded away. */
  savedGroupsCollapsed: SavedGroupKey[]
}

const EMPTY: Persisted = {
  theme: DEFAULT_THEME, saved: {}, pauseAll: false,
  blocked: [], muted: [], rsvp: {}, votes: {}, hideAdult: false, follows: [], editMode: false,
  savedGroupOrder: [...SAVED_GROUP_KEYS], savedGroupsCollapsed: [],
}

/**
 * Keeps a stored order usable when the app's group list changes: unknown keys
 * are dropped and any group added since the order was written is appended.
 */
function normaliseGroupOrder(order: unknown): SavedGroupKey[] {
  const kept = Array.isArray(order)
    ? (order.filter((k): k is SavedGroupKey => SAVED_GROUP_KEYS.includes(k as SavedGroupKey)))
    : []
  const seen = new Set(kept)
  return [...kept, ...SAVED_GROUP_KEYS.filter((k) => !seen.has(k))]
}

function read(): Persisted {
  try {
    const stored = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') } as Persisted
    return {
      ...stored,
      savedGroupOrder: normaliseGroupOrder(stored.savedGroupOrder),
      savedGroupsCollapsed: Array.isArray(stored.savedGroupsCollapsed) ? stored.savedGroupsCollapsed : [],
    }
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
  /** Public handle, when the personal profile has one. Routes to /u/:handle. */
  handle: string | null
  avatarUrl: string | null
  profileId: string | null
  /** Pages — resource, business, host — this account administers. */
  managed: ManagedPage[]
  /** Outstanding and recent requests to manage or add a page. */
  requests: PageRequest[]
}

const ANON_ACCOUNT: Account = {
  tier: 'anonymous', dob: null, username: null, displayName: null, handle: null,
  avatarUrl: null, profileId: null, managed: [], requests: [],
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
  setEditMode: (v: boolean) => void
  setRsvp: (eventId: string, status: 'going' | 'interested' | 'cant_go') => void
  /** Move a Saved group one place up or down the pane. */
  moveSavedGroup: (key: SavedGroupKey, dir: -1 | 1) => void
  /** Fold a Saved group away, or open it again. */
  toggleSavedGroup: (key: SavedGroupKey) => void
  isSavedGroupCollapsed: (key: SavedGroupKey) => boolean
  vote: (pollId: string, option: number) => void
  block: (name: string) => void
  unblock: (name: string) => void
  mute: (name: string) => void
  unmute: (name: string) => void
  isBlocked: (name: string) => boolean
  isMuted: (name: string) => boolean
  isFollowing: (profileId: string) => boolean
  toggleFollow: (profileId: string) => void
  /** Age in years from the stored DOB, or null when anonymous. */
  age: number | null
  canSee: (ageRating: string | null) => boolean
  signedIn: boolean
  /** Does this account administer the given page? Drives edit, post-as and host controls. */
  administers: (kind: EntityKind, id: string) => boolean
  /** Re-read the account after a write the session made (profile created, request filed). */
  refreshAccount: () => Promise<void>
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
  const [account, setAccount] = useState<Account>(ANON_ACCOUNT)
  const [userId, setUserId] = useState<string | null>(null)

  // Read during the first render, before the effect below overwrites the
  // stamp — otherwise the gap always measures as zero and never lapses.
  const [idleAtLoad] = useState(idleFor)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  // Stamped once per app open, so the TTL measures time away from the app
  // rather than time since the last tap.
  useEffect(() => { markSeen() }, [])

  // Auth uses Supabase's built-in email/password. The profile row holds DOB
  // for age gates and login_username for display. The social_profiles row
  // determines whether the user has a public-facing profile.
  useEffect(() => {
    let alive = true
    const sync = async (id: string | undefined) => {
      if (!alive) return
      setUserId(id ?? null)
      if (!id) {
        setAccount(ANON_ACCOUNT)
        // An anonymous reader keeps their follows and saves — they are what
        // fills the read-only feed, and there is no account to hold them.
        // They lapse only after ANON_TTL_DAYS of not opening the app.
        if (idleAtLoad !== null && idleAtLoad > ANON_TTL_DAYS * 86400000) {
          patch((s) => ({ ...s, follows: [], saved: {} }))
        }
        return
      }
      const next = await loadAccount(id)
      if (!alive || !next) return
      setAccount(next.account)
      patch((s) => ({ ...s, follows: next.follows }))
    }
    supabase.auth.getSession().then(({ data }) => {
      void sync(data.session?.user.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void sync(session?.user.id)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
    // idleAtLoad is set once from useState and never changes.
  }, [idleAtLoad])

  const refreshAccount = useCallback(async () => {
    if (!userId) return
    const next = await loadAccount(userId)
    if (!next) return
    setAccount(next.account)
    setState((s) => ({ ...s, follows: next.follows }))
  }, [userId])

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
      administers: (kind, id) => account.managed.some((m) => m.kind === kind && m.id === id),
      refreshAccount,
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
      setEditMode: (v) => patch((s) => ({ ...s, editMode: v })),

      setRsvp: (eventId, status) =>
        patch((s) => ({ ...s, rsvp: { ...s.rsvp, [eventId]: status } })),

      moveSavedGroup: (key, dir) =>
        patch((s) => {
          const order = normaliseGroupOrder(s.savedGroupOrder)
          const at = order.indexOf(key)
          const to = at + dir
          if (at < 0 || to < 0 || to >= order.length) return s
          const next = [...order]
          next[at] = next[to]
          next[to] = key
          return { ...s, savedGroupOrder: next }
        }),

      toggleSavedGroup: (key) =>
        patch((s) => ({
          ...s,
          savedGroupsCollapsed: s.savedGroupsCollapsed.includes(key)
            ? s.savedGroupsCollapsed.filter((k) => k !== key)
            : [...s.savedGroupsCollapsed, key],
        })),

      isSavedGroupCollapsed: (key) => state.savedGroupsCollapsed.includes(key),

      vote: (pollId, option) =>
        patch((s) => ({ ...s, votes: { ...s.votes, [pollId]: option } })),

      block: (name) => patch((s) => ({ ...s, blocked: [...new Set([...s.blocked, name])] })),
      unblock: (name) => patch((s) => ({ ...s, blocked: s.blocked.filter((n) => n !== name) })),
      mute: (name) => patch((s) => ({ ...s, muted: [...new Set([...s.muted, name])] })),
      unmute: (name) => patch((s) => ({ ...s, muted: s.muted.filter((n) => n !== name) })),
      isBlocked: (name) => state.blocked.includes(name),
      isMuted: (name) => state.muted.includes(name),

      isFollowing: (profileId) => state.follows.includes(profileId),
      toggleFollow: (profileId) =>
        patch((s) => {
          const following = s.follows.includes(profileId)
          const follows = following
            ? s.follows.filter((id) => id !== profileId)
            : [...new Set([...s.follows, profileId])]
          if (account.profileId) void syncFollow(account.profileId, profileId, !following)
          return { ...s, follows }
        }),

      // Anonymous users fail both thresholds regardless of any setting, because
      // no date of birth is on file.
      canSee: (ageRating) => {
        if (!ageRating) return true
        if (!signedIn || state.hideAdult || age === null) return false
        return age >= (ageRating === '21+' ? 21 : 18)
      },
    }
  }, [state, account, patch, refreshAccount])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Everything the app needs to know about who is signed in, in one round
// trip's worth of parallel reads. The profile row holds DOB for age gates and
// login_username for display; social_profiles says whether there is a
// personal public face; entity_admins lists the pages this person runs; and
// page_requests holds what they have asked for and are still waiting on.
async function loadAccount(userId: string): Promise<{ account: Account; follows: string[] } | null> {
  const [profile, social, followRows, adminRows, requestRows] = await Promise.all([
    supabase.from('profiles').select('id, login_username, dob').eq('id', userId).maybeSingle(),
    supabase.from('social_profiles').select('display_name, public_handle, avatar_url').eq('id', userId).maybeSingle(),
    supabase.from('follows').select('followee_id').eq('follower_id', userId),
    supabase.from('entity_admins').select('entity_kind, entity_id, role').eq('profile_id', userId),
    supabase.from('page_requests')
      .select('id, entity_kind, entity_id, proposed_name, status, created_at')
      .eq('profile_id', userId).order('created_at', { ascending: false }),
  ])
  if (!profile.data) return null
  const managed: ManagedPage[] = (adminRows.data ?? []).map((r) => ({
    kind: r.entity_kind as EntityKind, id: r.entity_id, role: r.role as ManagedPage['role'],
  }))
  // page_requests may not exist on a database behind this migration; an
  // error there costs the requests list, not sign-in.
  const requests = (requestRows.data ?? []) as PageRequest[]
  return {
    account: {
      tier: social.data ? 'public' : 'account',
      dob: profile.data.dob,
      username: profile.data.login_username,
      displayName: social.data?.display_name ?? null,
      handle: social.data?.public_handle ?? null,
      avatarUrl: social.data?.avatar_url ?? null,
      profileId: profile.data.id,
      managed,
      requests,
    },
    follows: (followRows.data ?? []).map((r) => r.followee_id),
  }
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

async function syncFollow(followerId: string, followeeId: string, follow: boolean) {
  if (follow) {
    await supabase.from('follows').upsert({ follower_id: followerId, followee_id: followeeId })
  } else {
    await supabase.from('follows').delete().match({ follower_id: followerId, followee_id: followeeId })
  }
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
