import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTrail } from '../lib/trail'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { entityRef } from '../lib/data'
import { PAGE_KIND } from '../lib/pages'
import { headerStyle, linkHref, linkMeta, normalizeLink } from '../lib/profile'
import type { EntityKind, EntityRef, SocialProfile } from '../lib/types'
import { EntityCard } from '../components/EntityCard'
import { AgeGate } from '../components/AgeGate'
import { AgePill, Img, font } from '../components/ui'
import { Back, Share } from '../components/icons'
import { Avatar, CommentSheet, POST_FIELDS, PostCard, hydratePosts, personColor } from '../components/Post'
import type { Post, RawPost } from '../components/Post'

// UserProfile — route `/u/:name`.
//
// A person's public face: their picture and background, who they are, what
// they are into, where else to find them, the pages they run, and everything
// they have posted. `:name` is a handle first (unique, the address to share)
// and a display name second.
//
// A profile the database withholds — private, or rated 18+ and the viewer is
// not an adult — arrives here as no row at all, and reads as "not available"
// with no reason given. That silence is deliberate: a minor is never told
// something was filtered. An adult who opted out of adult content gets the
// explanatory AgeGate instead, because they chose the setting.

interface Counts {
  followers: number
  following: number
}

// ------------------------------------------------------------- small pieces

