import type { CSSProperties, ReactNode } from 'react'
import { C, FONT } from '../lib/theme'
import { useStore } from '../lib/store'
import { imgSrc } from '../lib/data'
import { useTrail } from '../lib/trail'
import { Back, Chevron, Search, Verified } from './icons'
import { EditImageButton } from './EditImageButton'
import type { ImageTable } from '../lib/imageEdit'

export const font = (weight: number, size: number | string, leading: number | string = 1.3) =>
  `${weight} ${typeof size === 'number' ? `${size}px` : size}/${leading} ${FONT}`

/**
 * Falls back to a hatched swatch when the source image 404s.
 *
 * Lazy by default, which is right for the hundred-odd thumbnails below the
 * fold on a list screen and wrong for the one picture already on screen when
 * the page paints. A lazy image doesn't start downloading until layout has run
 * and then queues at low priority, so the artwork a reader is actually looking
 * at arrives last. Pass `priority` for that image — the splash card at the top
 * of the page, a profile's header — and it is fetched eagerly and ahead of the
 * rest. Never pass it to more than the first screenful: marking everything
 * urgent is the same as marking nothing urgent.
 */
export function Img({ src, style, alt = '', priority = false }: {
  src?: string; style?: CSSProperties; alt?: string; priority?: boolean
}) {
  return (
    <img
      src={imgSrc(src)}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      // Decode off the main thread so a large picture landing mid-scroll
      // doesn't stall the list it is scrolling in.
      decoding="async"
      style={style}
      onError={(e) => {
        const el = e.currentTarget
        el.style.visibility = 'hidden'
        const p = el.parentElement
        if (p) p.style.background = 'repeating-linear-gradient(135deg,#E9E5DF 0 9px,#E2DDD6 9px 18px)'
      }}
    />
  )
}

export function Tap({ onClick, children, style, label }: {
  onClick?: () => void; children: ReactNode; style?: CSSProperties
  /** Accessible name, for a tap target whose only content is an icon. */
  label?: string
}) {
  return (
    <div className="tap" onClick={onClick} style={style} role={onClick ? 'button' : undefined} aria-label={label}>
      {children}
    </div>
  )
}

/** 158px themed banner, 104px logo overlapping by 52px, title + tagline. */
export function ProfileHeader({ title, tagline }: { title: string; tagline: string }) {
  const { themeBar, headerImg } = useStore()
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ height: 158, background: themeBar, position: 'relative', overflow: 'hidden' }}>
        {headerImg && <Img src={headerImg} priority
                             style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: -52, position: 'relative', zIndex: 2 }}>
        <div style={{ width: 104, height: 104, borderRadius: 999, background: '#111', border: '4px solid #fff',
                      boxShadow: '0 6px 20px rgba(0,0,0,.22)', overflow: 'hidden' }}>
          <Img src="https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/xJvzSXG0KhRgxQYQKBUO/lgbtqut%20(1).png"
               priority style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
      <div style={{ padding: '12px 24px 18px', textAlign: 'center' }}>
        <div style={{ font: font(800, 27, 1.15), color: '#141414', letterSpacing: '-.02em' }}>{title}</div>
        <div style={{ font: font(400, 14, 1.45), color: '#77736C', marginTop: 5, textWrap: 'pretty' }}>{tagline}</div>
      </div>
    </div>
  )
}

/**
 * Sticky bar with a 34px circular back button. `right` takes an action slot.
 *
 * Back follows the trail rather than raw history — see `lib/trail`. Pass
 * `onBack` only for a screen that steps through its own stages before it is
 * ready to leave, like the sign-in flow.
 */
