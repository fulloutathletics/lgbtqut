import { useNavigate } from 'react-router-dom'
import { Alert, Chevron } from '../components/icons'
import { ProfileHeader, RouterCard, Tap, font } from '../components/ui'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import type { SplashTab } from '../lib/types'

/** The Books & Podcasts tab is a category slice, not a table of its own. */
const BOOK_CATEGORIES = ['Publications/Media', 'Blog', 'Video Project', 'Speaker Series']

/** Splash tabs are matched by name — the table carries no route column. */
const ROUTES: Record<string, string> = {
  'Crisis Resources': '/crisis',
  'Location Search': '/list/county',
  'Community Search': '/list/community',
  'Category Search': '/list/category',
  'Books & Podcasts': '/list/books',
  'All Resources': '/list/all',
}

const CRISIS_TAB = 'Crisis Resources'
const CRISIS_SUB = 'You are not alone. Help is available.'

const plural = (n: number) => `${n} ${n === 1 ? 'resource' : 'resources'}`

export default function Home() {
  const data = useData()
  const { canSee } = useStore()
  const nav = useNavigate()

  if (!data) return <div />

  const visible = data.resources.filter((r) => canSee(r.age_rating))
  const books = visible.filter((r) => BOOK_CATEGORIES.includes(r.category)).length

  // Every tab resolves to a slice of the same resource table, so the pill is
  // always a resource count — books is the only tab that narrows it.
  const countFor = (tab: SplashTab) => (tab.name === 'Books & Podcasts' ? books : visible.length)

  // Crisis gets the dedicated card at the top rather than a router card; the
  // remaining tabs render in source order, deliberately unsorted.
  const crisisTab = data.tabs.find((t) => t.name === CRISIS_TAB)
  const routerTabs = data.tabs.filter((t) => t.name !== CRISIS_TAB)

  return (
    <>
      <ProfileHeader title="Resources" tagline="Hope. Support. Belonging." />

      <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Tap
          onClick={() => nav('/crisis')}
          style={{ borderRadius: 14, background: '#1C1B1A', padding: '16px 18px', display: 'flex',
                   alignItems: 'center', gap: 14, boxShadow: '0 4px 16px rgba(0,0,0,.14)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 999, background: '#E4373C', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Alert />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: font(700, 15, 1.2), color: '#fff' }}>{crisisTab?.name ?? CRISIS_TAB}</div>
            <div style={{ font: font(400, 12.5, 1.35), color: '#B4B0AA', marginTop: 3 }}>
              {crisisTab?.subtitle || CRISIS_SUB}
            </div>
          </div>
          <Chevron color="#8A8680" />
        </Tap>

        {routerTabs.map((tab) => (
          <RouterCard
            key={tab.id}
            img={tab.image_url}
            title={tab.name}
            sub={tab.subtitle}
            count={plural(countFor(tab))}
            onClick={() => nav(ROUTES[tab.name] ?? '/list/all')}
            editImage={{ table: 'splash_tabs', id: tab.id, column: 'image_url' }}
          />
        ))}
      </div>
    </>
  )
}
