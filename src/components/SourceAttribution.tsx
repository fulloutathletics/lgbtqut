import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { alpha, isDirectoryListed, webHref } from '../lib/data'
import type { AppEvent } from '../lib/types'
import { font } from './ui'

/**
 * Says who put a listing here.
 *
 * Most of this directory was typed in by LGBTQ.UT from public information. The
 * organisation named on such a listing has not seen it, does not read the
 * discussion under it, and cannot correct it when the event moves or is
 * cancelled. Both states are labelled rather than only the borrowed one:
 * silence on an unmarked page would read as "official", which is the exact
 * misreading this exists to prevent.
 *
 * The label is a tag rather than a paragraph. The full explanation matters to
 * whoever stops to ask, but it is a footnote for everyone else, and a block of
 * it above the fold pushed the event itself down the page. Tap it, or hover
 * with a mouse, and the detail opens over the page instead of inside it.
 */

const PANEL_W = 300
const GUTTER = 12

interface Copy { label: string; title: string; body: string }

function copyFor(ours: boolean, who: string): Copy {
  return ours
    ? {
        label: 'Added by LGBTQ.UT',
        title: 'LGBTQ.UT added this listing',
        body: `We listed this event ourselves from public information. ${who} does not manage this page and is not reading the discussion on it. Times change and events get cancelled without us hearing about it, so check with ${who} before you go — and tell us if something here is wrong, rather than them.`,
      }
    : {
        label: 'Managed by the organiser',
        title: `${who} manages this event`,
        body: `${who} posted this from their own LGBTQ.UT account and keeps it up to date. They see replies in the discussion on this page.`,
      }
}

export function SourceBadge({ event, organiserName }: { event: AppEvent; organiserName?: string }) {
  const { accent, tint } = useStore()
  const ours = isDirectoryListed(event)
  const copy = copyFor(ours, organiserName || 'The organiser')

  const ref = useRef<HTMLSpanElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const open = useCallback(() => setRect(ref.current?.getBoundingClientRect() ?? null), [])
  const close = useCallback(() => setRect(null), [])
  const toggle = useCallback(() => setRect((r) => (r ? null : ref.current?.getBoundingClientRect() ?? null)), [])

  // The tag lives inside cards that navigate on tap and headers that clip
  // their overflow, so every handler stops propagation and the panel is
  // portalled out to the body.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-expanded={rect !== null}
        // No aria-label: the pill sits inside cards that are themselves
        // role="button", and a label here would be absorbed into the card's
        // accessible name. Its own text is the name; `title` carries the
        // hover hint for a pointer that never stops long enough to open it.
        title={copy.title}
        data-source-tag=""

        onClick={(e) => { stop(e); e.preventDefault(); toggle() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { stop(e); e.preventDefault(); toggle() }
          if (e.key === 'Escape') close()
        }}
        // Hover is a mouse affordance only; on touch the tap handler above owns it.
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') open() }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') close() }}
        // Keyboard focus opens it; a tap also focuses, and opening there would
        // fight the click that follows and leave the panel shut on touch.
        onFocus={() => { if (ref.current?.matches(':focus-visible')) open() }}
        onBlur={close}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          borderRadius: 999, padding: '2px 8px', font: font(700, 10, 1.4), letterSpacing: '.03em',
          background: ours ? C.fill : tint, color: ours ? '#6E6A64' : accent, whiteSpace: 'nowrap',
        }}
      >
        {copy.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             style={{ opacity: 0.65, flex: 'none' }}>
          <circle cx="12" cy="12" r="9.5" /><path d="M12 11v5" /><path d="M12 7.6h.01" />
        </svg>
      </span>
      {rect && <Panel anchor={rect} copy={copy} event={event} who={organiserName || 'the organiser'} onClose={close} />}
    </>
  )
}

// -------------------------------------------------------------------- panel

function Panel({ anchor, copy, event, who, onClose }: {
  anchor: DOMRect
  copy: Copy
  event: AppEvent
  who: string
  onClose: () => void
}) {
  const { accent } = useStore()

  // Anything that moves the anchor out from under the panel dismisses it
  // rather than leaving it stranded mid-page.
  useEffect(() => {
    const bye = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // A press on the tag itself is left to the tag's own toggle. Dismissing
    // here first would close on pointerdown and reopen on the click that
    // follows, so a mouse user — for whom hovering already opened it — could
    // never click it shut.
    const away = (e: PointerEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-source-tag]')) return
      onClose()
    }
    window.addEventListener('scroll', bye, true)
    window.addEventListener('resize', bye)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('scroll', bye, true)
      window.removeEventListener('resize', bye)
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const width = Math.min(PANEL_W, window.innerWidth - GUTTER * 2)
  const left = Math.min(Math.max(anchor.left, GUTTER), window.innerWidth - width - GUTTER)
  // Flip above the tag when there is not room under it — the tag often sits
  // low on an event card near the bottom of the viewport.
  const below = window.innerHeight - anchor.bottom > 190
  const vertical = below
    ? { top: anchor.bottom + 8 }
    : { bottom: window.innerHeight - anchor.top + 8 }

  return createPortal(
    <div
      role="tooltip"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left, width, ...vertical, zIndex: 60, boxSizing: 'border-box',
        background: '#fff', borderRadius: 13, border: `1px solid ${C.border}`,
        boxShadow: '0 10px 30px rgba(0,0,0,.16)', padding: '13px 14px',
      }}
    >
      <div style={{ font: font(700, 13, 1.3), color: C.ink, textWrap: 'pretty' }}>{copy.title}</div>
      <div style={{ font: font(400, 12.5, 1.5), color: C.body, marginTop: 5, textWrap: 'pretty' }}>
        {copy.body}
      </div>
      {isDirectoryListed(event) && (
        <>
          {event.source_url && (
            <a
              href={webHref(event.source_url)}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 8, font: font(700, 12, 1.3), color: accent,
                       textDecoration: 'none' }}
            >
              See {who}'s own posting →
            </a>
          )}
          <div style={{ font: font(400, 11, 1.45), color: C.faint, marginTop: 8,
                        borderTop: `1px solid ${alpha(C.ink, 0.06)}`, paddingTop: 8 }}>
            {event.last_checked_on
              ? `Last checked by LGBTQ.UT on ${longDate(event.last_checked_on)}.`
              : 'We have not re-checked this listing since it was added.'}
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
