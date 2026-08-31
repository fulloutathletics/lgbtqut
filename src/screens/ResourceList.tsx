import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Empty, Img, ResultRow, RouterCard, SearchField, StickyBar, font } from '../components/ui'
import { alphabetical } from '../lib/data'
import { useStore } from '../lib/store'
import { SWATCH } from '../lib/theme'
import { useData } from '../lib/useData'
import type { Resource } from '../lib/types'

type Mode = 'county' | 'community' | 'category' | 'books' | 'all'

interface ModeMeta {
  /** Matches the Splash Page Tabs row, so the banner can borrow its tagline. */
  title: string
  tagline: string
  /** Books and All go straight to results — there is nothing to choose. */
  chooser: boolean
  searchHint: string
}

const MODES: Record<Mode, ModeMeta> = {
  county: {
    title: 'Location Search', tagline: 'Find resources near you',
    chooser: true, searchHint: 'Search counties on this page',
  },
  community: {
    title: 'Community Search', tagline: 'Search resources by demographic',
    chooser: true, searchHint: 'Search communities on this page',
  },
  category: {
    title: 'Category Search', tagline: 'Search resources by type',
    chooser: true, searchHint: 'Search categories on this page',
  },
  books: {
    title: 'Books & Podcasts', tagline: 'Books and podcasts with a Utah LGBTQ+ focus',
    chooser: false, searchHint: 'Search resources on this page',
  },
  all: {
    title: 'All Resources', tagline: 'See all our resources, listed alphabetically.',
    chooser: false, searchHint: 'Search resources on this page',
  },
}

const BOOK_CATEGORIES = ['Publications/Media', 'Blog', 'Video Project', 'Speaker Series']

const BANNER =
  'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/62OOPJBZPpU7jd1RdHF9.png'

const isMode = (m: string | undefined): m is Mode => !!m && m in MODES

/** The bucket a resource belongs to, per mode. A resource can span several. */
const keysOf = (r: Resource, mode: Mode): string[] =>
  mode === 'county' ? r.counties : mode === 'community' ? r.communities : [r.category]

export default function ResourceList() {
  const params = useParams<{ mode: string; selection?: string }>()
  const nav = useNavigate()
  const data = useData()
  const { canSee } = useStore()
  const [q, setQ] = useState('')

  const mode: Mode = isMode(params.mode) ? params.mode : 'all'
  const selection = params.selection ? decodeURIComponent(params.selection) : null
  const meta = MODES[mode]

  // A fresh query per level — the chooser search and the results search are
  // different questions.
  useEffect(() => { setQ('') }, [mode, selection])

  const visible = useMemo(
    () => (data ? data.resources.filter((r) => canSee(r.age_rating)) : []),
    [data, canSee],
  )

  const onChooser = meta.chooser && !selection
  const needle = q.trim().toLowerCase()

  const buckets = useMemo(() => {
    if (!onChooser) return []
    const counts = new Map<string, number>()
    for (const r of visible) {
      for (const key of keysOf(r, mode)) {
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return alphabetical([...counts].map(([name, count]) => ({ name, count })))
  }, [onChooser, visible, mode])

  const results = useMemo(() => {
    if (onChooser) return []
    let items = visible
    if (mode === 'books') items = items.filter((r) => BOOK_CATEGORIES.includes(r.category))
    if (selection) items = items.filter((r) => keysOf(r, mode).includes(selection))
    return alphabetical(items)
  }, [onChooser, visible, mode, selection])

  if (!data) return <div />

  const shownBuckets = needle ? buckets.filter((b) => b.name.toLowerCase().includes(needle)) : buckets
  const shownResults = needle
    ? results.filter((r) => `${r.name} ${r.category} ${r.description}`.toLowerCase().includes(needle))
    : results

  const title = selection ?? meta.title
  const tagline = data.tabs.find((t) => t.name === meta.title)?.subtitle || meta.tagline
  const hint = selection ? `Search in ${selection}` : meta.searchHint

  return (
    <>
      <StickyBar
        title={title}
        onBack={selection ? () => nav(`/list/${mode}`) : undefined}
      />

      {onChooser && (
        <div style={{ position: 'relative', height: 104, overflow: 'hidden', background: '#2A2438' }}>
          <Img src={BANNER} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0,
                        background: 'linear-gradient(180deg,rgba(0,0,0,.52),rgba(0,0,0,.62))' }} />
          <div style={{ position: 'absolute', left: 18, right: 18, top: '50%', transform: 'translateY(-50%)' }}>
            <div style={{ font: font(800, 22, 1.15), color: '#fff', letterSpacing: '-.02em',
                          textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>{meta.title}</div>
            <div style={{ font: font(400, 13, 1.35), color: 'rgba(255,255,255,.82)', marginTop: 5,
                          textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>{tagline}</div>
          </div>
        </div>
      )}

      <SearchField value={q} onChange={setQ} placeholder={hint} />

      {onChooser ? (
        <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shownBuckets.map((b, i) => {
            // Only the six counties carry photography; everything else rotates
            // through the fallback swatches.
            const img = mode === 'county' ? data.countyImages[b.name] : undefined
            return (
              <RouterCard
                key={b.name}
                img={img || undefined}
                bg={img ? undefined : SWATCH[i % SWATCH.length]}
                title={b.name}
                count={`${b.count} ${b.count === 1 ? 'resource' : 'resources'}`}
                onClick={() => nav(`/list/${mode}/${encodeURIComponent(b.name)}`)}
                editImage={mode === 'county' ? { table: 'county_images', id: b.name, column: 'image_url' } : undefined}
              />
            )
          })}
          {!shownBuckets.length && <Empty>No matches. Try a different search.</Empty>}
        </div>
      ) : (
        <div style={{ padding: '6px 0 24px' }}>
          {shownResults.map((r) => (
            <ResultRow
              key={r.id}
              img={r.image_url}
              name={r.name}
              meta={[r.category, r.county || r.counties[0] || 'Statewide'].filter(Boolean).join(' · ')}
              verified={r.verified}
              agePill={r.age_rating}
              onClick={() => nav(`/resource/${r.id}`)}
            />
          ))}
          {!shownResults.length && <Empty>No matches. Try a different search.</Empty>}
        </div>
      )}
    </>
  )
}