export function StickyBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const { back, backLabel } = useTrail()
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,.94)',
                  backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.hairline}`,
                  padding: '56px 14px 11px', display: 'flex', alignItems: 'center', gap: 11 }}>
      <Tap onClick={onBack ?? back}
           label={onBack || !backLabel ? 'Back' : `Back to ${backLabel}`}
           style={{ width: 34, height: 34, borderRadius: 999, background: C.fill, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Back />
      </Tap>
      <div style={{ font: font(700, 16, 1.2), color: C.ink, flex: 1, minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      {right}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div style={{ padding: '12px 16px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.fill, borderRadius: 11,
                    padding: '9px 12px' }}>
        <Search />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ border: 0, outline: 0, background: 'transparent', flex: 1, minWidth: 0,
                   font: font(400, 14, 1.3), color: C.ink }}
        />
      </div>
    </div>
  )
}

/** Full-width 240px image card with scrim, title, subtitle and count pill. */
export function RouterCard({ img, bg, title, sub, count, onClick, editImage, priority }: {
  img?: string; bg?: string; title: string; sub?: string; count?: string; onClick?: () => void
  editImage?: { table: ImageTable; id: string; column: string }
  /** Set on the cards above the fold — see `Img`. */
  priority?: boolean
}) {
  return (
    <Tap onClick={onClick} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 240,
                                    background: bg || '#D6D2CC', boxShadow: '0 3px 12px rgba(0,0,0,.09)' }}>
      {img && <Img src={img} priority={priority}
                   style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {editImage && (
        <EditImageButton table={editImage.table} id={editImage.id} column={editImage.column}
                         style={{ top: 14, bottom: 'auto', right: 14 }} />
      )}
      <div style={{ position: 'absolute', inset: 0,
                    background: 'linear-gradient(160deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.22) 55%,rgba(0,0,0,.05) 100%)' }} />
      <div style={{ position: 'absolute', top: 14, left: 16, right: 16 }}>
        <div style={{ font: font(700, 18, 1.15), color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.45)' }}>{title}</div>
        {sub && <div style={{ font: font(400, 12.5, 1.35), color: 'rgba(255,255,255,.88)', marginTop: 4,
                              textShadow: '0 1px 6px rgba(0,0,0,.45)' }}>{sub}</div>}
      </div>
      {count && (
        <div style={{ position: 'absolute', bottom: 12, right: 14, background: 'rgba(255,255,255,.92)',
                      borderRadius: 999, padding: '4px 11px', font: font(600, 11, 1.4), color: '#2A2A28' }}>
          {count}
        </div>
      )}
    </Tap>
  )
}

/** 50px thumbnail, name (+ verified seal, + age pill), "Category · County" meta. */
export function ResultRow({ img, bg, name, meta, verified, agePill, onClick }: {
  img?: string; bg?: string; name: string; meta?: string; verified?: boolean
  agePill?: string | null; onClick?: () => void
}) {
  const { accent } = useStore()
  return (
    <Tap onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                                    borderBottom: `1px solid ${C.hairline}`, background: '#fff' }}>
      <div style={{ width: 50, height: 50, borderRadius: 11, overflow: 'hidden', flex: 'none',
                    background: bg || '#E9E5DF' }}>
        {img && <Img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ font: font(600, 14.5, 1.25), color: C.ink }}>{name}</span>
          {verified && <Verified color={accent} />}
          {agePill && <AgePill label={agePill} />}
        </div>
        {meta && <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3 }}>{meta}</div>}
      </div>
      <Chevron size={15} />
    </Tap>
  )
}

export function AgePill({ label }: { label: string }) {
  return (
    <span style={{ background: C.agePillBg, color: C.agePill, borderRadius: 999, padding: '2px 7px',
                   font: font(700, 10, 1.3), letterSpacing: '.04em' }}>{label}</span>
  )
}

/** 44×26 track with a 20px knob and 3px inset. */
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  const { accent } = useStore()
  return (
    <div
      onClick={() => !disabled && onChange()}
      role="switch"
      aria-checked={on}
      style={{ width: 44, height: 26, borderRadius: 999, padding: 3, flex: 'none',
               background: on ? accent : '#DCD8D2', display: 'flex',
               justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
               transition: 'background .18s ease', cursor: disabled ? 'not-allowed' : 'pointer',
               opacity: disabled ? 0.45 : 1 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 999, background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,.28)' }} />
    </div>
  )
}

/** One row per populated contact column on a detail page. */
export function ActionRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
                borderBottom: `1px solid ${C.hairline}`, textDecoration: 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: font(700, 15, 1.25), color: C.ink }}>{label}</div>
        <div style={{ font: font(400, 14, 1.4), color: '#6E6A64', marginTop: 2, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <Chevron size={15} />
    </a>
  )
}

export function SectionHead({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.01em', ...style }}>{children}</div>
}

export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const { accent } = useStore()
  return (
    <div style={{ font: font(700, 11, 1.3), color: color ?? accent, textTransform: 'uppercase',
                  letterSpacing: '.09em' }}>{children}</div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', font: font(400, 14, 1.5), color: C.muted }}>
      {children}
    </div>
  )
}

/** Anonymous users are told their data is device-only, on both Saved and Alerts. */
export function DeviceOnlyNotice() {
  return (
    <div style={{ margin: '0 16px 14px', background: C.fill, borderRadius: 12, padding: '12px 14px',
                  font: font(400, 12.5, 1.5), color: '#6E6A64' }}>
      You are not signed in. These are stored on this device only and will not follow you to another phone.
    </div>
  )
}
