import type { EntityKind } from '../lib/types'
import { entityRef, eventsFor } from '../lib/data'
import { useData } from '../lib/useData'
import { useStore } from '../lib/store'
import { C } from '../lib/theme'
import { font } from './ui'
import { EventCard } from '../screens/Events'

/**
 * The event card shown on an entity's own page. A business, resource and host
 * are faces of one profile, so each shows the same organiser's events —
 * whichever face the reader arrived through. Renders nothing when there are
 * none, so pages without events are unchanged.
 */
export function EntityEvents({ kind, id }: { kind: EntityKind; id: string }) {
  const data = useData()
  const { canSee } = useStore()

  const events = eventsFor(data, kind, id).filter((e) => canSee(e.age_rating))
  if (!events.length) return null

  return (
    <div style={{ padding: '26px 16px 0' }}>
      <div style={{ font: font(700, 12, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                    color: '#9A968F', marginBottom: 12 }}>
        {events.length === 1 ? 'Event' : 'Events'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map((e) => (
          <EventCard key={e.id} event={e} organiser={entityRef(data, kind, id)} showOrganiser={false} />
        ))}
      </div>
      <div style={{ height: 4, borderBottom: `1px solid ${C.hairline}`, marginTop: 26 }} />
    </div>
  )
}
