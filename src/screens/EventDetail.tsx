import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import type { AppEvent } from '../lib/types'
import { AgeGate } from '../components/AgeGate'
import { entityHref, entityRef, isDirectoryListed } from '../lib/data'
import { EditImageButton } from '../components/EditImageButton'
import { AdminEditButton } from '../components/AdminEditButton'
import { SourceBadge } from '../components/SourceAttribution'
import { RichText } from '../components/RichText'
import { Chevron, Heart, Star, Verified } from '../components/icons'
import { AgePill, Empty, Img, StickyBar, font } from '../components/ui'

// ---------------------------------------------------------------------------
// MOCK PARTICIPATION
//
// Stands in for the `rsvps`, `event_comments`, `event_polls` and
// `event_reviews` tables, none of which are seeded yet. Everything below is
// derived deterministically from the event id through a small seeded PRNG, so
// the same event shows the same guests, poll tallies, comments and reviews on
// every load and on every device — the screen is demonstrable without a
// backend and without any of it looking randomly reshuffled.
//
// Delete this whole block when the real tables land; the render code below
// reads only from `Social`, so swapping the source is a one-function change.
// ---------------------------------------------------------------------------

const PEOPLE: string[] = ['Rio M.', 'Tay B.', 'Wren D.', 'Dana R.', 'Ash P.', 'June L.', 'Sam K.', 'Kai S.', 'Noor A.']

const AV = ['#7A2FA6', '#2C86B5', '#B0523E', '#2E8B45', '#9B4F96', '#4B3FBF', '#DD6317', '#2A7F70']

const POLLS: Array<{ question: string; options: string[] }> = [
  { question: 'Which workshop should we add this year?',
    options: ['Voice and speech', 'Legal name change clinic', 'Chest binding safety'] },
  { question: 'What time works best for the next one?',
    options: ['Weeknight after six', 'Saturday afternoon', 'Sunday brunch'] },
  { question: 'What should we put on the merch table?',
    options: ['Pins and patches', 'Tote bags', 'Zines from local artists'] },
]

const HOST_BODIES = [
  'Volunteer shifts are open. Two-hour blocks, lunch included, no experience needed.',
  'Level entry on the north side, accessible restrooms, and a quiet room off the main hall.',
  'Schedule is posted. Doors open thirty minutes before the first session.',
]

const BODIES = [
  'Is the venue wheelchair accessible? Bringing my mom.',
  'Carpooling from Ogden if anyone needs a ride. Two seats.',
  'First one of these for me. Anything I should know before I show up?',
  'Parking was rough last year — the garage on the north side is free after five.',
  'Bringing a friend who just moved here from Idaho. She is nervous, we will be fine.',
  'Any chance there is a quiet room again this time?',
]

const REVIEW_BODIES = [
  'Actually useful. Well run, and the crowd was mixed rather than the usual regulars.',
  'Great turnout. Would have liked name tags with pronouns printed rather than handwritten.',
  'Met two people I now work with. Worth the drive.',
  'Warm room, easy to talk to strangers. Ran a little long.',
]

const ORGANISER_LABEL: Record<'resource' | 'business' | 'host', string> = {
  host: 'Event Host',
  business: 'Hosted by',
  resource: 'Hosted by',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MockPoll { id: string; question: string; options: Array<{ label: string; votes: number }> }
interface MockComment { id: string; who: string; host: boolean; minutesAgo: number; body: string }
interface MockReview { who: string; stars: number; when: string; body: string }

interface Social {
  going: number
  interested: number
  guests: string[]
  poll: MockPoll
  comments: MockComment[]
  reviews: MockReview[]
}

/** FNV-1a over the event id, so the seed is stable across sessions. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — tiny, deterministic, good enough for fixture data. */
function prng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(xs: string[], rand: () => number): string[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = out[i]
    out[i] = out[j]
    out[j] = a
  }
  return out
}

/**
 * `managed` is whether the organiser runs this listing from their own account.
 * When they do not, the thread has no host voice in it at all — a stand-in
 * comment badged HOST under a listing LGBTQ.UT typed in would be putting words
 * in the mouth of an organisation that has never seen the page.
 */
