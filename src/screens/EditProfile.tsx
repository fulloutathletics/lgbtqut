import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrail } from '../lib/trail'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import {
  BACKGROUNDS, COUNTY_OPTIONS, IDENTITY_OPTIONS, INTEREST_OPTIONS, PRONOUN_OPTIONS,
  headerStyle, isAdultLink, isPlausibleLink, linkMeta, normalizeLink, uploadProfileImage,
} from '../lib/profile'
import type { ProfileVisibility } from '../lib/types'
import { AgePill, Toggle, font } from '../components/ui'
import { Camera } from '../components/icons'
import { Avatar } from '../components/Post'

// EditProfile — route `/profile/edit`.
//
// Everything on the public profile, editable in place with a live preview at
// the top. Pictures upload straight to the person's own folder in
// profile-media; the database refuses any other origin. Links are added one
// at a time so each can be checked as it goes in: a link to an adult
// platform tags the whole profile 18+, and the editor says so before Save.

interface Draft {
  display_name: string
  public_handle: string
  pronouns: string
  county: string
  bio: string
  links: string[]
  avatar_url: string | null
  header_url: string | null
  identity_labels: string[]
  interests: string[]
  website: string
  adult_content: boolean
  visibility: ProfileVisibility
  search_visible: boolean
  recommendable: boolean
  indexable: boolean
}

const EMPTY_DRAFT: Draft = {
  display_name: '', public_handle: '', pronouns: '', county: '', bio: '',
  links: [], avatar_url: null, header_url: null, identity_labels: [], interests: [],
  website: '', adult_content: false,
  visibility: 'visible', search_visible: true, recommendable: true, indexable: false,
}

const MAX_BIO = 240
const MAX_LINKS = 8
const MAX_CHIPS = 8

const VISIBILITY_OPTIONS: Array<{ value: ProfileVisibility; label: string; sub: string }> = [
  { value: 'discoverable', label: 'Discoverable', sub: 'Your profile can appear in search, communities, and recommendations.' },
  { value: 'visible', label: 'Visible', sub: 'People you interact with can view your profile, but it is not searchable.' },
  { value: 'private', label: 'Private', sub: 'Your profile is hidden. People cannot find you or see your posts on it.' },
]

// ------------------------------------------------------------- small pieces

const labelStyle = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase' as const, color: '#9A968F',
}

const fieldStyle = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3), color: '#1A1A18',
  background: '#fff', boxSizing: 'border-box' as const,
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ font: font(800, 16, 1.2), color: C.ink, letterSpacing: '-.01em' }}>{title}</div>
      {sub && <div style={{ font: font(400, 12, 1.5), color: C.muted, marginTop: 4, textWrap: 'pretty' }}>{sub}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>{children}</div>
}

