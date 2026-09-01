import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTrail } from '../lib/trail'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { entityRef } from '../lib/data'
import { PAGE_KIND } from '../lib/pages'
import type { EntityKind, EntityRef } from '../lib/types'
import { EntityCard } from '../components/EntityCard'
import { font } from '../components/ui'
import { Back } from '../components/icons'

interface RemoteProfile {
  id: string
  display_name: string
  public_handle: string | null
  avatar_url: string | null
  bio: string | null
  pronouns: string | null
  county: string | null
  social_links: string[]
  identity_labels: string[]
  interests: string[]
}

// UserProfile — route `/u/:name`, and EditProfile — route `/profile/edit`.
//
// There is no seeded users table, so display data is derived deterministically
// from the :name param. This stands in for `public.public_profiles`; once that
// table has rows, swap `personFor()` for a fetch and everything else holds.

type ProfileStyle = 'minimal' | 'community' | 'social'

interface Person {
  pronouns: string
  county: string
  bio: string
  links: string[]
}

/** The prototype's people, so matching names read like real profiles. */
const PEOPLE: Record<string, Person> = {
  'Rio M.': {
    pronouns: 'she/her', county: 'Salt Lake County',
    bio: 'Nurse, gardener, and the person who always brings folding chairs. Ask me about the Wednesday night group.',
    links: ['riomartinez.me', 'instagram.com/rio.grows'],
  },
  'Tay B.': {
    pronouns: 'they/them', county: 'Weber County',
    bio: 'Ogden. Carpools to most Wasatch Front events — say hi if you need a ride.',
    links: ['linktr.ee/taybee'],
  },
  'Wren D.': {
    pronouns: 'he/him', county: 'Utah County',
    bio: 'Photographer. Mostly shoot shows.', links: [],
  },
  'Dana R.': {
    pronouns: 'she/her', county: 'Salt Lake County',
    bio: 'Small business owner, chamber member, terrible at networking but I keep showing up.',
    links: ['danarosecreative.com'],
  },
  'Ash P.': { pronouns: 'they/them', county: 'Davis County', bio: 'Layton. New here.', links: [] },
  'June L.': { pronouns: 'she/her', county: 'Cache County', bio: 'Logan. Runs the campus group.', links: [] },
  'Sam K.': { pronouns: 'he/they', county: 'Salt Lake County', bio: '', links: [] },
  'Kai S.': {
    pronouns: 'they/them', county: 'Washington County',
    bio: 'St. George. Building something down here, slowly.', links: [],
  },
  'Noor A.': { pronouns: 'she/her', county: 'Salt Lake County', bio: '', links: [] },
}

const AVATAR_COLORS = ['#7A2FA6', '#2C86B5', '#B0523E', '#2E8B45', '#9B4F96', '#4B3FBF', '#DD6317', '#2A7F70']

const INTERESTS = [
  'Mutual aid', 'Trans health', 'Book club', 'Hiking',
  'Drag', 'Volunteering', 'Board games', 'Live music',
]

