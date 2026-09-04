import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Where "back" goes.
 *
 * A back button that calls `nav(-1)` is only as good as the history behind it,
 * and the app pushes its way *up* as often as down: tapping back on a county
 * page used to push `/list/county`, so the next back walked the reader right
 * into the county they had just left instead of out to the splash page.
 *
 * So the trail keeps two things. The first is a stack of the entries the
 * reader actually visited, kept in step with the browser's own history — that
 * is the breadcrumb, and it is never drawn: it exists so the app knows where
 * someone came from. The second is `parentOf`, the directory's shape, which
 * answers the same question for a reader who arrived from a shared link with
 * no history at all.
 *
 * `back()` prefers the trail, because returning to the page you came from
 * restores its scroll position and its search box. It falls back to the parent
 * whenever the entry behind sits *below* the current page — the up-navigation
 * case above — or when there is no entry behind at all.
 *
 * The stack is indexed by, and survives alongside, the browser's own position
 * in history. Both halves matter, and getting either wrong shows up as a back
 * button that does nothing — see `depth` and `restore` below.
 */

const HOME = '/'

/** Tab roots. Nothing sits above them, so back never leaves one. */
const ROOTS = new Set([HOME, '/feed', '/events', '/shop', '/profile'])

/** Fixed pages whose parent is not derivable from the path alone. */
const PARENTS: Record<string, string> = {
  '/crisis': HOME,
  '/event': '/events',
  '/host': '/events',
  '/business': '/shop',
  '/upload': '/feed',
  '/u': '/feed',
  '/apply': '/profile',
  '/manage': '/profile',
  '/signin': '/profile',
  '/reset': '/signin',
  '/welcome': '/profile',
}

/**
 * The page one level up in the directory, ignoring how the reader got here.
 * `null` at a tab root, which is as far up as anything goes.
 */
function parentOf(path: string): string | null {
  const seg = path.split('/').filter(Boolean)
  if (!seg.length) return null

  const here = `/${seg.join('/')}`
  if (ROOTS.has(here)) return null

  // /list/:mode/:selection → /list/:mode → /
  if (seg[0] === 'list') return seg.length > 2 ? `/list/${seg[1]}` : HOME

  // A resource can be reached from four different lists, so the deep-link
  // fallback is the one list that always contains it.
  if (seg[0] === 'resource') return '/list/all'

  if (seg[0] === 'profile') return '/profile'

  return PARENTS[`/${seg[0]}`] ?? HOME
}

/** True when `path` sits somewhere under `ancestor` in the directory. */
function isBelow(path: string, ancestor: string): boolean {
  // Bounded rather than `while`: a bad PARENTS edit should not hang the app.
  let p = parentOf(path)
  for (let i = 0; p && i < 8; i++) {
    if (p === ancestor) return true
    p = parentOf(p)
  }
  return false
}

const MODE_LABELS: Record<string, string> = {
  county: 'Location Search',
  community: 'Community Search',
  category: 'Category Search',
  books: 'Books & Podcasts',
  all: 'All Resources',
}

const LABELS: Record<string, string> = {
  [HOME]: 'Resources',
  '/crisis': 'Crisis Resources',
  '/feed': 'Feed',
  '/events': 'Events',
  '/shop': 'Shop Queer',
  '/profile': 'Profile',
}

/**
 * What to call a destination. Used for the back button's accessible name, so a
 * screen reader announces the way out rather than a bare "Back". Detail pages
 * are titled by a row the trail cannot see, so they have no label.
 */
function labelFor(path: string): string | null {
  if (LABELS[path]) return LABELS[path]
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'list') {
    if (seg.length > 2) return decodeURIComponent(seg[2])
    return MODE_LABELS[seg[1]] ?? null
  }
  return null
}

interface Trail {
  /** Navigates one step out: the page behind, or the parent. */
  back: () => void
  /** Where `back()` lands, or null when it steps into unnamed history. */
  backLabel: string | null
}

