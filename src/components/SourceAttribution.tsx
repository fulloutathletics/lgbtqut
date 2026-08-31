import type { ReactNode } from 'react'
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
 * misreading these two components exist to prevent.
 */

const DIRECTORY_LABEL = 'Added by LGBTQ.UT'
const ENTITY_LABEL = 'Managed by the organiser'

/** Compact pill for cards and headers. */
export function SourceBadge({ event }: { event: AppEvent }) {
  const { accent, tint } = useStore()
  const ours = isDirectoryListed(event)

  return (
    <span
      style={{
        borderRadius: 999, padding: '2px 8px', font: font(700, 10, 1.4), letterSpacing: '.03em',
        background: ours ? C.fill : tint, color: ours ? '#6E6A64' : accent,
        whiteSpace: 'nowrap',
      }}
    >
      {ours ? DIRECTORY_LABEL : ENTITY_LABEL}
    </span>
  )
}

/**
 * The full explanation, for the event page. Names the organiser so the
 * sentence is about a specific relationship rather than a general disclaimer,
 * and points a reader at the organiser's own posting when we have one — a
 * listing we forgot to update is the failure this paragraph is here to catch.
 */
export function SourceNote({ event, organiserName }: { event: AppEvent; organiserName: string }) {
  const { accent } = useStore()
  const ours = isDirectoryListed(event)
  const who = organiserName || 'The organiser'

  if (!ours) {
    return (
      <Note tone="entity">
        <Title>{who} manages this event</Title>
        <Body>
          {who} posted this from their own LGBTQ.UT account and keeps it up to date. They see replies
          in the discussion below.
        </Body>
      </Note>
    )
  }

  return (
    <Note tone="directory">
      <Title>LGBTQ.UT added this listing</Title>
      <Body>
        We listed this event ourselves from public information. {who} does not manage this page and is
        not reading the discussion below. Times change and events get cancelled without us hearing about
        it, so check with {who} before you go — and tell us if something here is wrong, rather than them.
      </Body>
      {event.source_url && (
        <a
          href={webHref(event.source_url)}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 9, font: font(700, 12.5, 1.3), color: accent,
                   textDecoration: 'none' }}
        >
          See {who}'s own posting →
        </a>
      )}
      <div style={{ font: font(400, 11.5, 1.45), color: C.faint, marginTop: 9 }}>
        {event.last_checked_on
          ? `Last checked by LGBTQ.UT on ${longDate(event.last_checked_on)}.`
          : 'We have not re-checked this listing since it was added.'}
      </div>
    </Note>
  )
}

// ------------------------------------------------------------------- pieces

function Note({ tone, children }: { tone: 'directory' | 'entity'; children: ReactNode }) {
  const { tint, accent } = useStore()
  return (
    <div style={{ margin: '20px 18px 0', borderRadius: 13, padding: '14px 15px',
                  background: tone === 'entity' ? tint : '#FAF8F5',
                  border: `1px solid ${tone === 'entity' ? alpha(accent, 0.25) : C.border}` }}>
      {children}
    </div>
  )
}

const Title = ({ children }: { children: ReactNode }) => (
  <div style={{ font: font(700, 13.5, 1.3), color: C.ink, textWrap: 'pretty' }}>{children}</div>
)

const Body = ({ children }: { children: ReactNode }) => (
  <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 5, textWrap: 'pretty' }}>{children}</div>
)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