/** FNV-1a over the name, so every derived value is stable for a given person. */
function seedOf(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** xorshift32 — enough randomness for placeholder stats, fully deterministic. */
function prng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function personFor(name: string): Person {
  return PEOPLE[name] ?? { pronouns: '', county: 'Utah', bio: '', links: [] }
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ------------------------------------------------------------- small pieces

const OutIcon = ({ color = '#A5A19B' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M8 16L16 8M9 8h7v7" />
  </svg>
)

function OutlineButton({ children, onClick, color = '#2A2A28' }: {
  children: ReactNode; onClick?: () => void; color?: string
}) {
  return (
    <div className="tap" role="button" onClick={onClick}
         style={{ flex: 1, textAlign: 'center', borderRadius: 11, border: `1.5px solid ${C.border}`,
                  padding: 12, font: font(600, 13.5, 1.2), color }}>
      {children}
    </div>
  )
}

// --------------------------------------------------------------- the screen

export default function UserProfile({ style = 'social' }: { style?: ProfileStyle }) {
  const nav = useNavigate()
  const { back } = useTrail()
  const params = useParams<{ name: string }>()
  const data = useData()
  const { accent, tint, account, isBlocked, isMuted, isFollowing, toggleFollow, block, unblock, mute, unmute } = useStore()
  const [remote, setRemote] = useState<RemoteProfile | null>(null)
  const [represents, setRepresents] = useState<Array<{ kind: EntityKind; id: string }>>([])

  const param = params.name ?? ''

  // `/u/:name` takes a handle first, then a display name. Handles are unique;
  // display names are not, so a handle is the address to share.
  useEffect(() => {
    if (!param) return
    let alive = true
    const handle = param.replace(/^@/, '')
    void (async () => {
      const byHandle = await supabase.from('social_profiles').select('*').eq('public_handle', handle).maybeSingle()
      const d = byHandle.data
        ?? (await supabase.from('social_profiles').select('*').eq('display_name', param).maybeSingle()).data
      if (!alive) return
      if (d) {
        setRemote(d as RemoteProfile)
        const { data: admin } = await supabase.from('entity_admins')
          .select('entity_kind, entity_id').eq('profile_id', d.id)
        if (alive) setRepresents((admin ?? []).map((a) => ({ kind: a.entity_kind as EntityKind, id: a.entity_id })))
      }
    })()
    return () => { alive = false }
  }, [param])

  const name = remote?.display_name ?? param.replace(/^@/, '')

  if (!data) return <div />

  const person = remote ? {
    pronouns: remote.pronouns ?? '',
    county: remote.county ?? 'Utah',
    bio: remote.bio ?? '',
    links: remote.social_links ?? [],
  } : personFor(name)
  const blocked = isBlocked(name)
  const muted = isMuted(name)
  const self = !!account.profileId && (remote ? remote.id === account.profileId : account.displayName === name)
  const remoteId = remote?.id ?? null
  const following = remoteId ? isFollowing(remoteId) : false

  const seed = seedOf(name)
  const rand = prng(seed)
  const color = self ? accent : AVATAR_COLORS[seed % AVATAR_COLORS.length]

  const stats = [
    { n: String(4 + Math.floor(rand() * 23)), label: 'Events' },
    { n: String(Math.floor(rand() * 5)), label: 'Hosting' },
    { n: `20${18 + Math.floor(rand() * 7)}`, label: 'Member since' },
  ]
  const interests = [
    INTERESTS[seed % INTERESTS.length],
    INTERESTS[(seed + 3) % INTERESTS.length],
    INTERESTS[(seed + 5) % INTERESTS.length],
  ]
  const mutualCount = self || blocked ? 0 : (seed % 3) + 1
  const mutual = mutualCount ? `${mutualCount} ${mutualCount === 1 ? 'event' : 'events'} in common` : ''

  const goingTo = data.events[seed % Math.max(data.events.length, 1)] ?? null

  const links = blocked ? [] : person.links
  const bio = person.bio || 'No bio yet.'

  const report = () => {
    window.location.href =
      `mailto:hello@lgbtq.ut?subject=${encodeURIComponent(`Report a profile: ${name}`)}`
  }

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <div style={{ position: 'relative', height: 132, background: color, overflow: 'hidden' }}>
        <div className="tap" role="button" onClick={back} aria-label="Back"
             style={{ position: 'absolute', top: 58, left: 14, width: 34, height: 34, borderRadius: 999,
                      background: 'rgba(255,255,255,.75)', backdropFilter: 'blur(8px)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <Back />
        </div>
      </div>

      <div style={{ padding: '0 18px 28px', marginTop: -48, textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 999, background: color, border: '4px solid #fff',
                      boxShadow: '0 4px 16px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', font: font(700, 30, 1), color: '#fff', margin: '0 auto' }}>
          {initialsOf(name)}
        </div>

        <div style={{ font: font(800, 24, 1.18), color: C.ink, letterSpacing: '-.02em', marginTop: 14,
                      textWrap: 'pretty' }}>
          {name}
        </div>

        {/* A blocked profile is reduced to a stub: avatar and name, so the user
            knows who they are unblocking. Everything else is suppressed. */}
        {blocked ? (
          <>
            <div style={{ marginTop: 16, borderRadius: 12, background: '#F7F5F1', border: '1px solid #EAE7E2',
                          padding: 16, font: font(400, 12.5, 1.55), color: '#7C7871', textWrap: 'pretty' }}>
              This profile is hidden because you blocked them. Neither of you sees the other anywhere in the app.
              Unblock to see it again.
            </div>
            <div className="tap" role="button" onClick={() => unblock(name)}
                 style={{ marginTop: 18, borderRadius: 12, padding: 13, textAlign: 'center', background: accent,
                          font: font(700, 14, 1.2), color: '#fff' }}>
              Unblock
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 7,
                          flexWrap: 'wrap' }}>
              {person.pronouns && (
                <div style={{ borderRadius: 999, padding: '4px 11px', background: tint,
                              font: font(600, 11.5, 1.3), color: accent }}>{person.pronouns}</div>
              )}
              <div style={{ font: font(400, 12.5, 1.3), color: C.muted }}>{person.county || 'Utah'}</div>
            </div>

            <div style={{ font: font(400, 14, 1.6), color: C.body, marginTop: 14, textWrap: 'pretty',
                          maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>
              {bio}
            </div>

            {/* ------------------------------------------------- community */}
            {style === 'community' && (
              <>
                <div style={{ display: 'flex', marginTop: 20, borderTop: `1px solid ${C.hairline}`,
                              borderBottom: `1px solid ${C.hairline}`, padding: '14px 0' }}>
                  {stats.map((s) => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ font: font(800, 19, 1.1), color: '#161615', letterSpacing: '-.01em' }}>{s.n}</div>
                      <div style={{ font: font(500, 10.5, 1.2), color: '#8C887F', marginTop: 5,
                                    letterSpacing: '.04em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {mutual && (
                  <div style={{ font: font(500, 12, 1.3), color: accent, marginTop: 12 }}>{mutual}</div>
                )}
                {goingTo && (
                  <div style={{ marginTop: 18, textAlign: 'left' }}>
                    <div style={{ font: font(700, 11, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                                  color: '#9A968F', marginBottom: 9 }}>Going to</div>
                    <div className="tap" role="button" onClick={() => nav(`/event/${goingTo.id}`)}
                         style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${C.border}`,
                                  borderRadius: 12, padding: '12px 13px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18', textWrap: 'pretty' }}>
                          {goingTo.name}
                        </div>
                        <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 3 }}>
                          {goingTo.date_label}
                        </div>
                      </div>
                      <OutIcon color="#C3BFB8" />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------------------------------------------------- social */}
            {style === 'social' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 16, flexWrap: 'wrap' }}>
                  {interests.map((i) => (
                    <div key={i} style={{ borderRadius: 999, padding: '6px 13px', background: '#F4F2EE',
                                          font: font(600, 11.5, 1.3), color: '#5C5851' }}>{i}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  {stats.map((s) => (
                    <div key={s.label} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12,
                                                padding: '13px 8px' }}>
                      <div style={{ font: font(800, 20, 1.1), color: '#161615', letterSpacing: '-.01em' }}>{s.n}</div>
                      <div style={{ font: font(500, 10, 1.2), color: '#8C887F', marginTop: 5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {mutual && (
                  <div style={{ font: font(500, 12, 1.3), color: accent, marginTop: 14 }}>{mutual}</div>
                )}
              </>
            )}

            {/* ------------------------------------------------ pages they run */}
            {(() => {
              const pages = represents
                .map((r) => entityRef(data, r.kind, r.id))
                .filter((p): p is EntityRef => !!p)
              if (!pages.length) return null
              return (
                <div style={{ marginTop: 22, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ font: font(700, 11, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                                color: '#9A968F' }}>
                    {pages.length === 1 ? 'Runs' : 'Runs these pages'}
                  </div>
                  {pages.map((p) => (
                    <EntityCard key={`${p.kind}-${p.id}`} entity={p} />
                  ))}
                  <div style={{ font: font(400, 11.5, 1.5), color: C.faint, textWrap: 'pretty' }}>
                    {pages.length === 1
                      ? `Replies badged with the ${PAGE_KIND[pages[0].kind].label.toLowerCase()}'s name are official; everything else here is ${name} speaking for themselves.`
                      : `Replies badged with a page's name are official; everything else here is ${name} speaking for themselves.`}
                  </div>
                </div>
              )
            })()}

            {/* ----------------------------------------------------- links */}
            {links.length > 0 && (
              <div style={{ marginTop: 18 }}>
                {style === 'social' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {links.map((l) => (
                      <a key={l} href={`https://${l}`} target="_blank" rel="noreferrer"
                         style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                                  borderRadius: 11, border: `1.5px solid ${C.border}`, padding: 12,
                                  font: font(600, 13.5, 1.2), color: '#2A2A28', wordBreak: 'break-word',
                                  textDecoration: 'none' }}>
                        {l}<OutIcon />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ borderTop: `1px solid ${C.hairline}` }}>
                    {links.map((l) => (
                      <a key={l} href={`https://${l}`} target="_blank" rel="noreferrer"
                         style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0',
                                  borderBottom: `1px solid ${C.hairline}`, textAlign: 'left',
                                  textDecoration: 'none' }}>
                        <div style={{ flex: 1, minWidth: 0, font: font(500, 13.5, 1.35), color: accent,
                                      wordBreak: 'break-word' }}>{l}</div>
                        <OutIcon color="#C3BFB8" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --------------------------------------------------- actions */}
            {self ? (
              <div className="tap" role="button" onClick={() => nav('/profile/edit')}
                   style={{ marginTop: 20, borderRadius: 12, padding: 13, textAlign: 'center', background: accent,
                            font: font(700, 14, 1.2), color: '#fff' }}>
                Edit profile
              </div>
            ) : (
              <>
                {/* Follow button — only when viewing a real social profile.
                    Open to guests too: toggleFollow is device-local until
                    there is an account to sync it to, and following is what
                    fills an anonymous reader's feed. */}
                {remoteId && (
                  <div className="tap" role="button"
                       onClick={() => toggleFollow(remoteId)}
                       style={{ marginTop: 18, borderRadius: 12, padding: 13, textAlign: 'center',
                                background: following ? 'transparent' : accent,
                                border: following ? `1.5px solid ${C.border}` : 'none',
                                font: font(700, 14, 1.2), color: following ? C.body : '#fff' }}>
                    {following ? 'Following' : 'Follow'}
                  </div>
                )}
                {muted && (
                  <div style={{ marginTop: 18, borderRadius: 12, background: '#F7F5F1', border: '1px solid #EAE7E2',
                                padding: '12px 14px', font: font(400, 11.5, 1.45), color: '#7C7871',
                                textWrap: 'pretty' }}>
                    Muted. Their comments are collapsed behind a tap and their reviews are hidden. They can still
                    see you.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
                  <OutlineButton onClick={() => (muted ? unmute(name) : mute(name))}
                                 color={muted ? accent : '#2A2A28'}>
                    {muted ? 'Unmute' : 'Mute'}
                  </OutlineButton>
                  <OutlineButton onClick={() => block(name)} color="#2A2A28">Block</OutlineButton>
                  <OutlineButton onClick={report}>Report</OutlineButton>
                </div>
                <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 14, textAlign: 'center',
                              textWrap: 'pretty' }}>
                  Follow people to see their posts in your feed. Connect with people wherever they link to.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- EditProfile

type Visibility = 'private' | 'visible' | 'discoverable'

interface Draft {
  display_name: string
  public_handle: string
  pronouns: string
  county: string
  bio: string
  links: string
  avatar_url: string
  header_url: string
  identity_labels: string
  interests: string
  website: string
  visibility: Visibility
  search_visible: boolean
  recommendable: boolean
  indexable: boolean
}

const EMPTY_DRAFT: Draft = {
  display_name: '', public_handle: '', pronouns: '', county: '', bio: '',
  links: '', avatar_url: '', header_url: '', identity_labels: '', interests: '',
  website: '', visibility: 'private', search_visible: false, recommendable: false, indexable: false,
}

const labelStyle = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase' as const, color: '#9A968F',
}

const fieldStyle = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3), color: '#1A1A18',
  background: '#fff', boxSizing: 'border-box' as const,
}

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; sub: string }> = [
  { value: 'private', label: 'Private', sub: 'No social profile exists. People cannot find you.' },
  { value: 'visible', label: 'Visible', sub: 'People you interact with can view your profile, but it is not searchable.' },
  { value: 'discoverable', label: 'Discoverable', sub: 'Your profile can appear in search, communities, and recommendations.' },
]

export function EditProfile() {
  const { back } = useTrail()
  const { accent, account, signedIn } = useStore()
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, display_name: account.displayName ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = account.profileId
    if (!id) return
    let alive = true
    void supabase.from('social_profiles').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setDraft({
          display_name: data.display_name ?? '',
          public_handle: data.public_handle ?? '',
          pronouns: data.pronouns ?? '',
          county: data.county ?? '',
          bio: data.bio ?? '',
          links: (data.social_links ?? []).join('\n'),
          avatar_url: data.avatar_url ?? '',
          header_url: data.header_url ?? '',
          identity_labels: (data.identity_labels ?? []).join(', '),
          interests: (data.interests ?? []).join(', '),
          website: data.website ?? '',
          visibility: (data.visibility as Visibility) ?? 'private',
          search_visible: data.search_visible ?? false,
          recommendable: data.recommendable ?? false,
          indexable: data.indexable ?? false,
        })
      })
    return () => { alive = false }
  }, [account.profileId])

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    if (!draft.display_name.trim()) {
      setError('A display name is required — it is what other people see.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (signedIn && account.profileId) {
        const { error: upsertError } = await supabase.from('social_profiles').upsert({
          id: account.profileId,
          display_name: draft.display_name.trim(),
          public_handle: draft.public_handle.trim() || null,
          pronouns: draft.pronouns.trim() || null,
          county: draft.county.trim() || null,
          bio: draft.bio.trim() || null,
          social_links: draft.links.split('\n').map((l) => l.trim()).filter(Boolean),
          avatar_url: draft.avatar_url.trim() || null,
          header_url: draft.header_url.trim() || null,
          identity_labels: draft.identity_labels.split(',').map((l) => l.trim()).filter(Boolean),
          interests: draft.interests.split(',').map((l) => l.trim()).filter(Boolean),
          website: draft.website.trim() || null,
          visibility: draft.visibility,
          search_visible: draft.search_visible,
          recommendable: draft.recommendable,
          indexable: draft.indexable,
          updated_at: new Date().toISOString(),
        })
        if (upsertError) {
          setError('Could not save your profile. Try again.')
          return
        }
      }
      back()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff', borderBottom: '1px solid #EFECE8',
                    display: 'flex', alignItems: 'center', gap: 10, padding: '56px 14px 12px' }}>
        <div className="tap" role="button" onClick={back}
             style={{ font: font(600, 14, 1.2), color: '#7C7871' }}>Cancel</div>
        <div style={{ flex: 1, textAlign: 'center', font: font(700, 16, 1.2), color: '#161615' }}>Edit social profile</div>
        <div className="tap" role="button" onClick={() => { if (!busy) void save() }}
             style={{ font: font(700, 14, 1.2), color: busy ? C.faint : accent }}>
          {busy ? 'Saving…' : 'Save'}
        </div>
      </div>

      <div style={{ padding: '20px 18px 32px' }}>
        {!signedIn && (
          <div style={{ borderRadius: 12, background: '#F7F5F1', border: '1px solid #EAE7E2', padding: '12px 14px',
                        font: font(400, 12, 1.5), color: '#7C7871', marginBottom: 18, textWrap: 'pretty' }}>
            You are not signed in, so nothing here will be saved to your account. Create an account first and this
            page becomes your social profile.
          </div>
        )}

        {/* Visibility — the most important control, shown first */}
        <div style={{ font: font(700, 13, 1.2), color: '#2A2A28', marginBottom: 10 }}>Profile visibility</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          {VISIBILITY_OPTIONS.map((opt, i) => {
            const on = draft.visibility === opt.value
            return (
              <div key={opt.value} className="tap" role="button"
                   onClick={() => set('visibility')(opt.value)}
                   style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 15px',
                            borderBottom: i === VISIBILITY_OPTIONS.length - 1 ? 'none' : `1px solid ${C.hairline}`,
                            background: on ? '#FAF9F7' : '#fff' }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, border: `2px solid ${on ? accent : C.border}`,
                              flex: 'none', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <div style={{ width: 12, height: 12, borderRadius: 999, background: accent }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(700, 14, 1.25), color: '#1A1A18' }}>{opt.label}</div>
                  <div style={{ font: font(400, 12, 1.45), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{opt.sub}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Discoverability toggles — only relevant when visible or discoverable */}
        {draft.visibility !== 'private' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ font: font(700, 13, 1.2), color: '#2A2A28', marginBottom: 10 }}>Discoverability</div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {[
                { key: 'search_visible' as const, label: 'Appear in search', sub: 'People can find you by name or handle.' },
                { key: 'recommendable' as const, label: 'Recommendations', sub: 'Allow us to suggest your profile to others.' },
                { key: 'indexable' as const, label: 'Search engine indexing', sub: 'Allow public-web search engines to index your profile.' },
              ].map((toggle, i) => (
                <div key={toggle.key}
                     style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px',
                              borderBottom: i === 2 ? 'none' : `1px solid ${C.hairline}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: font(600, 13.5, 1.3), color: '#1A1A18' }}>{toggle.label}</div>
                    <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{toggle.sub}</div>
                  </div>
                  <div className="tap" role="button"
                       onClick={() => set(toggle.key)(!draft[toggle.key])}
                       style={{ width: 46, height: 27, borderRadius: 999, flex: 'none', cursor: 'pointer',
                                background: draft[toggle.key] ? accent : C.border,
                                transition: 'background .15s', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 3, left: draft[toggle.key] ? 22 : 3,
                                  width: 21, height: 21, borderRadius: 999, background: '#fff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,.15)', transition: 'left .15s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Basic profile */}
        <div>
          <div style={labelStyle}>Profile photo — image URL</div>
          <input value={draft.avatar_url} placeholder="https://…/photo.jpg"
                 onChange={(e) => set('avatar_url')(e.target.value)} style={fieldStyle} />
          <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
            Paste a link to an image. Uploading from your phone comes later.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Background — image URL</div>
          <input value={draft.header_url} placeholder="https://…/header.jpg"
                 onChange={(e) => set('header_url')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Display name</div>
          <input value={draft.display_name} onChange={(e) => set('display_name')(e.target.value)}
                 style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Public handle — optional</div>
          <input value={draft.public_handle} placeholder="@alex"
                 onChange={(e) => set('public_handle')(e.target.value)} style={fieldStyle} />
          <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
            Separate from your login username. Changing this does not affect sign-in.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Pronouns</div>
          <input value={draft.pronouns} placeholder="they/them"
                 onChange={(e) => set('pronouns')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Area</div>
          <input value={draft.county} placeholder="Weber County"
                 onChange={(e) => set('county')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Bio</div>
          <textarea value={draft.bio} rows={4} onChange={(e) => set('bio')(e.target.value)}
                    style={{ ...fieldStyle, font: font(400, 14, 1.55), resize: 'none' }} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Identity labels — comma separated</div>
          <input value={draft.identity_labels} placeholder="queer, trans, nonbinary"
                 onChange={(e) => set('identity_labels')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Interests — comma separated</div>
          <input value={draft.interests} placeholder="hiking, drag, book club"
                 onChange={(e) => set('interests')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Website</div>
          <input value={draft.website} placeholder="yoursite.com"
                 onChange={(e) => set('website')(e.target.value)} style={fieldStyle} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Social links — one per line</div>
          <textarea value={draft.links} rows={3} placeholder={'instagram.com/you\ntiktok.com/@you'}
                    onChange={(e) => set('links')(e.target.value)}
                    style={{ ...fieldStyle, font: font(400, 14, 1.55), resize: 'none' }} />
        </div>

        {error && (
          <div style={{ marginTop: 16, borderRadius: 12, background: C.dangerBg, border: '1px solid #F0E0E0',
                        padding: '12px 14px', font: font(500, 12.5, 1.5), color: C.danger, textWrap: 'pretty' }}>
            {error}
          </div>
        )}

        <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 16, textWrap: 'pretty' }}>
          Your social profile is separate from your account. Hiding or deleting it does not
          affect your ability to sign in or participate.
        </div>
      </div>
    </div>
  )
}
