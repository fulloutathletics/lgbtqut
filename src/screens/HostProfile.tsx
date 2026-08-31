import { useNavigate, useParams } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { Verified } from '../components/icons'
import { SubscriptionPanel } from '../components/SubscriptionPanel'
import { EditImageButton } from '../components/EditImageButton'
import { Empty, Img, StickyBar, font } from '../components/ui'
import { EventCard } from './Events'

function HostProfile() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const nav = useNavigate()
  const { accent, tint, canSee, isSaved, toggleSave } = useStore()

  if (!data) return <div />

  const host = data.hosts.find((h) => h.id === id)

  if (!host) {
    return (
      <>
        <StickyBar title="Host" />
        <Empty>That host profile is no longer listed.</Empty>
      </>
    )
  }

  const saved = isSaved(host.id)
  // Only hosts tied to a real listing can send a newsletter.
  const allowNewsletter = !!(host.linked_business_id || host.linked_resource_id)

  const events = data.events
    .filter((e) => e.host_id === host.id)
    .filter((e) => canSee(e.age_rating))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))

  return (
    <>
      <StickyBar
        title={host.name}
        right={
          <div
            className="tap"
            role="button"
            onClick={() => toggleSave(host.id, 'host')}
            aria-label={saved ? 'Unfollow host' : 'Follow host'}
            style={{ height: 34, borderRadius: 999, background: saved ? tint : C.fill, display: 'flex',
                     padding: '0 13px', alignItems: 'center', justifyContent: 'center', flex: 'none',
                     font: font(700, 12.5, 1.2), color: saved ? accent : C.body }}
          >
            {saved ? 'Following' : 'Follow'}
          </div>
        }
      />

      {/* header image with the avatar overlapping its lower edge */}
      <div style={{ position: 'relative' }}>
        <div style={{ height: 132, background: tint, position: 'relative', overflow: 'hidden' }}>
          <Img src={host.header_url} alt=""
               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.18)' }} />
          <EditImageButton table="hosts" id={host.id} column="header_url" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -56, position: 'relative', zIndex: 2 }}>
          <div style={{ width: 112, height: 112, borderRadius: 999, overflow: 'hidden', background: '#fff',
                        border: '4px solid #fff', boxShadow: '0 6px 20px rgba(0,0,0,.25)', position: 'relative' }}>
            <Img src={host.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <EditImageButton table="hosts" id={host.id} column="image_url"
                             style={{ width: 28, height: 28, bottom: 4, right: 4 }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 20px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ font: font(800, 23, 1.2), color: C.ink, letterSpacing: '-.02em', textWrap: 'pretty' }}>
            {host.name}
          </div>
          {host.verified && <Verified size={21} color={accent} />}
        </div>

        <div style={{ font: font(400, 14, 1.4), color: '#87837C', marginTop: 6 }}>No reviews</div>

        {host.bio && (
          <div style={{ font: font(400, 14, 1.6), color: C.body, marginTop: 12, maxWidth: 320,
                        marginLeft: 'auto', marginRight: 'auto', textWrap: 'pretty' }}>
            {host.bio}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 14 }}>
          <div
            className="tap"
            role="button"
            onClick={() => toggleSave(host.id, 'host')}
            style={{ borderRadius: 999, padding: '9px 22px',
                     background: saved ? '#fff' : '#1A1A18',
                     border: `1.5px solid ${saved ? accent : '#1A1A18'}`,
                     font: font(700, 13, 1.2), color: saved ? accent : '#fff' }}
          >
            {saved ? 'Following' : 'Follow'}
          </div>
          <div
            className="tap"
            role="button"
            style={{ borderRadius: 999, padding: '9px 20px', border: '1.5px solid #E5E2DC',
                     font: font(600, 13, 1.2), color: '#2A2A28' }}
          >
            Report Profile
          </div>
        </div>

        {/* channels only exist once the host is saved */}
        {saved && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <SubscriptionPanel entityId={host.id} allowNewsletter={allowNewsletter} />
          </div>
        )}
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ border: '1px solid #EAE7E2', borderRadius: 12, padding: '13px 15px' }}>
          <div style={{ font: font(400, 12.5, 1.2), color: '#87837C' }}>Events hosted</div>
          <div style={{ font: font(700, 20, 1.2), color: '#161615', marginTop: 5 }}>{events.length}</div>
        </div>
      </div>

      <div style={{ padding: '22px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ font: font(700, 12, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                      color: C.faint }}>
          Events
        </div>
        {events.length === 0
          ? <Empty>No events listed yet.</Empty>
          : events.map((e) => <EventCard key={e.id} event={e} showHost={false} />)}
      </div>

      <div className="tap" role="button" onClick={() => nav('/events')}
           style={{ margin: '0 16px 12px', textAlign: 'center', font: font(600, 12.5, 1.3), color: accent }}>
        Browse all events
      </div>
    </>
  )
}

export default HostProfile