function buildSocial(event: AppEvent, hostName: string, managed: boolean, past: boolean, daysSince: number): Social {
  const rand = prng(hash(event.id))

  const going = 40 + Math.floor(rand() * 150)
  const interested = 8 + Math.floor(rand() * 60)
  const guests = shuffled(PEOPLE, rand).slice(0, 6 + Math.floor(rand() * 3))

  const spec = POLLS[Math.floor(rand() * POLLS.length)]
  const poll: MockPoll = {
    id: `${event.id}-poll`,
    question: spec.question,
    options: spec.options.map((label) => ({ label, votes: 24 + Math.floor(rand() * 90) })),
  }

  // Comments run oldest first, each one closer to now than the last. Past
  // events push the whole thread back behind the event date so the relative
  // stamps read like an archive rather than like this afternoon.
  const offset = past ? daysSince * 1440 : 0
  const n = 4 + Math.floor(rand() * 2)
  const voices = shuffled(PEOPLE, rand)
  const comments: MockComment[] = []
  let minutes = 2200 + Math.floor(rand() * 3000)
  for (let i = 0; i < n; i++) {
    const isHost = managed && (i === 0 || i === 2)
    comments.push({
      id: `${event.id}-c${i}`,
      who: isHost ? hostName : voices[i % voices.length],
      host: isHost,
      minutesAgo: minutes + offset,
      body: isHost ? HOST_BODIES[i % HOST_BODIES.length] : BODIES[(i + hash(event.id)) % BODIES.length],
    })
    minutes = Math.max(20, Math.floor(minutes * (0.3 + rand() * 0.35)))
  }

  // Reviews only exist after the event date.
  const reviews: MockReview[] = past
    ? shuffled(PEOPLE, rand).slice(0, 3).map((who, i) => ({
        who,
        stars: 3 + Math.floor(rand() * 3),
        when: monthLabel(event.starts_on, i),
        body: REVIEW_BODIES[(i + hash(event.id)) % REVIEW_BODIES.length],
      }))
    : []

  return { going, interested, guests, poll, comments, reviews }
}

