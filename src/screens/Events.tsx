import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import type { AppEvent, EntityRef } from '../lib/types'
import { entityHref, entityRef } from '../lib/data'
import { AgePill, Empty, Eyebrow, Img, ProfileHeader, SearchField, font } from '../components/ui'

/**
 * 16px radius, 1px border, soft card shadow, 190px cover.
 * The host row is its own tap target and swallows the event so it can route to
 * the host profile instead of opening the event. `showHost` is off on the host
 * profile itself, where repeating the host would be noise.
 */
export function EventCard({ event, organiser, showOrganiser = true }: {
  event: AppEvent
  /** Whoever runs it — a host, business or resource. */
  organiser?: EntityRef | null
  showOrganiser?: boolean
}) {
  const nav = useNavigate()

  return (
    <div
      className="tap"
      role="button"
      onClick={() => nav(`/event/${event.id}`)}
      style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#fff',
               boxShadow: '0 3px 14px rgba(0,0,0,.06)' }}
    >
      <div style={{ height: 190, background: '#F4F2EE', overflow: 'hidden' }}>
        <Img src={event.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Eyebrow>{event.date_label}</Eyebrow>
          {event.age_rating && <AgePill label={event.age_rating} />}
        </div>
        <div style={{ font: font(800, 19, 1.2), color: C.ink, marginTop: 7, letterSpacing: '-.01em',
                      textWrap: 'pretty' }}>
          {event.name}
        </div>
        {showOrganiser && organiser && (
          <div
            className="tap"
            role="button"
            onClick={(e) => { e.stopPropagation(); nav(entityHref(organiser)) }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}
          >
            <div style={{ width: 26, height: 26, borderRadius: 999, overflow: 'hidden', background: '#EFEDE9',
                          flex: 'none' }}>
              <Img src={organiser.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ font: font(500, 12.5, 1.3), color: '#7C7871', minWidth: 0, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {organiser.name}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BecomeHostCard() {
  const nav = useNavigate()
  const { accent } = useStore()

  return (
    <div
      className="tap"
      role="button"
      onClick={() => nav('/apply')}
      style={{ borderRadius: 16, border: '1.5px dashed #DAD6D0', padding: '22px 18px', textAlign: 'center',
               background: '#FBFAF8' }}
    >
      <div style={{ font: font(700, 15, 1.2), color: '#3A3A37' }}>Hosting something?</div>
      <div style={{ font: font(400, 13, 1.5), color: C.muted, marginTop: 6, textWrap: 'pretty' }}>
        Become a host to post events, offers and newsletters. Reviewed within two business days.
      </div>
      <div style={{ display: 'inline-block', marginTop: 13, borderRadius: 999, padding: '9px 20px',
                    background: accent, font: font(700, 13, 1.2), color: '#fff' }}>
        Become a host
      </div>
    </div>
  )
}

function Events() {
  const data = useData()
  const { canSee } = useStore()
  const [q, setQ] = useState('')

  // Chronological by start date — the one gallery in the app that is not
  // alphabetized. Age-restricted events the viewer cannot see are dropped with
  // no hidden-count note, so a minor is never told anything was filtered.
  const events = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.events
      .filter((e) => canSee(e.age_rating))
      .filter((e) => {
        if (!needle) return true
        const org = entityRef(data, e.entity_kind, e.entity_id)
        return `${e.name} ${e.date_label} ${e.description} ${org?.name ?? ''}`
          .toLowerCase().includes(needle)
      })
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  }, [data, q, canSee])

  if (!data) return <div />

  return (
    <>
      <ProfileHeader title="Events" tagline="Gatherings, festivals and mixers across Utah." />
      <SearchField value={q} onChange={setQ} placeholder="Search events" />

      <div style={{ padding: '12px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {events.length === 0 && <Empty>Nothing matches that search yet.</Empty>}
        {events.map((e) => (
          <EventCard key={e.id} event={e} organiser={entityRef(data, e.entity_kind, e.entity_id)} />
        ))}
        <BecomeHostCard />
      </div>
    </>
  )
}

export default Events
