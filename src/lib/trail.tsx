import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

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

export function TrailProvider({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const type = useNavigationType()
  const nav = useNavigate()
  const stack = useRef<Entry[]>([])

  // Kept in step during render rather than in an effect: a back button tapped
  // in the same commit as the navigation that revealed it must already see the
  // entry it is standing on. The updates are idempotent per history key, which
  // is what makes that safe under StrictMode's double render.
  const s = stack.current
  const top = s[s.length - 1]
  if (top?.key === loc.key) {
    top.path = loc.pathname
  } else {
    const seen = s.findIndex((e) => e.key === loc.key)
    if (seen >= 0) s.length = seen + 1                                     // stepped back
    else if (type === 'REPLACE' && s.length) s[s.length - 1] = { key: loc.key, path: loc.pathname }
    else s.push({ key: loc.key, path: loc.pathname })                      // pushed, or stepped forward
  }

  /** The entry behind this one, when it is a sane way out. */
  const previous = useCallback(() => {
    const st = stack.current
    if (st.length < 2) return null
    const here = st[st.length - 1].path
    const prev = st[st.length - 2].path
    // Below us is the up-navigation we pushed on the way here; stepping back
    // into it would take the reader deeper. Identical means a redirect loop.
    if (prev === here || isBelow(prev, here)) return null
    return prev
  }, [])

  const back = useCallback(() => {
    if (previous()) { nav(-1); return }
    // `replace`, so the page we are leaving does not become the thing behind
    // the page we land on — that is the loop this whole module exists to break.
    nav(parentOf(loc.pathname) ?? HOME, { replace: true })
  }, [nav, previous, loc.pathname])

  const value = useMemo<Trail>(
    () => ({ back, backLabel: labelFor(previous() ?? parentOf(loc.pathname) ?? HOME) }),
    [back, previous, loc.pathname],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrail() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrail must be used inside TrailProvider')
  return ctx
}