const Ctx = createContext<Trail | null>(null)

interface Entry { key: string; path: string }

/**
 * How deep this tab sits in the history the app itself created. React Router
 * keeps the number in `history.state`, which makes it the one honest answer to
 * "is there anything behind us?" — it counts our own entries only, so 0 means
 * the reader arrived here cold and `nav(-1)` would take them out of the app.
 */
function depth(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  return typeof idx === 'number' && idx > 0 ? idx : 0
}

const SAVED = 'trail'

/**
 * The trail, reloaded.
 *
 * A refresh, a PWA relaunch, or the browser evicting the tab drops the stack
 * while leaving the browser's history untouched, and an amnesiac trail falls
 * through to the parent — which it reaches with `replace`, laying a copy of the
 * entry behind on top of it. The reader then presses the system back button and
 * lands on the page they are already looking at: a back button that plainly
 * does not work. `history.state` survives a reload intact, keys and all, so the
 * trail can too.
 */
function restore(key: string, at: number): Entry[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(SAVED) ?? 'null')
    if (!Array.isArray(saved)) return []
    // Browsers seed a new tab with a copy of its opener's sessionStorage, so a
    // stack that does not agree with where we actually are is somebody else's.
    const here = saved[at] as Entry | undefined
    return here && here.key !== key ? [] : (saved as Entry[])
  } catch {
    return []
  }
}

export function TrailProvider({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const nav = useNavigate()
  const stack = useRef<Entry[] | null>(null)

  const at = depth()
  if (stack.current === null) stack.current = restore(loc.key, at)

  // Kept in step during render rather than in an effect: a back button tapped
  // in the same commit as the navigation that revealed it must already see the
  // entry it is standing on. Writing at the browser's own index is what makes
  // that safe to repeat under StrictMode's double render, and it needs no guess
  // about how we got here: a push lands one slot deeper, a replace overwrites
  // the slot it is standing on, and a step back trims the slots ahead.
  const s = stack.current
  if (s.length > at + 1) s.length = at + 1
  s[at] = { key: loc.key, path: loc.pathname }

  useEffect(() => {
    try { sessionStorage.setItem(SAVED, JSON.stringify(stack.current)) } catch { /* private browsing */ }
  }, [loc.key, loc.pathname])

  /**
   * Where back goes: `step` to walk the browser's history, otherwise the path
   * to climb to. Shared by `back()` and its label so the two cannot disagree.
   */
  const route = useCallback((): { step: boolean; path: string | null } => {
    const here = loc.pathname
    const parent = parentOf(here) ?? HOME
    const i = depth()
    // A hole rather than an entry means the trail was lost and history was not
    // — the tab was reloaded with no session storage to read back.
    const prev: Entry | undefined = i > 0 ? stack.current?.[i - 1] : undefined

    // Nothing of ours behind: a shared link, opened cold. Climb, with `replace`,
    // so the page we leave cannot become the thing behind the one we land on.
    if (i === 0) return { step: false, path: parent }

    // Below us is the up-navigation we pushed on the way here; stepping back
    // into it would take the reader deeper. Identical means a redirect loop.
    if (prev && prev.path !== here && !isBelow(prev.path, here)) return { step: true, path: prev.path }

    // There is a real entry behind, so `replace` would bury a copy of it on top
    // of it and cost the reader a back press. Step back instead whenever that
    // is where we were headed anyway, or whenever we cannot see what is there.
    if (!prev) return { step: true, path: null }
    if (prev.path === parent) return { step: true, path: parent }

    return { step: false, path: parent }
  }, [loc.pathname])

  const back = useCallback(() => {
    const r = route()
    if (r.step) nav(-1)
    else nav(r.path ?? HOME, { replace: true })
  }, [nav, route])

  const value = useMemo<Trail>(() => {
    const to = route().path
    return { back, backLabel: to ? labelFor(to) : null }
  }, [back, route])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrail() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrail must be used inside TrailProvider')
  return ctx
}
