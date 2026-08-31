import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, UIEvent } from 'react'
import { useParams } from 'react-router-dom'
import { C, SIZES } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { alpha, isHotline, mapHref, telHref, webHref } from '../lib/data'
import type { Business, BusinessSection, SectionItem } from '../lib/types'
import { AgeGate } from '../components/AgeGate'
import { EditImageButton } from '../components/EditImageButton'
import { SubscriptionPanel } from '../components/SubscriptionPanel'
import { Verified } from '../components/icons'
import { ActionRow, AgePill, Empty, Img, StickyBar, Tap, font } from '../components/ui'

/** Glide match = 200px banner + overlapping logo tile. Editorial = 330px full bleed. */
export type BizHero = 'glide' | 'editorial'

const PHOTO_W = 294
const PHOTO_GAP = 10

export function BusinessDetail({ variant = 'glide', showConfig = false }: {
  variant?: BizHero
  showConfig?: boolean
}) {
  const { id = '' } = useParams<{ id: string }>()
  const data = useData()
  const { accent, tint, canSee, isSaved, toggleSave } = useStore()
  const [photoIdx, setPhotoIdx] = useState(0)

  const b = data?.businesses.find((x) => x.id === id)

  // Every business image the page knows about, section artwork included.
  const gallery = useMemo(() => {
    if (!b) return []
    const srcs = [b.background_url, b.image_url, ...b.sections.flatMap((s) => s.items.map((i) => i.img ?? ''))]
    return [...new Set(srcs.filter(Boolean))]
  }, [b])

  if (!data) return <div />
  if (!b) {
    return (
      <>
        <StickyBar title="" />
        <Empty>That business is no longer listed.</Empty>
      </>
    )
  }
  if (!canSee(b.age_rating)) return <AgeGate reason={b.age_reason} />

  const saved = isSaved(b.id)
  const sections = b.sections.slice(0, 2)
  const meta = [b.county || 'Online only', ...b.tags].filter(Boolean).join(' · ')

  const onPhotoScroll = (e: UIEvent<HTMLDivElement>) => {
    const i = Math.round(e.currentTarget.scrollLeft / (PHOTO_W + PHOTO_GAP))
    setPhotoIdx((prev) => (i === prev ? prev : i))
  }

  return (
    <div>
      <StickyBar
        title={b.name}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Tap onClick={() => {
              const url = window.location.href
              if (navigator.share) {
                void navigator.share({ title: b.name, text: `${b.name} on LGBTQ UT`, url })
              } else {
                void navigator.clipboard.writeText(url)
              }
            }}
                 aria-label="Share business"
                 style={{ height: 34, borderRadius: 999, background: C.fill, display: 'flex', padding: '0 13px',
                          alignItems: 'center', justifyContent: 'center', flex: 'none',
                          font: font(700, 12.5, 1.2), color: C.body }}>
              Share
            </Tap>
            <Tap onClick={() => toggleSave(b.id, 'business')}
                 aria-label={saved ? 'Unfollow business' : 'Follow business'}
                 style={{ height: 34, borderRadius: 999, background: saved ? tint : C.fill, display: 'flex',
                          padding: '0 13px', alignItems: 'center', justifyContent: 'center', flex: 'none',
                          font: font(700, 12.5, 1.2), color: saved ? accent : C.body }}>
              {saved ? 'Following' : 'Follow'}
            </Tap>
          </div>
        }
      />

      {variant === 'glide' ? (
        <>
          <div style={{ position: 'relative', height: 200, background: b.color, overflow: 'hidden' }}>
            <Img src={b.background_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <EditImageButton table="businesses" id={b.id} column="background_url" />
          </div>
          <div style={{ padding: '0 16px', marginTop: -46, position: 'relative' }}>
            <div style={{ width: 96, height: 96, borderRadius: 14, overflow: 'hidden', background: b.color,
                          border: '3px solid #fff', boxShadow: '0 5px 18px rgba(0,0,0,.2)', position: 'relative' }}>
              <Img src={b.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <EditImageButton table="businesses" id={b.id} column="image_url"
                               style={{ width: 26, height: 26, bottom: 4, right: 4 }} />
            </div>
          </div>
        </>
      ) : (
        <div style={{ position: 'relative', height: 330, overflow: 'hidden', background: b.color }}>
          <Img src={b.background_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <EditImageButton table="businesses" id={b.id} column="background_url" style={{ top: 14, bottom: 'auto', right: 14 }} />
          <div style={{ position: 'absolute', inset: 0,
                        background: 'linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,.05) 42%,rgba(0,0,0,.82) 100%)' }} />
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 20 }}>
            <div style={{ font: font(600, 11, 1.2), letterSpacing: '.12em', textTransform: 'uppercase',
                          color: 'rgba(255,255,255,.75)' }}>{b.county || 'Online only'}</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 8 }}>
              <div style={{ font: font(800, 30, 1.1), color: '#fff', letterSpacing: '-.025em', flex: 1, minWidth: 0,
                            textWrap: 'pretty', textShadow: '0 2px 14px rgba(0,0,0,.4)' }}>{b.name}</div>
              {b.verified && <Verified size={24} color={accent} />}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px 0' }}>
        {variant === 'glide' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ font: font(800, 25, 1.18), color: C.ink, letterSpacing: '-.02em', flex: 1, minWidth: 0,
                          textWrap: 'pretty' }}>{b.name}</div>
            {b.verified && <Verified size={21} color={accent} />}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
          {b.age_rating && <AgePill label={b.age_rating} />}
          <div style={{ font: font(400, 12.5, 1.4), color: C.muted, textWrap: 'pretty' }}>{meta}</div>
        </div>
      </div>

      {saved && (
        <div style={{ padding: '14px 16px 0' }}>
          <SubscriptionPanel entityId={b.id} />
        </div>
      )}

      {gallery.length > 1 && (
        <>
          <div className="hs" onScroll={onPhotoScroll}
               style={{ display: 'flex', gap: PHOTO_GAP, overflowX: 'auto', padding: '18px 16px 0',
                        scrollSnapType: 'x mandatory' }}>
            {gallery.map((src) => (
              <div key={src} style={{ flex: 'none', width: PHOTO_W, height: 198, borderRadius: 13, overflow: 'hidden',
                                      background: '#EFEDE9', scrollSnapAlign: 'start' }}>
                <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '11px 0 2px' }}>
            {gallery.map((src, i) => (
              <div key={src} style={{ width: i === photoIdx ? 16 : 5, height: 5, borderRadius: 999,
                                      background: i === photoIdx ? b.color : '#DCD8D2',
                                      transition: 'width .2s ease' }} />
            ))}
          </div>
        </>
      )}

      {b.coupons.length > 0 && (
        <div style={{ padding: '14px 0 0' }}>
          <Eyebrow>Offers for our community</Eyebrow>
          <div className="hs" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 2px',
                                       scrollSnapType: 'x mandatory' }}>
            {b.coupons.map((c) => (
              <div key={c.code + c.title}
                   style={{ flex: 'none', width: 262, scrollSnapAlign: 'start', borderRadius: 13,
                            border: `1.5px dashed ${alpha(b.color, 0.4)}`, background: alpha(b.color, 0.12),
                            padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ font: font(800, 19, 1.15), color: b.color, letterSpacing: '-.01em',
                              textWrap: 'pretty' }}>{c.title}</div>
                <div style={{ font: font(400, 12.5, 1.4), color: '#5E5A54', textWrap: 'pretty' }}>{c.terms}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                              marginTop: 2 }}>
                  <div style={{ borderRadius: 7, background: '#fff', border: '1px solid rgba(0,0,0,.09)',
                                padding: '6px 11px', font: font(700, 12.5, 1.2), color: C.ink,
                                letterSpacing: '.06em' }}>{c.code}</div>
                  <div style={{ font: font(500, 11, 1.3), color: '#8A867F' }}>{c.expires}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.map((s, i) => (
        <Section key={`${s.title}-${i}`} section={s} color={b.color} showConfig={showConfig} />
      ))}

      <VisitRows b={b} />
    </div>
  )
}

