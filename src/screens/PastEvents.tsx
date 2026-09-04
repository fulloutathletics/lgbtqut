import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { entityRef } from '../lib/data'
import { Empty, SearchField, StickyBar } from '../components/ui'
import { EventCard, todayISO } from './Events'

/** Full history of past events, most recent first — the "view all" page linked from the Events dropdown. */
function PastEvents() {
  const data = useData()
  const { canSee } = useStore()
  const [q, setQ] = useState('')

  const events = useMemo(() => {
    if (!data) return []
    const today = todayISO()
    const needle = q.trim().toLowerCase()
    return data.events
      .filter((e) => e.starts_on < today)
      .filter((e) => canSee(e.age_rating))
      .filter((e) => {
        if (!needle) return true
        const org = entityRef(data, e.entity_kind, e.entity_id)
        return `${e.name} ${e.date_label} ${e.description} ${org?.name ?? ''}`
          .toLowerCase().includes(needle)
      })
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
  }, [data, q, canSee])

  if (!data) return <div />

  return (
    <>
      <StickyBar title="Past events" />
      <SearchField value={q} onChange={setQ} placeholder="Search past events" />

      <div style={{ padding: '12px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {events.length === 0 && <Empty>No past events yet.</Empty>}
        {events.map((e) => (
          <EventCard key={e.id} event={e} organiser={entityRef(data, e.entity_kind, e.entity_id)} />
        ))}
      </div>
    </>
  )
}

export default PastEvents