const OutIcon = ({ color = '#A5A19B' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M8 16L16 8M9 8h7v7" />
  </svg>
)

/** The ··· menu: the quiet controls a timeline keeps out of the way. */
function MoreMenu({ items }: { items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <div className="tap" role="button" aria-label="More" aria-expanded={open} onClick={() => setOpen((o) => !o)}
           style={{ width: 38, height: 38, borderRadius: 999, border: `1.5px solid ${C.border}`, background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={C.body}>
          <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
        </svg>
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div role="menu"
               style={{ position: 'absolute', right: 0, top: 44, zIndex: 31, minWidth: 200, background: '#fff',
                        whiteSpace: 'nowrap',
                        borderRadius: 14, boxShadow: '0 10px 32px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.04)',
                        overflow: 'hidden', textAlign: 'left' }}>
            {items.map((it, i) => (
              <div key={it.label} role="menuitem" className="tap"
                   onClick={() => { setOpen(false); it.onClick() }}
                   style={{ padding: '13px 16px', font: font(600, 14, 1.2), color: it.danger ? C.danger : C.ink,
                            borderTop: i ? `1px solid ${C.hairline}` : 'none' }}>
                {it.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </svg>
)

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ font: font(700, 11, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                  color: '#9A968F' }}>{children}</div>
  )
}

function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' }) {
  const { accent, tint } = useStore()
  return (
    <div style={{ borderRadius: 999, padding: '6px 13px',
                  background: tone === 'accent' ? tint : '#F4F2EE',
                  font: font(600, 11.5, 1.3), color: tone === 'accent' ? accent : '#5C5851' }}>
      {children}
    </div>
  )
}

/** Circular glass button for the header. */
function HeaderButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <div className="tap" role="button" onClick={onClick} aria-label={label}
         style={{ width: 34, height: 34, borderRadius: 999, background: 'rgba(255,255,255,.78)',
                  backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 3, flex: 'none' }}>
      {children}
    </div>
  )
}

function Unavailable({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <div style={{ position: 'relative', height: 132, background: C.fill }}>
        <div style={{ position: 'absolute', top: 58, left: 14 }}>
          <HeaderButton onClick={onBack} label="Back"><Back /></HeaderButton>
        </div>
      </div>
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ font: font(800, 21, 1.25), color: C.ink, letterSpacing: '-.01em' }}>Not available</div>
        <div style={{ font: font(400, 14.5, 1.55), color: C.muted, marginTop: 9, textWrap: 'pretty' }}>
          There is no profile at this address, or it is not available on your account.
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- the screen

export default function UserProfile() {
  const nav = useNavigate()
  const { back } = useTrail()
  const params = useParams<{ name: string }>()
  const data = useData()
  const {
    accent, account, signedIn, canSee,
    isBlocked, isMuted, isFollowing, toggleFollow, block, unblock, mute, unmute,
  } = useStore()

  const [profile, setProfile] = useState<SocialProfile | null | undefined>(undefined)
  const [represents, setRepresents] = useState<Array<{ kind: EntityKind; id: string }>>([])
  const [counts, setCounts] = useState<Counts>({ followers: 0, following: 0 })
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [activePost, setActivePost] = useState<Post | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'posts' | 'about'>('posts')

  const param = params.name ?? ''

  // Handle first, then display name. Handles are unique; names are not.
  useEffect(() => {
    if (!param) { setProfile(null); return }
    let alive = true
    const handle = param.replace(/^@/, '')
    void (async () => {
      const byHandle = await supabase.from('social_profiles').select('*').eq('public_handle', handle).maybeSingle()
      const row = byHandle.data
        ?? (await supabase.from('social_profiles').select('*').eq('display_name', param).limit(1).maybeSingle()).data
      if (!alive) return
      if (!row) { setProfile(null); return }
      setProfile(row as SocialProfile)
      const [admin, followers, following] = await Promise.all([
        supabase.from('entity_admins').select('entity_kind, entity_id').eq('profile_id', row.id),
        supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('followee_id', row.id),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('follower_id', row.id),
      ])
      if (!alive) return
      setRepresents((admin.data ?? []).map((a) => ({ kind: a.entity_kind as EntityKind, id: a.entity_id })))
      setCounts({ followers: followers.count ?? 0, following: following.count ?? 0 })
    })()
    return () => { alive = false }
  }, [param])

  const profileId = profile?.id ?? null

  const loadPosts = useCallback(async () => {
    if (!profileId) return
    setPostsLoading(true)
    // Everything they wrote in their own voice; what they post as a page
    // belongs on that page, not here.
    const { data: rows } = await supabase.from('posts').select(POST_FIELDS)
      .eq('author_id', profileId).is('author_kind', null)
      .order('created_at', { ascending: false }).limit(50)
    setPosts(await hydratePosts((rows ?? []) as RawPost[], data, account.profileId))
    setPostsLoading(false)
  }, [profileId, data, account.profileId])

  useEffect(() => { void loadPosts() }, [loadPosts])

  if (!data || profile === undefined) return <div style={{ minHeight: '60vh' }} />
  if (profile === null) return <Unavailable onBack={back} />

  const self = !!account.profileId && profile.id === account.profileId
  const name = profile.display_name
  const handle = profile.public_handle?.replace(/^@/, '') ?? null
  const blocked = isBlocked(name)
  const muted = isMuted(name)
  const following = isFollowing(profile.id)

  // An adult who turned adult content off gets told why. Everyone else who
  // cannot see it never reached this point — the row was withheld.
  if (!self && !canSee(profile.age_rating)) return <AgeGate reason={profile.age_reason} />

  const color = self ? accent : personColor(profile.id)
  const header = headerStyle(profile.header_url, color)
  const links = blocked ? [] : profile.social_links
  const website = blocked ? null : profile.website
  const pages = represents.map((r) => entityRef(data, r.kind, r.id)).filter((p): p is EntityRef => !!p)
  const hasAbout = profile.identity_labels.length > 0 || profile.interests.length > 0
    || links.length > 0 || !!website || pages.length > 0

  const share = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(handle ?? name)}`
    try {
      if (navigator.share) { await navigator.share({ title: name, url }); return }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* dismissed */ }
  }

  const report = () => {
    window.location.href = `mailto:hello@lgbtq.ut?subject=${encodeURIComponent(`Report a profile: ${name}`)}`
  }

  const count = (n: number, label: string) => (
    <span style={{ font: font(400, 13.5, 1.3), color: C.muted }}>
      <b style={{ font: font(800, 13.5, 1.3), color: C.ink }}>{n}</b> {label}
    </span>
  )

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      {/* ------------------------------------------------------ banner */}
      <div style={{ position: 'relative', height: 150, background: header.background, overflow: 'hidden' }}>
        {header.image && (
          <Img src={header.image} priority
               style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0,
                      background: 'linear-gradient(180deg,rgba(0,0,0,.22) 0%,rgba(0,0,0,0) 50%)' }} />
        <div style={{ position: 'absolute', top: 54, left: 14, right: 14, display: 'flex', gap: 8 }}>
          <HeaderButton onClick={back} label="Back"><Back /></HeaderButton>
          <div style={{ flex: 1 }} />
          {!blocked && <HeaderButton onClick={() => { void share() }} label="Share profile"><Share size={16} /></HeaderButton>}
        </div>
        {copied && (
          <div style={{ position: 'absolute', top: 96, left: 0, right: 0, textAlign: 'center' }}>
            <span style={{ borderRadius: 999, padding: '5px 12px', background: 'rgba(0,0,0,.6)',
                           font: font(600, 11.5, 1.3), color: '#fff' }}>Link copied</span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------- identity block */}
      <div style={{ padding: '0 16px 4px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10,
                      marginTop: -40 }}>
          <div style={{ borderRadius: 999, border: '4px solid #fff', background: '#fff', flex: 'none' }}>
            <Avatar src={blocked ? null : profile.avatar_url} name={name} size={84} color={color} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 2 }}>
            {!self && !blocked && (
              <MoreMenu items={[
                { label: muted ? `Unmute ${name}` : `Mute ${name}`, onClick: () => (muted ? unmute(name) : mute(name)) },
                { label: `Block ${name}`, onClick: () => block(name), danger: true },
                { label: 'Report profile', onClick: report, danger: true },
              ]} />
            )}
            {self ? (
              <div className="tap" role="button" onClick={() => nav('/profile/edit')}
                   style={{ borderRadius: 999, padding: '9px 18px', border: `1.5px solid ${C.border}`,
                            font: font(700, 13.5, 1.2), color: C.ink, background: '#fff' }}>
                Edit profile
              </div>
            ) : !blocked && (
              // Open to guests too: toggleFollow is device-local until there
              // is an account to sync it to, and following is what fills an
              // anonymous reader's feed.
              <div className="tap" role="button" aria-pressed={following} onClick={() => toggleFollow(profile.id)}
                   style={{ borderRadius: 999, padding: '9px 20px',
                            background: following ? '#fff' : C.ink,
                            border: `1.5px solid ${following ? C.border : C.ink}`,
                            font: font(700, 13.5, 1.2), color: following ? C.ink : '#fff' }}>
                {following ? 'Following' : 'Follow'}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ font: font(800, 21, 1.2), color: C.ink, letterSpacing: '-.02em', textWrap: 'pretty' }}>
            {name}
          </div>
          {!blocked && profile.age_rating && <AgePill label={profile.age_rating} />}
        </div>
        <div style={{ font: font(400, 13.5, 1.35), color: C.muted, marginTop: 1 }}>
          {[handle && `@${handle}`, !blocked && profile.pronouns].filter(Boolean).join(' · ')}
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
                 style={{ marginTop: 14, marginBottom: 24, borderRadius: 999, padding: 12, textAlign: 'center',
                          background: C.ink, font: font(700, 14, 1.2), color: '#fff' }}>
              Unblock
            </div>
          </>
        ) : (
          <>
            {profile.bio ? (
              <div style={{ font: font(400, 14.5, 1.5), color: C.ink, marginTop: 10, textWrap: 'pretty',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {profile.bio}
              </div>
            ) : self && (
              <div className="tap" onClick={() => nav('/profile/edit')}
                   style={{ font: font(400, 14, 1.5), color: C.faint, marginTop: 10 }}>
                Add a bio so people know who you are.
              </div>
            )}

            {(profile.county || website) && (
              <div style={{ display: 'flex', gap: '6px 16px', marginTop: 10, flexWrap: 'wrap' }}>
                {profile.county && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                                 font: font(400, 13, 1.3), color: C.muted }}>
                    <PinIcon />{profile.county}
                  </span>
                )}
                {website && (
                  <a href={linkHref(website)} target="_blank" rel="noreferrer noopener"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none',
                              font: font(500, 13, 1.3), color: accent, maxWidth: '100%', minWidth: 0 }}>
                    <LinkIcon />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {normalizeLink(website)}
                    </span>
                  </a>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {count(counts.following, 'Following')}
              {count(counts.followers, counts.followers === 1 ? 'Follower' : 'Followers')}
            </div>

            {self && profile.age_rating && (
              <div style={{ marginTop: 12, borderRadius: 12, background: C.agePillBg, padding: '11px 14px',
                            font: font(400, 12, 1.5), color: C.agePill, textWrap: 'pretty' }}>
                Your profile is tagged 18+ ({(profile.age_reason ?? 'adult content').toLowerCase()}), so only
                adults can see it and your posts. Remove adult links or the adult setting to lift it.
              </div>
            )}
            {muted && (
              <div style={{ marginTop: 12, borderRadius: 12, background: '#F7F5F1', border: '1px solid #EAE7E2',
                            padding: '11px 14px', font: font(400, 12, 1.45), color: '#7C7871', textWrap: 'pretty' }}>
                Muted. Their comments are collapsed behind a tap and their reviews are hidden. They can still see you.
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------- tabs */}
      {!blocked && (
        <>
          <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${C.hairline}`, marginTop: 8,
                                       position: 'sticky', top: 0, zIndex: 10, background: 'rgba(255,255,255,.96)',
                                       backdropFilter: 'blur(10px)' }}>
            {(['posts', 'about'] as const).map((t) => {
              const on = tab === t
              return (
                <div key={t} role="tab" aria-selected={on} className="tap" onClick={() => setTab(t)}
                     style={{ flex: 1, textAlign: 'center', padding: '13px 0 0',
                              font: font(on ? 700 : 600, 14, 1.2), color: on ? C.ink : C.muted }}>
                  {t === 'posts' ? `Posts${posts.length ? ` ${posts.length}` : ''}` : 'About'}
                  <div style={{ height: 3, width: 44, borderRadius: 3, margin: '11px auto 0',
                                background: on ? accent : 'transparent' }} />
                </div>
              )
            })}
          </div>

          {tab === 'posts' ? (
            postsLoading ? (
              <div style={{ padding: 24, textAlign: 'center', font: font(400, 13, 1.4), color: C.muted }}>Loading…</div>
            ) : posts.length === 0 ? (
              <div style={{ padding: '34px 28px 40px', textAlign: 'center' }}>
                <div style={{ font: font(800, 17, 1.3), color: C.ink, letterSpacing: '-.01em' }}>
                  {self ? 'You have not posted yet' : `${name} has not posted yet`}
                </div>
                <div style={{ font: font(400, 13, 1.5), color: C.muted, marginTop: 6, textWrap: 'pretty' }}>
                  {self ? 'Share something with the community from the Feed tab.' : 'Follow them to see it first when they do.'}
                </div>
                {self && (
                  <div className="tap" role="button" onClick={() => nav('/feed')}
                       style={{ display: 'inline-block', marginTop: 16, borderRadius: 999, padding: '9px 20px',
                                background: C.ink, font: font(700, 13.5, 1.2), color: '#fff' }}>
                    Write a post
                  </div>
                )}
              </div>
            ) : muted ? (
              <div style={{ padding: '22px 24px 30px', textAlign: 'center', font: font(400, 12.5, 1.5), color: C.muted,
                            textWrap: 'pretty' }}>
                You muted {name}, so their posts are collapsed. Unmute from the ··· menu to read them.
              </div>
            ) : (
              posts.map((p) => (
                <PostCard key={p.id} post={p} showAuthor={false} onComment={setActivePost}
                          onChange={(next) => setPosts((ps) => ps.map((x) => (x.id === next.id ? next : x)))} />
              ))
            )
          ) : (
            <div style={{ padding: '18px 16px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
              {!hasAbout && (
                <div style={{ padding: '16px 12px', textAlign: 'center', font: font(400, 13, 1.5), color: C.muted }}>
                  {self ? 'Add identities, interests and links from Edit profile.' : 'Nothing more to show yet.'}
                </div>
              )}

              {profile.identity_labels.length > 0 && (
                <div>
                  <Eyebrow>Identity</Eyebrow>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                    {profile.identity_labels.map((l) => <Chip key={l} tone="accent">{l}</Chip>)}
                  </div>
                </div>
              )}

              {profile.interests.length > 0 && (
                <div>
                  <Eyebrow>Into</Eyebrow>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                    {profile.interests.map((i) => <Chip key={i}>{i}</Chip>)}
                  </div>
                </div>
              )}

              {(links.length > 0 || website) && (
                <div>
                  <Eyebrow>Find me at</Eyebrow>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
                    {[...(website ? [website] : []), ...links].map((l) => {
                      const m = linkMeta(l)
                      return (
                        <a key={l} href={linkHref(l)} target="_blank" rel="noreferrer noopener"
                           style={{ display: 'flex', alignItems: 'center', gap: 11, borderRadius: 12,
                                    border: `1px solid ${C.border}`, padding: '11px 13px', textDecoration: 'none' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: m.color, flex: 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        font: font(800, 14, 1), color: '#fff' }}>
                            {m.label[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ font: font(700, 13.5, 1.25), color: C.ink, overflow: 'hidden',
                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                              {m.adult && <AgePill label="18+" />}
                            </div>
                            {m.detail && (
                              <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 2, overflow: 'hidden',
                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.detail}</div>
                            )}
                          </div>
                          <OutIcon color="#C3BFB8" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              {pages.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <Eyebrow>{pages.length === 1 ? 'Runs' : 'Runs these pages'}</Eyebrow>
                  {pages.map((p) => <EntityCard key={`${p.kind}-${p.id}`} entity={p} />)}
                  <div style={{ font: font(400, 11.5, 1.5), color: C.faint, textWrap: 'pretty' }}>
                    {pages.length === 1
                      ? `Posts badged with the ${PAGE_KIND[pages[0].kind].label.toLowerCase()}'s name are official; everything here is ${name} speaking for themselves.`
                      : `Posts badged with a page's name are official; everything here is ${name} speaking for themselves.`}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!self && !blocked && (
        <div style={{ font: font(400, 11.5, 1.5), color: C.faint, padding: '20px 24px 28px', textAlign: 'center',
                      textWrap: 'pretty' }}>
          {signedIn
            ? 'Follow people to see their posts in your feed.'
            : 'Follows are kept on this device until you sign in.'}
        </div>
      )}

      {activePost && (
        <CommentSheet post={activePost} data={data}
                      onClose={() => { setActivePost(null); void loadPosts() }} />
      )}
    </div>
  )
}
