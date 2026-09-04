import { useParams } from 'react-router-dom'
import { AgeGate } from '../components/AgeGate'
import { EditImageButton } from '../components/EditImageButton'
import { AdminEditButton } from '../components/AdminEditButton'
import { EntityEvents } from '../components/EntityEvents'
import { ManageStrip } from '../components/ManageStrip'
import { RichText } from '../components/RichText'
import { SubscriptionPanel } from '../components/SubscriptionPanel'
import { Verified } from '../components/icons'
import { ActionRow, Empty, Img, StickyBar, Tap, font } from '../components/ui'
import { isHotline, mapHref, telHref, webHref } from '../lib/data'
import { useStore } from '../lib/store'
import { C } from '../lib/theme'
import { useData } from '../lib/useData'

/** Contact values read as the thing itself, not as a URL. */
const host = (url: string) =>
  url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')

const filled = (v: string | null | undefined): v is string => !!v && v.trim().length > 0

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const { accent, tint, isSaved, toggleSave, canSee } = useStore()

  if (!data) return <div />

  const r = data.resources.find((x) => x.id === id)
  if (!r) {
    return (
      <>
        <StickyBar title="" />
        <Empty>This listing is no longer available.</Empty>
      </>
    )
  }

  // Minors are never told why — AgeGate owns that wording.
  if (!canSee(r.age_rating)) return <AgeGate reason={r.age_reason} />

  const saved = isSaved(r.id)

  const rows: Array<{ label: string; value: string; href: string }> = []
  if (filled(r.website)) rows.push({ label: 'Website', value: host(r.website), href: webHref(r.website.trim()) })
  if (filled(r.facebook)) rows.push({ label: 'Facebook', value: host(r.facebook), href: webHref(r.facebook.trim()) })
  if (filled(r.instagram)) rows.push({ label: 'Instagram', value: host(r.instagram), href: webHref(r.instagram.trim()) })
  if (filled(r.telephone)) {
    rows.push({
      label: isHotline(r.telephone) ? 'Hotline' : 'Telephone',
      value: r.telephone.trim(),
      href: telHref(r.telephone),
    })
  }
  if (filled(r.email)) rows.push({ label: 'Email', value: r.email.trim(), href: `mailto:${r.email.trim()}` })
  if (filled(r.address)) rows.push({ label: 'Address', value: r.address.trim(), href: mapHref(r.address.trim()) })

  return (
    <>
      <StickyBar
        title={r.name}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <AdminEditButton section="resources" id={r.id} />
            <Tap
              onClick={() => {
                const url = window.location.href
                if (navigator.share) {
                  void navigator.share({ title: r.name, text: `${r.name} on LGBTQ UT`, url })
                } else {
                  void navigator.clipboard.writeText(url)
                }
              }}
              aria-label="Share resource"
              style={{ height: 34, borderRadius: 999, background: C.fill, display: 'flex', padding: '0 13px',
                       alignItems: 'center', justifyContent: 'center', flex: 'none',
                       font: font(700, 12.5, 1.2), color: C.body }}
            >
              Share
            </Tap>
            <Tap
              onClick={() => toggleSave(r.id, 'resource')}
              aria-label={saved ? 'Unfollow resource' : 'Follow resource'}
              style={{ height: 34, borderRadius: 999, background: saved ? tint : C.fill, display: 'flex',
                       padding: '0 13px', alignItems: 'center', justifyContent: 'center', flex: 'none',
                       font: font(700, 12.5, 1.2), color: saved ? accent : C.body }}
            >
              {saved ? 'Following' : 'Follow'}
            </Tap>
          </div>
        }
      />

      <ManageStrip kind="resource" id={r.id} />

      <div style={{ width: '100%', aspectRatio: '4/3', background: tint, overflow: 'hidden', position: 'relative' }}>
        <Img src={r.image_url} alt={r.name} priority
             style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <EditImageButton table="resources" id={r.id} column="image_url" />
      </div>

      <div style={{ padding: '20px 18px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ font: font(800, 25, 1.16), color: C.ink, letterSpacing: '-.02em',
                        textWrap: 'pretty', flex: 1, minWidth: 0 }}>{r.name}</div>
          {r.verified && (
            <div style={{ marginTop: 4, flex: 'none' }}><Verified size={21} color={accent} /></div>
          )}
        </div>

        {saved && (
          <div style={{ marginTop: 16 }}>
            <SubscriptionPanel entityId={r.id} />
          </div>
        )}

        {filled(r.description) && (
          <div style={{ font: font(400, 15, 1.6), color: '#33322F', marginTop: 14,
                        whiteSpace: 'pre-wrap', textWrap: 'pretty' }}><RichText text={r.description} /></div>
        )}

        {rows.length > 0 && (
          <div style={{ marginTop: 22, borderTop: `1px solid ${C.hairline}` }}>
            {rows.map((row) => (
              <ActionRow key={row.label} label={row.label} value={row.value} href={row.href} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: -12, paddingBottom: 20 }}>
        <EntityEvents kind="resource" id={r.id} />
      </div>
    </>
  )
}