/** "Apr 2025" — the review month, drifting a little past the event date. */
function monthLabel(iso: string, drift: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setMonth(d.getMonth() + (drift > 1 ? 1 : 0))
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ------------------------------------------------------------------ helpers

const initialsOf = (name: string) =>
  name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase()

const avatarBg = (name: string) => AV[(name.charCodeAt(0) + name.length) % AV.length]

function rel(minutes: number): string {
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${Math.floor(minutes)}m ago`
  const h = minutes / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// -------------------------------------------------------------------- screen

function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const nav = useNavigate()
  const store = useStore()
  const { accent, tint, canSee, isBlocked, isMuted } = store

  // No host assignment exists yet, so host mode stays a code path rather than
  // a control. Flip this to true to see the Host Controls panel and the poll
  // results a host always sees.
  const viewAsHost = false

  const [draft, setDraft] = useState('')
  const [posted, setPosted] = useState<MockComment[]>([])
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [myStars, setMyStars] = useState(0)

  const event = data?.events.find((e) => e.id === id)
  // The organiser may be a host, a business or a resource — an event names its
  // entity, and this page shows whichever face that entity has.
  const organiser = entityRef(data, event?.entity_kind ?? null, event?.entity_id ?? null)
  const host = data?.hosts.find((h) => h.id === (event?.entity_kind === 'host' ? event.entity_id : event?.host_id))
  // Did the organiser put this here themselves? Everything that speaks in
  // their voice — the HOST badge, the moderation line, the follow prompt —
  // hangs off this, so an event LGBTQ.UT listed never sounds like them.
  const managed = !!event && !isDirectoryListed(event)
  const organiserName = organiser?.name ?? host?.name ?? 'The organiser'

  const today = new Date().toISOString().slice(0, 10)
  const past = !!event && event.starts_on < today
  const daysSince = event
    ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${event.starts_on}T00:00:00`)) / 86400000))
    : 0

  const social = useMemo(
    () => (event ? buildSocial(event, host?.name ?? 'The host', managed, past, daysSince) : null),
    [event, host, managed, past, daysSince],
  )

  if (!data) return <div />

  if (!event || !social) {
    return (
      <>
        <StickyBar title="Event" />
        <Empty>That event is no longer listed.</Empty>
      </>
    )
  }

  if (!canSee(event.age_rating)) return <AgeGate reason={event.age_reason} />

  const me = store.account.displayName ?? store.account.username ?? 'You'
  const mine = store.rsvp[event.id] ?? null

  // Counts move with the viewer's own RSVP.
  const goingN = social.going + (mine === 'going' ? 1 : 0)
  const interestedN = social.interested + (mine === 'interested' ? 1 : 0)

  // Blocking is mutual and total — a blocked person leaves the guest stack.
  const stack = social.guests.filter((n) => !isBlocked(n)).slice(0, 6)
  const overflow = goingN - stack.length

  const blockedGuests = social.guests.filter((n) => isBlocked(n))
  const mutedGuests = social.guests.filter((n) => isMuted(n) && !isBlocked(n))
  const warn = !past && (blockedGuests.length > 0 || mutedGuests.length > 0)

  // Poll results stay hidden until the viewer votes. Hosts, and any event that
  // has already happened, always see them.
  const picked = store.votes[social.poll.id]
  const reveal = picked !== undefined || viewAsHost || past
  const pollTotal = social.poll.options.reduce((a, o) => a + o.votes, 0) + (picked !== undefined ? 1 : 0)

  const thread = [...social.comments, ...posted].filter((c) => c.host || !isBlocked(c.who))

  const allReviews = social.reviews
  // Blocked and muted reviews leave the list but stay in the average.
  const shownReviews = allReviews.filter((r) => !isBlocked(r.who) && !isMuted(r.who))
  const hiddenReviews = allReviews.length - shownReviews.length
  const average = allReviews.length
    ? (allReviews.reduce((a, r) => a + r.stars, 0) / allReviews.length).toFixed(1)
    : '—'

  const rsvpOptions: Array<{ key: 'going' | 'interested' | 'cant_go'; label: string }> = [
    { key: 'going', label: 'Going' },
    { key: 'interested', label: 'Interested' },
    { key: 'cant_go', label: "Can't go" },
  ]

  const hostActions: Array<[string, string]> = [
    ['Post an update', 'Goes to everyone marked going or interested'],
    ['Create a poll', 'Ask attendees before the day'],
    ['Guest list', `${goingN} going · ${interestedN} interested`],
    ['Edit details', 'Changes notify people who are going'],
  ]

  const post = () => {
    const text = draft.trim()
    if (!text) return
    setPosted((p) => [...p, {
      id: `local-${p.length}`,
      who: viewAsHost ? (host?.name ?? me) : me,
      host: viewAsHost,
      minutesAgo: 0,
      body: text,
    }])
    setDraft('')
  }

  return (
    <>
      <StickyBar title={event.name} right={<AdminEditButton section="events" id={event.id} />} />

      {/* hero */}
      <div style={{ height: 246, background: '#F4F2EE', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        <Img src={event.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <EditImageButton table="events" id={event.id} column="image_url" />
      </div>

      <div style={{ padding: '16px 18px 18px' }}>
        {/* title block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ font: font(700, 11.5, 1.2), letterSpacing: '.09em', textTransform: 'uppercase',
                        color: '#2C2C2A' }}>
            {event.date_label}
          </div>
          {event.age_rating && <AgePill label={event.age_rating} />}
        </div>
        <div style={{ font: font(800, 25, 1.15), color: '#111', marginTop: 8, letterSpacing: '-.02em',
                      textWrap: 'pretty' }}>
          {event.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex' }}>
            {stack.map((name) => (
              <div
                key={name}
                className="tap"
                role="button"
                onClick={() => nav(`/u/${encodeURIComponent(name)}`)}
                style={{ width: 30, height: 30, borderRadius: 999, background: avatarBg(name),
                         border: '2px solid #fff', marginRight: -9, display: 'flex', alignItems: 'center',
                         justifyContent: 'center', font: font(700, 10.5, 1), color: '#fff' }}
              >
                {initialsOf(name)}
              </div>
            ))}
            {overflow > 0 && (
              <div style={{ height: 30, borderRadius: 999, background: '#EFEDE9', border: '2px solid #fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 9px',
                            font: font(700, 10.5, 1), color: '#6E6A64' }}>
                +{overflow}
              </div>
            )}
          </div>
          <div style={{ font: font(500, 12.5, 1.3), color: '#6E6A64', marginLeft: 12 }}>
            {goingN} going · {interestedN} interested
          </div>
        </div>

        {/* rsvp — replaced by an ended notice once the date has passed */}
        {past ? (
          <div style={{ marginTop: 14, borderRadius: 11, background: '#F4F2EE', padding: '11px 14px',
                        font: font(600, 12.5, 1.3), color: '#6E6A64' }}>
            This event has ended
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {rsvpOptions.map((o) => {
              const on = mine === o.key
              return (
                <div
                  key={o.key}
                  className="tap"
                  role="button"
                  onClick={() => store.setRsvp(event.id, o.key)}
                  style={{ flex: 1, textAlign: 'center', borderRadius: 11, padding: '11px 4px',
                           background: on ? accent : C.fill,
                           border: `1.5px solid ${on ? accent : '#EAE7E2'}`,
                           font: font(700, 13.5, 1.2), color: on ? '#fff' : '#4A4945' }}
                >
                  {o.label}
                </div>
              )
            })}
          </div>
        )}

        {/* warnings — blocking hides them everywhere else, but knowing they
            will be in the room is the whole point of this notice. */}
        {warn && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 14, borderRadius: 12,
                        background: C.dangerBg, border: '1px solid #F0DCDC', padding: '13px 14px' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.danger} strokeWidth={2}
                 strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }}>
              <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(600, 13, 1.3), color: '#7C3438', textWrap: 'pretty' }}>
                {blockedGuests.length === 1
                  ? 'Someone you blocked is going to this event'
                  : blockedGuests.length > 1
                    ? `${blockedGuests.length} people you blocked are going to this event`
                    : 'Someone you muted is going to this event'}
              </div>
              <div style={{ font: font(400, 11.5, 1.45), color: '#9A6265', marginTop: 3, textWrap: 'pretty' }}>
                You will not see them in the discussion. Manage this in your account settings.
              </div>
            </div>
          </div>
        )}

        {/* host controls */}
        {viewAsHost && (
          <div style={{ marginTop: 16, borderRadius: 13, border: '1.5px solid #1A1A18', overflow: 'hidden' }}>
            <div style={{ background: '#1A1A18', padding: '10px 14px', font: font(700, 11, 1.3), color: '#fff',
                          letterSpacing: '.09em' }}>
              HOST CONTROLS
            </div>
            {hostActions.map(([label, sub]) => (
              <div key={label} className="tap" role="button"
                   style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                            borderBottom: `1px solid ${C.hairline}`, background: '#fff' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18' }}>{label}</div>
                  <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 2, textWrap: 'pretty' }}>
                    {sub}
                  </div>
                </div>
                <Chevron size={15} color="#C3BFB8" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* organiser card — a host, business or resource, whichever runs this */}
      {organiser && (
        <div style={{ position: 'relative', overflow: 'hidden', background: tint }}>
          <Img src={host?.header_url || organiser.image_url} alt=""
               style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0,
                        background: 'linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.22))' }} />
          <div style={{ position: 'relative', padding: '14px 16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
              <div style={{ font: font(700, 14, 1.2), color: '#fff', textShadow: '0 1px 5px rgba(0,0,0,.5)' }}>
                {ORGANISER_LABEL[organiser.kind]}
              </div>
              <SourceBadge event={event} organiserName={organiserName} />
            </div>
            <div
              className="tap"
              role="button"
              onClick={() => nav(entityHref(organiser))}
              style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex',
                       alignItems: 'center', gap: 12, boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 999, overflow: 'hidden', background: '#EFEDE9',
                            flex: 'none' }}>
                <Img src={organiser.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ font: font(700, 14.5, 1.25), color: '#1A1A18', minWidth: 0,
                                textWrap: 'pretty' }}>{organiser.name}</div>
                  {organiser.verified && <Verified color={accent} />}
                </div>
                <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 3 }}>
                  {managed
                    ? `${store.isSaved(organiser.id) ? 'Following' : 'Follow'} for event alerts`
                    : `${store.isSaved(organiser.id) ? 'Following' : 'Follow'} — alerts come from LGBTQ.UT`}
                </div>
              </div>
              <div
                className="tap"
                role="button"
                onClick={(e) => { e.stopPropagation(); store.toggleSave(organiser.id, organiser.kind) }}
                style={{ width: 36, height: 36, borderRadius: 999, background: '#F4F2EE', display: 'flex',
                         alignItems: 'center', justifyContent: 'center', flex: 'none' }}
              >
                <Heart size={18} filled={store.isSaved(organiser.id)}
                       color={store.isSaved(organiser.id) ? accent : '#8A867F'} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* details */}
      <div style={{ padding: '22px 18px 8px' }}>
        <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.01em' }}>Details</div>
        <div style={{ font: font(600, 13, 1.35), color: '#6E6A64', marginTop: 10 }}>{event.date_label}</div>
        <RichText text={event.description}
                  style={{ font: font(400, 14.5, 1.62), color: C.body, marginTop: 11 }} />
      </div>

      {/* poll */}
      <div style={{ padding: '26px 18px 0' }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ font: font(700, 16, 1.3), color: '#161615', textWrap: 'pretty' }}>
            {social.poll.question}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 13 }}>
            {social.poll.options.map((o, i) => {
              const n = o.votes + (picked === i ? 1 : 0)
              const pct = Math.round((n / pollTotal) * 100)
              const chosen = picked === i
              return (
                <div
                  key={o.label}
                  className="tap"
                  role="button"
                  onClick={() => store.vote(social.poll.id, i)}
                  style={{ position: 'relative', borderRadius: 10, overflow: 'hidden',
                           background: chosen ? tint : '#F5F3EF',
                           border: `1.5px solid ${chosen ? accent : C.border}` }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: reveal ? `${pct}%` : '0%',
                                background: tint, transition: 'width .35s cubic-bezier(.22,1,.36,1)' }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '11px 13px' }}>
                    <div style={{ flex: 1, minWidth: 0, font: font(600, 13.5, 1.3), color: '#22221F',
                                  textWrap: 'pretty' }}>{o.label}</div>
                    {reveal && (
                      <div style={{ font: font(700, 12.5, 1.2), color: accent, flex: 'none' }}>{pct}%</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 11 }}>
            {reveal ? plural(pollTotal, 'vote', 'votes') : 'Vote to see the results'}
          </div>
        </div>
      </div>

      {/* reviews — only after the event date */}
      {past && (
        <div style={{ padding: '26px 18px 0' }}>
          <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.01em' }}>Reviews</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12,
                        border: `1px solid ${C.border}`, borderRadius: 14, padding: 15 }}>
            <div style={{ font: font(800, 34, 1), color: '#161615', letterSpacing: '-.02em' }}>{average}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(400, 12, 1.3), color: C.muted }}>
                {plural(allReviews.length, 'review', 'reviews')}
              </div>
              {hiddenReviews > 0 && (
                <div style={{ font: font(400, 11, 1.35), color: C.faint, marginTop: 4, textWrap: 'pretty' }}>
                  {hiddenReviews === 1
                    ? '1 review hidden from someone you blocked or muted'
                    : `${hiddenReviews} reviews hidden from people you blocked or muted`}
                </div>
              )}
              <div style={{ font: font(600, 12.5, 1.3), color: '#3A3A37', marginTop: 6 }}>
                {myStars ? 'Thanks — add a note if you want' : 'Rate this event'}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="tap" role="button" onClick={() => setMyStars(n)}
                       style={{ display: 'flex' }}>
                    <Star size={22} filled={n <= myStars} color={n <= myStars ? accent : '#E0DCD5'} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {shownReviews.map((r) => (
              <div key={r.who} style={{ padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: avatarBg(r.who),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                font: font(700, 11, 1), color: '#fff', flex: 'none' }}>
                    {initialsOf(r.who)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18' }}>{r.who}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <div style={{ display: 'flex', gap: 1 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={12} filled={n <= r.stars} color={n <= r.stars ? accent : '#E0DCD5'} />
                        ))}
                      </div>
                      <div style={{ font: font(400, 11, 1.3), color: C.faint }}>{r.when}</div>
                    </div>
                  </div>
                </div>
                <div style={{ font: font(400, 13.5, 1.55), color: '#4A4945', marginTop: 9, textWrap: 'pretty' }}>
                  {r.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* discussion */}
      <div style={{ padding: '26px 18px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.01em' }}>Discussion</div>
          <div style={{ font: font(400, 12, 1.3), color: C.muted }}>
            {plural(thread.length, 'comment', 'comments')}
          </div>
        </div>
        {!managed && (
          <div style={{ font: font(400, 12, 1.5), color: C.muted, marginTop: 6, textWrap: 'pretty' }}>
            Between attendees. Nobody from {organiserName} is reading this — LGBTQ.UT moderates it.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {thread.map((c) => {
            const hidden = !c.host && isMuted(c.who) && !revealed[c.who]
            return (
              <div key={c.id} style={{ padding: '13px 0', borderBottom: `1px solid ${C.hairline}` }}>
                {hidden ? (
                  <div
                    className="tap"
                    role="button"
                    onClick={() => setRevealed((r) => ({ ...r, [c.who]: true }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10,
                             background: '#F7F5F1', padding: '11px 13px' }}
                  >
                    <div style={{ flex: 1, minWidth: 0, font: font(400, 12.5, 1.35), color: C.muted }}>
                      Hidden — you muted {c.who}
                    </div>
                    <div style={{ font: font(600, 12.5, 1.2), color: accent, flex: 'none' }}>Show</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 11 }}>
                    <div
                      className="tap"
                      role="button"
                      onClick={() => { if (!c.host) nav(`/u/${encodeURIComponent(c.who)}`) }}
                      style={{ width: 34, height: 34, borderRadius: 999,
                               background: c.host ? accent : avatarBg(c.who), display: 'flex',
                               alignItems: 'center', justifyContent: 'center', font: font(700, 11.5, 1),
                               color: '#fff', flex: 'none' }}
                    >
                      {initialsOf(c.who)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <div
                          className="tap"
                          role="button"
                          onClick={() => { if (!c.host) nav(`/u/${encodeURIComponent(c.who)}`) }}
                          style={{ font: font(600, 13.5, 1.25), color: '#1A1A18', textWrap: 'pretty' }}
                        >
                          {c.who}
                        </div>
                        {c.host && (
                          <div style={{ borderRadius: 4, padding: '2px 6px', background: tint,
                                        font: font(700, 9, 1.4), color: accent, letterSpacing: '.05em' }}>
                            HOST
                          </div>
                        )}
                        <div style={{ font: font(400, 11, 1.3), color: C.faint }}>{rel(c.minutesAgo)}</div>
                      </div>
                      <div style={{ font: font(400, 13.5, 1.55), color: '#4A4945', marginTop: 5,
                                    textWrap: 'pretty' }}>
                        {c.body}
                      </div>
                      {!c.host && c.who !== me && !isMuted(c.who) && (
                        <div className="tap" role="button" onClick={() => store.mute(c.who)}
                             style={{ display: 'inline-block', marginTop: 8, font: font(600, 11.5, 1.2),
                                      color: C.faint }}>
                          Mute
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.fill, borderRadius: 11,
                        padding: '10px 13px' }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') post() }}
              placeholder="Add to the discussion"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent',
                       font: font(400, 14, 1.3), color: '#1A1A18' }}
            />
          </div>
          <div
            className="tap"
            role="button"
            onClick={post}
            style={{ borderRadius: 11, padding: '11px 17px', background: draft.trim() ? accent : '#E5E2DC',
                     font: font(700, 13.5, 1.2), color: draft.trim() ? '#fff' : '#A5A19B', flex: 'none' }}
          >
            Post
          </div>
        </div>
        <div style={{ font: font(400, 11, 1.5), color: C.faint, marginTop: 10, textWrap: 'pretty' }}>
          Posting as {viewAsHost ? (host?.name ?? me) : me}.{' '}
          {managed
            ? `${organiserName} moderates this discussion.`
            : `${organiserName} will not see this — reach them directly if you need an answer.`}
        </div>
      </div>
    </>
  )
}

export default EventDetail
