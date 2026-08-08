import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import type { AppData, Channels } from '../lib/types'
import { Img, SearchField, Toggle, font } from '../components/ui'
import { Back } from '../components/icons'

// BecomeHost — route `/apply`.
//
// Listings cannot be self-claimed. Only entities an admin has already attached
// to this account appear in step 1 and step 2; everyone else gets the shorter
// flow that asks for proof of affiliation instead.

/** Stands in for a row of `public.host_assignments` (profile_id → business_id / resource_id). */
interface Assignment {
  kind: 'business' | 'resource'
  id: string
}

interface Assigned {
  kind: 'business' | 'resource'
  id: string
  name: string
  img: string
  sub: string
  location: string
  website: string
  email: string
  verified: boolean
}

type StepKey = 'source' | 'pick' | 'details' | 'channels' | 'review'
type SourceKey = 'business' | 'resource' | 'new'

const STEP_NAMES: Record<StepKey, string> = {
  source: 'Identity',
  pick: 'Choose your listing',
  details: 'Profile',
  channels: 'Channels',
  review: 'Review',
}

function resolveAssignments(data: AppData, assignments: Assignment[]): Assigned[] {
  const out: Assigned[] = []
  for (const a of assignments) {
    if (a.kind === 'business') {
      const b = data.businesses.find((x) => x.id === a.id)
      if (b) {
        out.push({
          kind: 'business', id: b.id, name: b.name, img: b.image_url,
          sub: b.county || 'Online only', location: b.county || 'Statewide',
          website: b.website, email: b.email, verified: b.verified,
        })
      }
    } else {
      const r = data.resources.find((x) => x.id === a.id)
      if (r) {
        out.push({
          kind: 'resource', id: r.id, name: r.name, img: r.image_url,
          sub: r.category, location: r.county || r.counties[0] || 'Statewide',
          website: r.website, email: r.email, verified: r.verified,
        })
      }
    }
  }
  return out
}

// ------------------------------------------------------------- small pieces

const Title = ({ children }: { children: ReactNode }) => (
  <div style={{ font: font(800, 22, 1.18), color: '#111', letterSpacing: '-.02em', textWrap: 'pretty' }}>
    {children}
  </div>
)

const Note = ({ children }: { children: ReactNode }) => (
  <div style={{ font: font(400, 13, 1.5), color: '#7C7871', marginTop: 7, textWrap: 'pretty' }}>{children}</div>
)

const Card = ({ children }: { children: ReactNode }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>{children}</div>
)

/** FROM LISTING / HOST ONLY / REQUIRED style chip. */
function Chip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{ borderRadius: 4, padding: '2px 6px', background: bg, font: font(700, 9, 1.4),
                   color: fg, letterSpacing: '.05em', flex: 'none' }}>{label}</span>
  )
}