function Eyebrow({ children }: { children: string }) {
  return (
    <div style={{ font: font(700, 12, 1.2), letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A968F',
                  padding: '0 16px 10px' }}>{children}</div>
  )
}

// ------------------------------------------------------------- section system
//
// Presentation is data: `type` picks the container, and `size`/`orient` resolve
// through the SIZES lookup to the card box. The same renderer therefore produces
// a menu stack, a priced service list, a tile grid or a photo rail with no
// per-business code.

function Section({ section, color, showConfig }: {
  section: BusinessSection
  color: string
  showConfig: boolean
}) {
  const { type, size, orient } = section.layout
  const [cardW, cardH] = SIZES[`${size}-${orient}`] ?? SIZES['medium-horizontal']
  const badge = `${type} · ${size} · ${orient}`.toUpperCase()

  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.015em',
                      textWrap: 'pretty' }}>{section.title}</div>
        {section.sub && (
          <div style={{ font: font(400, 12.5, 1.4), color: '#87837C', marginTop: 4 }}>{section.sub}</div>
        )}
        {showConfig && (
          <div style={{ display: 'inline-block', marginTop: 8, borderRadius: 5, background: '#141413',
                        padding: '3px 8px', font: font(600, 10, 1.4), color: '#9FE8D8',
                        letterSpacing: '.08em' }}>{badge}</div>
        )}
      </div>

      {type === 'carousel' && (
        <div className="hs" style={{ display: 'flex', gap: 11, overflowX: 'auto', padding: '0 16px 4px',
                                     scrollSnapType: 'x mandatory' }}>
          {section.items.map((item, i) => (
            <Card key={`${item.title}-${i}`} item={item} color={color}
                  style={{ flex: 'none', width: cardW === 'auto' ? 214 : cardW, scrollSnapAlign: 'start' }}>
              <Media src={item.img} height={cardH} radius={12} />
              <Caption item={item} color={color} size={14} />
            </Card>
          ))}
        </div>
      )}

      {type === 'stack' && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {section.items.map((item, i) => (
            <Card key={`${item.title}-${i}`} item={item} color={color}>
              <Media src={item.img} height={cardH} radius={13} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                            marginTop: 10 }}>
                <div style={{ font: font(700, 17, 1.25), color: '#161615', textWrap: 'pretty' }}>{item.title}</div>
                {item.value && (
                  <div style={{ font: font(600, 14, 1.3), color, flex: 'none' }}>{item.value}</div>
                )}
              </div>
              {item.sub && (
                <div style={{ font: font(400, 13.5, 1.5), color: '#6E6A64', marginTop: 4,
                              textWrap: 'pretty' }}>{item.sub}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      {type === 'grid' && (
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {section.items.map((item, i) => (
            <Card key={`${item.title}-${i}`} item={item} color={color} style={{ minWidth: 0 }}>
              <Media src={item.img} height={cardH} radius={12} />
              <Caption item={item} color={color} size={13.5} />
            </Card>
          ))}
        </div>
      )}

      {type === 'list' && (
        <div style={{ padding: '0 16px' }}>
          {section.items.map((item, i) => (
            <Card key={`${item.title}-${i}`} item={item} color={color}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0',
                           borderBottom: `1px solid #F1EEEA` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: font(600, 15, 1.25), color: C.ink, textWrap: 'pretty' }}>{item.title}</div>
                {item.sub && (
                  <div style={{ font: font(400, 12.5, 1.4), color: '#87837C', marginTop: 3,
                                textWrap: 'pretty' }}>{item.sub}</div>
                )}
              </div>
              {item.value && <div style={{ font: font(600, 14, 1.3), color, flex: 'none' }}>{item.value}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** Wraps an item so a configured `link` makes the whole card tappable. */
function Card({ item, style, children }: {
  item: SectionItem
  color: string
  style?: CSSProperties
  children: ReactNode
}) {
  const open = item.link
    ? () => window.open(webHref(item.link ?? ''), '_blank', 'noopener,noreferrer')
    : undefined
  return <Tap onClick={open} style={style}>{children}</Tap>
}

function Media({ src, height, radius }: { src?: string; height: string; radius: number }) {
  return (
    <div style={{ width: '100%', height, borderRadius: radius, overflow: 'hidden', background: '#EFEDE9' }}>
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

function Caption({ item, color, size }: { item: SectionItem; color: string; size: number }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 9 }}>
        <div style={{ font: font(600, size, 1.3), color: C.ink, textWrap: 'pretty' }}>{item.title}</div>
        {item.value && <div style={{ font: font(600, 13.5, 1.3), color, flex: 'none' }}>{item.value}</div>}
      </div>
      {item.sub && (
        <div style={{ font: font(400, 12.5, 1.4), color: '#87837C', marginTop: 3,
                      textWrap: 'pretty' }}>{item.sub}</div>
      )}
    </>
  )
}

// ------------------------------------------------------------------- contact

function VisitRows({ b }: { b: Business }) {
  const rows: Array<{ label: string; value: string; href: string }> = []
  if (b.website) rows.push({ label: 'Website', value: b.website, href: webHref(b.website) })
  if (b.telephone) {
    rows.push({
      label: isHotline(b.telephone) ? 'Hotline' : 'Telephone',
      value: b.telephone,
      href: telHref(b.telephone),
    })
  }
  if (b.email) rows.push({ label: 'Email', value: b.email, href: `mailto:${b.email}` })
  if (b.address) rows.push({ label: 'Address', value: b.address, href: mapHref(b.address) })
  if (!rows.length) return null

  return (
    <div style={{ padding: '26px 16px 0' }}>
      <div style={{ font: font(700, 12, 1.2), letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A968F',
                    marginBottom: 4 }}>Visit</div>
      {rows.map((r) => <ActionRow key={r.label} label={r.label} value={r.value} href={r.href} />)}
      <div style={{ height: 26 }} />
    </div>
  )
}

export default BusinessDetail