function Field({ label, value, onChange, placeholder, hint, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; maxLength?: number
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={labelStyle}>{label}</div>
      <input value={value} placeholder={placeholder} maxLength={maxLength}
             onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

/**
 * A row of tappable chips with an optional "add your own" at the end. The
 * value is a list of strings; presets and custom entries mix freely.
 */
function ChipPicker({ options, value, onChange, max, single = false, custom = true, placeholder = 'Add your own' }: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  /** Only one may be on at a time (pronouns). */
  single?: boolean
  custom?: boolean
  placeholder?: string
}) {
  const { accent, tint } = useStore()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  const has = (o: string) => value.some((v) => v.toLowerCase() === o.toLowerCase())
  const toggle = (o: string) => {
    if (has(o)) onChange(value.filter((v) => v.toLowerCase() !== o.toLowerCase()))
    else if (single) onChange([o])
    else if (!max || value.length < max) onChange([...value, o])
  }
  const commit = () => {
    const t = text.trim().slice(0, 28)
    if (t && !has(t)) toggle(t)
    setText('')
    setAdding(false)
  }

  const extras = value.filter((v) => !options.some((o) => o.toLowerCase() === v.toLowerCase()))
  const all = [...options, ...extras]
  const full = !single && !!max && value.length >= max

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {all.map((o) => {
        const on = has(o)
        return (
          <div key={o} className="tap" role="button" aria-pressed={on} onClick={() => toggle(o)}
               style={{ borderRadius: 999, padding: '7px 13px',
                        border: `1.5px solid ${on ? accent : C.border}`, background: on ? tint : '#fff',
                        font: font(on ? 700 : 600, 12, 1.2), color: on ? accent : C.body,
                        opacity: !on && full ? 0.45 : 1 }}>
            {o}
          </div>
        )
      })}
      {custom && (adding ? (
        <input autoFocus value={text} placeholder={placeholder} maxLength={28}
               onChange={(e) => setText(e.target.value)}
               onBlur={commit}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
               style={{ borderRadius: 999, padding: '7px 13px', border: `1.5px solid ${accent}`, outline: 'none',
                        font: font(600, 12, 1.2), color: C.ink, width: 150 }} />
      ) : (
        <div className="tap" role="button" onClick={() => { if (!full) setAdding(true) }}
             style={{ borderRadius: 999, padding: '7px 13px', border: `1.5px dashed ${C.border}`,
                      font: font(600, 12, 1.2), color: full ? C.faint : C.muted }}>
          + {placeholder}
        </div>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- the screen

export default function EditProfile() {
  const nav = useNavigate()
  const { back } = useTrail()
  const { accent, tint, account, signedIn, refreshAccount } = useStore()
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, display_name: account.displayName ?? '' })
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'header' | null>(null)
  const [error, setError] = useState('')
  const [linkText, setLinkText] = useState('')
  const [linkError, setLinkError] = useState('')
  const avatarInput = useRef<HTMLInputElement>(null)
  const headerInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = account.profileId
    if (!id) return
    let alive = true
    void supabase.from('social_profiles').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setExisting(true)
        setDraft({
          display_name: data.display_name ?? '',
          public_handle: data.public_handle ?? '',
          pronouns: data.pronouns ?? '',
          county: data.county ?? '',
          bio: data.bio ?? '',
          links: data.social_links ?? [],
          avatar_url: data.avatar_url ?? null,
          header_url: data.header_url ?? null,
          identity_labels: data.identity_labels ?? [],
          interests: data.interests ?? [],
          website: data.website ?? '',
          adult_content: data.adult_content ?? false,
          visibility: (data.visibility as ProfileVisibility) ?? 'visible',
          search_visible: data.search_visible ?? false,
          recommendable: data.recommendable ?? false,
          indexable: data.indexable ?? false,
        })
      })
    return () => { alive = false }
  }, [account.profileId])

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // What the database will decide on save, worked out here so the person
  // sees it before they commit.
  const spicyLinks = [...draft.links, draft.website].filter((l) => l && isAdultLink(l))
  const willBeRated = draft.adult_content || spicyLinks.length > 0
  const ratingReason = draft.adult_content ? 'you marked it as adult'
    : spicyLinks.length ? `of ${linkMeta(spicyLinks[0]).label}` : ''

  const pick = async (slot: 'avatar' | 'header', file: File) => {
    if (!signedIn || !account.profileId) { setError('Sign in to upload pictures.'); return }
    setUploading(slot)
    setError('')
    try {
      const url = await uploadProfileImage(account.profileId, slot, file)
      set(slot === 'avatar' ? 'avatar_url' : 'header_url')(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  const addLink = () => {
    const clean = normalizeLink(linkText)
    if (!clean) return
    if (!isPlausibleLink(clean)) { setLinkError('That does not look like a link. Try something like instagram.com/you.'); return }
    if (draft.links.some((l) => l.toLowerCase() === clean.toLowerCase())) { setLinkError('Already on the list.'); return }
    if (draft.links.length >= MAX_LINKS) { setLinkError(`Up to ${MAX_LINKS} links.`); return }
    set('links')([...draft.links, clean])
    setLinkText('')
    setLinkError('')
  }

  const removeLink = (l: string) => set('links')(draft.links.filter((x) => x !== l))

  const save = async () => {
    const name = draft.display_name.trim()
    if (!name) { setError('A display name is required — it is what other people see.'); return }
    const handle = draft.public_handle.trim().replace(/^@/, '')
    if (handle && !/^[a-z0-9_.]{2,30}$/i.test(handle)) {
      setError('Handles are 2–30 letters, numbers, dots or underscores.')
      return
    }
    if (!signedIn || !account.profileId) { setError('Sign in to save a profile.'); return }
    setBusy(true)
    setError('')
    try {
      const { error: upsertError } = await supabase.from('social_profiles').upsert({
        id: account.profileId,
        display_name: name,
        public_handle: handle || null,
        pronouns: draft.pronouns.trim() || null,
        county: draft.county.trim() || null,
        bio: draft.bio.trim().slice(0, MAX_BIO) || null,
        social_links: draft.links,
        avatar_url: draft.avatar_url,
        header_url: draft.header_url,
        identity_labels: draft.identity_labels,
        interests: draft.interests,
        website: normalizeLink(draft.website) || null,
        adult_content: draft.adult_content,
        visibility: draft.visibility,
        search_visible: draft.visibility === 'discoverable' && draft.search_visible,
        recommendable: draft.visibility === 'discoverable' && draft.recommendable,
        indexable: draft.visibility === 'discoverable' && draft.indexable,
        updated_at: new Date().toISOString(),
      })
      if (upsertError) {
        setError(upsertError.code === '23505'
          ? 'That handle is taken. Pick another.'
          : 'Could not save your profile. Try again.')
        return
      }
      await refreshAccount()
      nav(`/u/${encodeURIComponent(handle || name)}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const previewColor = accent
  const header = headerStyle(draft.header_url, previewColor)
  const previewName = draft.display_name.trim() || 'Your name'

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(255,255,255,.94)',
                    backdropFilter: 'blur(12px)', borderBottom: '1px solid #EFECE8',
                    display: 'flex', alignItems: 'center', gap: 10, padding: '56px 14px 12px' }}>
        <div className="tap" role="button" onClick={back}
             style={{ font: font(600, 14, 1.2), color: '#7C7871' }}>Cancel</div>
        <div style={{ flex: 1, textAlign: 'center', font: font(700, 16, 1.2), color: '#161615' }}>
          {existing ? 'Edit profile' : 'Create profile'}
        </div>
        <div className="tap" role="button" onClick={() => { if (!busy && !uploading) void save() }}
             style={{ font: font(700, 14, 1.2), color: busy || uploading ? C.faint : accent }}>
          {busy ? 'Saving…' : 'Save'}
        </div>
      </div>

      {/* ------------------------------------------------ live preview */}
      <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick('avatar', f) }} />
      <input ref={headerInput} type="file" accept="image/*" style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick('header', f) }} />

      <div style={{ position: 'relative', height: 140, background: header.background, overflow: 'hidden' }}>
        {header.image && (
          <img src={header.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <button type="button" aria-label="Change background" disabled={!!uploading}
                onClick={() => headerInput.current?.click()}
                style={{ position: 'absolute', top: 12, right: 12, border: 0, borderRadius: 999, padding: '7px 12px',
                         background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
                         font: font(600, 11.5, 1.2), cursor: 'pointer' }}>
          <Camera size={13} /> {uploading === 'header' ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>
      <div style={{ padding: '0 18px', marginTop: -44, textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={{ borderRadius: 999, border: '4px solid #fff', boxShadow: '0 4px 16px rgba(0,0,0,.18)', background: '#fff' }}>
            <Avatar src={draft.avatar_url} name={previewName} size={88} color={previewColor} />
          </div>
          <button type="button" aria-label="Change photo" disabled={!!uploading}
                  onClick={() => avatarInput.current?.click()}
                  style={{ position: 'absolute', bottom: 2, right: 2, width: 32, height: 32, border: '2px solid #fff',
                           borderRadius: 999, background: accent, color: '#fff', display: 'flex', alignItems: 'center',
                           justifyContent: 'center', cursor: 'pointer' }}>
            {uploading === 'avatar' ? '…' : <Camera size={14} />}
          </button>
        </div>
        <div style={{ font: font(800, 20, 1.2), color: C.ink, letterSpacing: '-.02em', marginTop: 8 }}>{previewName}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
          {draft.pronouns && (
            <span style={{ borderRadius: 999, padding: '3px 10px', background: tint, font: font(600, 11, 1.3), color: accent }}>
              {draft.pronouns}
            </span>
          )}
          {willBeRated && <AgePill label="18+" />}
        </div>
      </div>

      <div style={{ padding: '4px 18px 40px' }}>
        {!signedIn && (
          <div style={{ borderRadius: 12, background: '#F7F5F1', border: '1px solid #EAE7E2', padding: '12px 14px',
                        font: font(400, 12, 1.5), color: '#7C7871', marginTop: 18, textWrap: 'pretty' }}>
            You are not signed in, so nothing here can be saved. Create an account first and this page becomes
            your profile.
          </div>
        )}

        {/* ---------------------------------------------- background */}
        <Section title="Background" sub="Pick a built-in background, or upload a photo of your own from the button above.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            <div className="tap" role="button" aria-pressed={!draft.header_url} onClick={() => set('header_url')(null)}
                 style={{ aspectRatio: '1', borderRadius: 10, background: previewColor,
                          boxShadow: !draft.header_url ? `0 0 0 2px #fff, 0 0 0 4px ${accent}` : 'inset 0 0 0 1px rgba(0,0,0,.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          font: font(700, 9.5, 1.2), color: '#fff' }}>
              Theme
            </div>
            {BACKGROUNDS.map((b) => {
              const token = `preset:${b.id}`
              const on = draft.header_url === token
              return (
                <div key={b.id} className="tap" role="button" aria-pressed={on} title={b.label}
                     onClick={() => set('header_url')(token)}
                     style={{ aspectRatio: '1', borderRadius: 10, background: b.css,
                              boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${accent}` : 'inset 0 0 0 1px rgba(0,0,0,.06)' }} />
              )
            })}
            {draft.header_url && !draft.header_url.startsWith('preset:') && (
              <div className="tap" role="button" aria-pressed
                   style={{ aspectRatio: '1', borderRadius: 10, backgroundImage: `url(${draft.header_url})`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${accent}` }} />
            )}
          </div>
          <Hint>
            Uploads are resized, stripped of location data and stored under your account. Keep it something
            you would put on a poster in a community center.
          </Hint>
        </Section>

        {/* --------------------------------------------------- basics */}
        <Section title="About you">
          <Field label="Display name" value={draft.display_name} onChange={set('display_name')} maxLength={40} />
          <Field label="Handle — optional" value={draft.public_handle} onChange={set('public_handle')}
                 placeholder="alex" maxLength={30}
                 hint="Your profile's address: lgbtq.ut/u/alex. Separate from your login username." />
          <div style={{ marginTop: 16 }}>
            <div style={labelStyle}>Pronouns</div>
            <div style={{ marginTop: 8 }}>
              <ChipPicker options={PRONOUN_OPTIONS} value={draft.pronouns ? [draft.pronouns] : []}
                          onChange={(v) => set('pronouns')(v[0] ?? '')} single placeholder="Something else" />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={labelStyle}>Area</div>
            <select value={COUNTY_OPTIONS.includes(draft.county) ? draft.county : draft.county ? '__custom' : ''}
                    onChange={(e) => { if (e.target.value !== '__custom') set('county')(e.target.value) }}
                    style={{ ...fieldStyle, appearance: 'none' as const }}>
              <option value="">Prefer not to say</option>
              {COUNTY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              {draft.county && !COUNTY_OPTIONS.includes(draft.county) && (
                <option value="__custom">{draft.county}</option>
              )}
            </select>
            <Hint>A county, never an address.</Hint>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={labelStyle}>Bio</div>
              <div style={{ font: font(400, 11, 1.2), color: draft.bio.length > MAX_BIO ? C.danger : C.faint }}>
                {draft.bio.length}/{MAX_BIO}
              </div>
            </div>
            <textarea value={draft.bio} rows={4} maxLength={MAX_BIO} placeholder="What should people know?"
                      onChange={(e) => set('bio')(e.target.value)}
                      style={{ ...fieldStyle, font: font(400, 14, 1.55), resize: 'none' }} />
          </div>
        </Section>

        {/* ----------------------------------------------- identity */}
        <Section title="Identity" sub="Optional, and yours to phrase. Shown as tags under your bio.">
          <ChipPicker options={IDENTITY_OPTIONS} value={draft.identity_labels} onChange={set('identity_labels')}
                      max={MAX_CHIPS} placeholder="In your words" />
        </Section>

        {/* ---------------------------------------------- interests */}
        <Section title="Interests" sub={`Up to ${MAX_CHIPS}. They help people find their people.`}>
          <ChipPicker options={INTEREST_OPTIONS} value={draft.interests} onChange={set('interests')}
                      max={MAX_CHIPS} />
        </Section>

        {/* -------------------------------------------------- links */}
        <Section title="Links" sub="Where else to find you. Linking to an adult-only platform tags your whole profile 18+.">
          <Field label="Website — optional" value={draft.website} onChange={set('website')} placeholder="yoursite.com" />
          <div style={{ marginTop: 16 }}>
            <div style={labelStyle}>Social links</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
              <input value={linkText} placeholder="instagram.com/you"
                     onChange={(e) => { setLinkText(e.target.value); setLinkError('') }}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                     style={{ ...fieldStyle, marginTop: 0, flex: 1, minWidth: 0 }} />
              <div className="tap" role="button" onClick={addLink}
                   style={{ flex: 'none', borderRadius: 11, padding: '0 16px', display: 'flex', alignItems: 'center',
                            background: linkText.trim() ? accent : C.border,
                            font: font(700, 13, 1.2), color: linkText.trim() ? '#fff' : C.faint }}>
                Add
              </div>
            </div>
            {linkError && <div style={{ font: font(500, 12, 1.4), color: C.danger, marginTop: 6 }}>{linkError}</div>}
          </div>
          {draft.links.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {draft.links.map((l, i) => {
                const m = linkMeta(l)
                return (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                        borderBottom: i === draft.links.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: m.color, flex: 'none',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  font: font(800, 12, 1), color: '#fff' }}>
                      {m.label[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ font: font(700, 13, 1.25), color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap' }}>{m.label}</div>
                        {m.adult && <AgePill label="18+" />}
                      </div>
                      <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 1, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
                    </div>
                    <div className="tap" role="button" aria-label={`Remove ${l}`} onClick={() => removeLink(l)}
                         style={{ flex: 'none', font: font(600, 12, 1.2), color: C.danger, padding: '4px 6px' }}>
                      Remove
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ---------------------------------------------------- adult */}
        <Section title="Adult content">
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>My profile is for adults</div>
                <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>
                  Tags it 18+. Only signed-in adults can open it or see your posts.
                </div>
              </div>
              <Toggle on={draft.adult_content} onChange={() => set('adult_content')(!draft.adult_content)} />
            </div>
          </div>
          {willBeRated && (
            <div style={{ marginTop: 10, borderRadius: 12, background: C.agePillBg, padding: '11px 14px',
                          display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AgePill label="18+" />
              <div style={{ font: font(400, 12, 1.5), color: C.agePill, textWrap: 'pretty' }}>
                This profile will be tagged 18+ because {ratingReason}. Anyone under 18, and adults who turned
                adult content off, will not see it or your posts anywhere in the app.
                {spicyLinks.length > 0 && !draft.adult_content && ' Remove the link to lift the tag.'}
              </div>
            </div>
          )}
        </Section>

        {/* ----------------------------------------------- visibility */}
        <Section title="Who can find you">
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
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

          {draft.visibility === 'discoverable' && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginTop: 10 }}>
              {[
                { key: 'search_visible' as const, label: 'Appear in search', sub: 'People can find you by name or handle.' },
                { key: 'recommendable' as const, label: 'Recommendations', sub: 'Allow us to suggest your profile to others.' },
                { key: 'indexable' as const, label: 'Search engine indexing', sub: 'Allow public-web search engines to index your profile.' },
              ].map((t, i) => (
                <div key={t.key}
                     style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px',
                              borderBottom: i === 2 ? 'none' : `1px solid ${C.hairline}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: font(600, 13.5, 1.3), color: '#1A1A18' }}>{t.label}</div>
                    <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{t.sub}</div>
                  </div>
                  <Toggle on={draft[t.key]} onChange={() => set(t.key)(!draft[t.key])} />
                </div>
              ))}
            </div>
          )}
        </Section>

        {error && (
          <div style={{ marginTop: 20, borderRadius: 12, background: C.dangerBg, border: '1px solid #F0E0E0',
                        padding: '12px 14px', font: font(500, 12.5, 1.5), color: C.danger, textWrap: 'pretty' }}>
            {error}
          </div>
        )}

        <div className="tap" role="button" onClick={() => { if (!busy && !uploading) void save() }}
             style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                      background: busy || uploading ? C.border : accent,
                      font: font(700, 14.5, 1.2), color: busy || uploading ? C.faint : '#fff' }}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create profile'}
        </div>

        <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 16, textWrap: 'pretty', textAlign: 'center' }}>
          Your profile is separate from your account. Hiding or deleting it does not affect your ability to
          sign in or take part.
        </div>
      </div>
    </div>
  )
}