export default function BecomeHost() {
  const nav = useNavigate()
  const { accent, tint } = useStore()
  const data = useData()

  // Stands in for `public.host_assignments` until the admin tool exists. An
  // empty list is the real-world default: nothing has been assigned, so the
  // three-step proof-of-affiliation flow is what most people will see.
  const [assignments] = useState<Assignment[]>([])

  const [step, setStep] = useState(0)
  const [source, setSource] = useState<SourceKey | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [chanOverride, setChanOverride] = useState<Partial<Channels>>({})
  const [query, setQuery] = useState('')
  const [done, setDone] = useState(false)

  const assigned = useMemo(
    () => (data ? resolveAssignments(data, assignments) : []),
    [data, assignments],
  )

  if (!data) return <div />

  const hasAssign = assigned.length > 0
  const kind: SourceKey | null = hasAssign ? source : 'new'

  const flow: StepKey[] = !hasAssign
    ? ['details', 'channels', 'review']
    : kind === 'new'
      ? ['source', 'details', 'channels', 'review']
      : ['source', 'pick', 'details', 'channels', 'review']

  const idx = Math.min(step, flow.length - 1)
  const at = flow[idx]

  const myBusinesses = assigned.filter((a) => a.kind === 'business')
  const myResources = assigned.filter((a) => a.kind === 'resource')
  const pool = kind === 'business' ? myBusinesses : kind === 'resource' ? myResources : []
  const ent = kind === 'new' || kind === null ? null : (pool.find((x) => x.id === pickedId) ?? null)

  // Newsletter is only available to a host linked to a business or resource.
  const newsOk = !!ent
  const ch: Channels = {
    events: true,
    offers: kind === 'business',
    newsletter: newsOk,
    ...chanOverride,
  }

  const hostName = ent ? ent.name : 'Your host name'
  const ready = at === 'source' ? !!kind : at === 'pick' ? !!ent : true

  const goBack = () => {
    if (done || idx === 0) nav(-1)
    else { setStep(idx - 1); setQuery('') }
  }

  const goNext = () => {
    if (!ready) return
    if (at === 'review') setDone(true)
    else { setStep(idx + 1); setQuery('') }
  }

  const showSearch = pool.length > 6
  const q = query.trim().toLowerCase()
  const candidates = pool.filter((x) => !showSearch || !q || x.name.toLowerCase().includes(q))

  const liveChannels = ['Events']
    .concat(ch.offers ? ['Offers'] : [])
    .concat(newsOk && ch.newsletter ? ['Newsletter'] : [])

  const ported = { tag: 'FROM LISTING', bg: tint, fg: accent }
  const hostOnly = { tag: 'HOST ONLY', bg: '#F1EFEB', fg: '#7C7871' }

  const fields = ent
    ? [
        { label: 'Host name', value: ent.name, chip: ported, dim: false },
        { label: 'Public tagline', value: 'Tell people what you host. Shown under your name.', chip: hostOnly, dim: true },
        { label: 'Location', value: ent.location, chip: ported, dim: false },
        { label: 'Website', value: ent.website || 'Not on file', chip: ported, dim: !ent.website },
        { label: 'Public contact', value: ent.email || 'Add an email for attendees', chip: ent.email ? ported : hostOnly, dim: !ent.email },
        { label: 'Who manages this', value: 'You. Add co-hosts after approval.', chip: hostOnly, dim: false },
      ]
    : [
        { label: 'Host name', value: 'Add the name people will see', chip: hostOnly, dim: true },
        { label: 'Public tagline', value: 'One line about what you host', chip: hostOnly, dim: true },
        { label: 'Location', value: 'Which county do you serve?', chip: hostOnly, dim: true },
        { label: 'Website', value: 'Optional', chip: hostOnly, dim: true },
        { label: 'Public contact', value: 'Email for attendees', chip: hostOnly, dim: true },
        { label: 'Proof of affiliation', value: 'A link or document an admin can check', chip: hostOnly, dim: true },
      ]

  const channelRows: Array<{
    key: keyof Channels; label: string; sub: string; tag: string; locked: boolean; on: boolean
  }> = [
    {
      key: 'events', label: 'Events', tag: 'REQUIRED', locked: true, on: true,
      sub: 'Your event cards appear in the Events tab and on your profile.',
    },
    {
      key: 'offers', label: 'Offers', tag: '', locked: false, on: ch.offers,
      sub: 'Coupons and member deals. Businesses use this most, and it is on by default for them.',
    },
    {
      key: 'newsletter', label: 'Newsletter', tag: newsOk ? '' : 'NEEDS A LISTING',
      locked: !newsOk, on: newsOk && ch.newsletter,
      sub: newsOk
        ? 'Write directly to followers. No email list needed.'
        : 'Only hosts linked to a business or resource can send newsletters. Ask an admin to assign you a listing to unlock this.',
    },
  ]

  const summary = [
    { label: 'Host', value: hostName },
    {
      label: 'Linked to',
      value: ent
        ? `${ent.kind === 'business' ? 'Business listing' : 'Resource listing'} — ${ent.name}`
        : 'Nothing yet — new profile',
    },
    { label: 'Verified', value: ent ? 'Inherited from your listing' : 'Admin will verify before approval' },
    { label: 'Channels', value: liveChannels.join(', ') },
    { label: 'Followers', value: ent ? 'Anyone who saved your listing is offered your channels' : 'Starts at zero' },
  ]

  const timeline = [
    { label: 'Submitted', sub: 'Just now', state: 'done' as const },
    { label: 'Under review', sub: 'A volunteer admin, usually within two business days', state: 'now' as const },
    { label: 'Approved', sub: 'You can post events, offers and newsletters', state: 'next' as const },
  ]

  return (
    <div style={{ minHeight: '100%', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Stepper header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff',
                    borderBottom: `1px solid #EFECE8`, padding: '56px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="tap" role="button" onClick={goBack}
               style={{ width: 34, height: 34, borderRadius: 999, background: '#F1EFEB', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Back />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: font(700, 16, 1.2), color: '#161615' }}>Become a Host</div>
            <div style={{ font: font(400, 11.5, 1.3), color: '#8A867F', marginTop: 2 }}>
              {done ? 'Submitted' : `Step ${idx + 1} of ${flow.length} — ${STEP_NAMES[at]}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
          {flow.map((f, i) => (
            <div key={f} style={{ flex: 1, height: 4, borderRadius: 999,
                                  background: done || i <= idx ? accent : C.border }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {/* ---------------------------------------------------- 1. Identity */}
        {!done && at === 'source' && (
          <div style={{ padding: '22px 16px 28px' }}>
            <div style={{ font: font(800, 24, 1.15), color: '#111', letterSpacing: '-.02em', textWrap: 'pretty' }}>
              Who is hosting?
            </div>
            <div style={{ font: font(400, 14, 1.55), color: '#6E6A64', marginTop: 9, textWrap: 'pretty' }}>
              A host profile is a marketing channel. Only listings an admin has assigned to your account appear here —
              listings cannot be claimed by whoever asks first.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 22 }}>
              {([
                myBusinesses.length > 0 && {
                  key: 'business' as const,
                  label: myBusinesses.length === 1 ? myBusinesses[0].name : 'A business you manage',
                  tag: 'ASSIGNED',
                  sub: 'Your Shop Queer page carries over — name, images, contact and your verified badge.',
                },
                myResources.length > 0 && {
                  key: 'resource' as const,
                  label: myResources.length === 1 ? myResources[0].name : 'An organization you manage',
                  tag: 'ASSIGNED',
                  sub: 'Your resource entry carries over. Hosting does not change how the resource is listed.',
                },
                {
                  key: 'new' as const,
                  label: 'Something else — start fresh',
                  tag: '',
                  sub: 'A standalone host profile. An admin verifies you before it goes public.',
                },
              ].filter(Boolean) as Array<{ key: SourceKey; label: string; tag: string; sub: string }>)
                .map((s) => (
                  <div key={s.key} className="tap" role="button"
                       onClick={() => { setSource(s.key); setPickedId(null) }}
                       style={{ border: `1.5px solid ${kind === s.key ? accent : '#EAE7E2'}`, borderRadius: 14,
                                padding: 16, background: kind === s.key ? tint : '#FCFBF9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ font: font(700, 16, 1.2), color: '#161615', flex: 1, minWidth: 0 }}>{s.label}</div>
                      {s.tag && <Chip label={s.tag} bg={tint} fg={accent} />}
                    </div>
                    <div style={{ font: font(400, 12.5, 1.5), color: '#7C7871', marginTop: 6, textWrap: 'pretty' }}>
                      {s.sub}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ----------------------------------------------- 2. Choose listing */}
        {!done && at === 'pick' && (
          <div style={{ padding: '18px 0 28px' }}>
            <div style={{ padding: '0 16px 14px' }}>
              <Title>{pool.length === 1 ? 'Confirm the listing' : 'Which listing?'}</Title>
              <Note>
                You can only port listings an admin has assigned to your account. To get access to another listing, ask
                an admin — listings cannot be self-claimed.
              </Note>
            </div>
            {/* Search appears only above six assigned listings. */}
            {showSearch && (
              <SearchField value={query} onChange={setQuery} placeholder="Search your listings" />
            )}
            {candidates.map((c) => (
              <div key={c.id} className="tap" role="button" onClick={() => setPickedId(c.id)}
                   style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 16px',
                            borderBottom: `1px solid ${C.hairline}`,
                            background: pickedId === c.id ? tint : '#fff' }}>
                <div style={{ width: 46, height: 46, borderRadius: 11, overflow: 'hidden',
                              background: '#F0EDE8', flex: 'none' }}>
                  <Img src={c.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 14.5, 1.25), color: '#1A1A18', textWrap: 'pretty' }}>{c.name}</div>
                  <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 3 }}>{c.sub}</div>
                </div>
                {pickedId === c.id && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6"
                       strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ----------------------------------------------------- 3. Profile */}
        {!done && at === 'details' && (
          <div style={{ padding: '20px 16px 28px' }}>
            <Title>Your host profile</Title>
            <Note>
              {ent
                ? 'Pulled from your listing. Edit anything that should read differently to event-goers.'
                : 'Fill this in and an admin will verify you before the profile goes public.'}
            </Note>

            {!hasAssign && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 16, borderRadius: 12,
                            background: '#F7F5F1', border: '1px solid #EAE7E2', padding: '13px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 13, 1.3), color: '#3A3A37' }}>No listings assigned to you</div>
                  <div style={{ font: font(400, 11.5, 1.45), color: '#7C7871', marginTop: 3, textWrap: 'pretty' }}>
                    Listings cannot be claimed. If you run a business or organization already in the app, ask an admin
                    to assign it to your account and its details will port over automatically. Until then, add proof of
                    affiliation below and an admin will check it by hand.
                  </div>
                </div>
              </div>
            )}

            {ent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 16, borderRadius: 12,
                            background: C.successBg, border: '1px solid #D8E9E0', padding: '13px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 13.5, 1.3), color: '#1C4735' }}>Verification carries over</div>
                  <div style={{ font: font(400, 11.5, 1.4), color: '#4E7A64', marginTop: 2, textWrap: 'pretty' }}>
                    {ent.kind === 'business'
                      ? 'Verified businesses become verified hosts automatically.'
                      : 'Verified resources become verified hosts automatically.'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 13, alignItems: 'center', marginTop: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: 999, overflow: 'hidden', background: '#F0EDE8',
                            border: '3px solid #fff', boxShadow: '0 3px 12px rgba(0,0,0,.14)', flex: 'none' }}>
                <Img src={ent?.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'flex-start', gap: 7 }}>
                <div className="tap" style={{ borderRadius: 10, border: `1px solid ${C.border}`, padding: '9px 14px',
                                              font: font(600, 12.5, 1.2), color: '#2A2A28' }}>
                  Replace profile image
                </div>
                <div className="tap" style={{ borderRadius: 10, border: `1px solid ${C.border}`, padding: '9px 14px',
                                              font: font(600, 12.5, 1.2), color: '#2A2A28' }}>
                  Replace header image
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              {fields.map((f) => (
                <div key={f.label} style={{ padding: '13px 0', borderBottom: `1px solid ${C.hairline}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ font: font(600, 10.5, 1.2), letterSpacing: '.06em', textTransform: 'uppercase',
                                  color: '#9A968F' }}>{f.label}</div>
                    <Chip label={f.chip.tag} bg={f.chip.bg} fg={f.chip.fg} />
                  </div>
                  <div style={{ font: font(500, 14.5, 1.4), color: f.dim ? '#A5A19B' : '#22221F', marginTop: 5,
                                wordBreak: 'break-word', textWrap: 'pretty' }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- 4. Channels */}
        {!done && at === 'channels' && (
          <div style={{ padding: '20px 16px 28px' }}>
            <Title>Your channels</Title>
            <Note>
              People who follow you choose which of these they want. Only turn on what you will actually use.
            </Note>
            <div style={{ marginTop: 18 }}>
              <Card>
                {channelRows.map((c, i) => (
                  <div key={c.key}
                       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 14px',
                                borderBottom: i === channelRows.length - 1 ? 'none' : `1px solid ${C.hairline}`,
                                opacity: c.locked && c.key !== 'events' ? 0.55 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ font: font(600, 14.5, 1.25), color: '#1A1A18' }}>{c.label}</div>
                        {c.tag && <Chip label={c.tag} bg="#F1EFEB" fg="#7C7871" />}
                      </div>
                      <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 4, textWrap: 'pretty' }}>
                        {c.sub}
                      </div>
                    </div>
                    <Toggle
                      on={c.on}
                      disabled={c.locked}
                      onChange={() => {
                        if (c.locked) return
                        setChanOverride((o) => ({ ...o, [c.key]: !c.on }))
                      }} />
                  </div>
                ))}
              </Card>
            </div>
            <div style={{ font: font(400, 12, 1.5), color: '#8C887F', marginTop: 14, textWrap: 'pretty' }}>
              Sending limit: one push per channel per week. Newsletters are exempt if people opted into them
              specifically.
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- 5. Review */}
        {!done && at === 'review' && (
          <div style={{ padding: '20px 16px 28px' }}>
            <Title>Send for review</Title>
            <Note>
              A volunteer admin checks every host profile before it goes public. Most are reviewed within two business
              days.
            </Note>
            <div style={{ marginTop: 18 }}>
              <Card>
                {summary.map((s, i) => (
                  <div key={s.label}
                       style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
                                borderBottom: i === summary.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                    <div style={{ font: font(600, 11, 1.5), letterSpacing: '.05em', textTransform: 'uppercase',
                                  color: '#9A968F', width: 88, flex: 'none' }}>{s.label}</div>
                    <div style={{ flex: 1, minWidth: 0, font: font(500, 13.5, 1.45), color: '#22221F',
                                  textWrap: 'pretty' }}>{s.value}</div>
                  </div>
                ))}
              </Card>
            </div>
            <div style={{ borderRadius: 12, background: '#F7F5F1', padding: 14, marginTop: 16 }}>
              <div style={{ font: font(600, 12.5, 1.35), color: '#3A3A37' }}>What admins check</div>
              <div style={{ font: font(400, 12, 1.6), color: '#7C7871', marginTop: 6, textWrap: 'pretty' }}>
                That you represent the entity you linked, that the listing is queer-owned or actively affirming, and
                that contact details resolve.
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------- pending approval page */}
        {done && (
          <div style={{ padding: '36px 20px 28px', textAlign: 'center' }}>
            <div style={{ width: 66, height: 66, borderRadius: 999, background: tint, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" />
              </svg>
            </div>
            <div style={{ font: font(800, 24, 1.2), color: '#111', letterSpacing: '-.02em', marginTop: 18 }}>
              Sent for review
            </div>
            <div style={{ font: font(400, 14, 1.55), color: '#6E6A64', marginTop: 9, textWrap: 'pretty' }}>
              {ent
                ? `We will notify you when an admin approves ${ent.name}. Your listing stays live in the meantime.`
                : 'We will notify you when an admin approves your profile.'}
            </div>
            <div style={{ marginTop: 22, textAlign: 'left' }}>
              <Card>
                {timeline.map((t, i) => (
                  <div key={t.label}
                       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                                borderBottom: i === timeline.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, flex: 'none', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  background: t.state === 'done' ? accent : '#fff',
                                  border: `2px solid ${t.state === 'next' ? C.border : accent}` }}>
                      <div style={{ width: 7, height: 7, borderRadius: 999,
                                    background: t.state === 'done' ? '#fff' : t.state === 'now' ? accent : C.border }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: font(600, 13.5, 1.25), color: t.state === 'next' ? '#A5A19B' : '#1A1A18' }}>
                        {t.label}
                      </div>
                      <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 2, textWrap: 'pretty' }}>
                        {t.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
            <div className="tap" role="button" onClick={() => nav('/profile')}
                 style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center', background: accent,
                          font: font(700, 14.5, 1.2), color: '#fff' }}>
              Back to your profile
            </div>
          </div>
        )}
      </div>

      {!done && (
        <div style={{ position: 'sticky', bottom: 0, background: 'rgba(255,255,255,.96)',
                      backdropFilter: 'blur(10px)', borderTop: '1px solid #EFECE8', padding: '12px 16px 16px' }}>
          <div className="tap" role="button" onClick={goNext}
               style={{ borderRadius: 12, padding: 14, textAlign: 'center',
                        background: ready ? accent : C.border,
                        font: font(700, 14.5, 1.2), color: ready ? '#fff' : '#A5A19B',
                        cursor: ready ? 'pointer' : 'not-allowed' }}>
            {at === 'source'
              ? (kind === 'new' ? 'Start a new profile' : 'Continue')
              : at === 'pick' ? 'Use this listing'
              : at === 'review' ? 'Send for review'
              : 'Continue'}
          </div>
        </div>
      )}
    </div>
  )
}
