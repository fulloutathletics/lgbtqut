import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Img, font } from '../components/ui'
import { useData } from '../lib/useData'
import { resolveManaged } from '../lib/pages'
import type { EntityKind } from '../lib/types'
import { Avatar, CommentSheet, POST_FIELDS, PostCard, hydratePosts, initials } from '../components/Post'
import type { Post, RawPost } from '../components/Post'

// Feed — route `/feed`.
//
// Text posts, likes and threaded replies. Users follow other users and save
// pages to fill their feed. No photo uploads in posts — images are limited
// to profile avatars/headers. The card itself lives in components/Post so a
// person's profile shows the same thing.

const MAX_POST = 280

// ----------------------------------------------------------- Post composer

/** Who a post is published as: the person, or one of the pages they run. */
type Voice = { kind: 'me' } | { kind: 'page'; page: EntityKind; id: string }

function Composer({ onPosted }: { onPosted: () => void }) {
  const { accent, tint, account } = useStore()
  const data = useData()
  const [body, setBody] = useState('')
  const [voice, setVoice] = useState<Voice>({ kind: 'me' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pages = resolveManaged(data, account.managed)
  const speaking = voice.kind === 'page' ? pages.find((p) => p.kind === voice.page && p.id === voice.id) : null
  const myName = account.displayName ?? account.username ?? 'You'

  const post = async () => {
    const text = body.trim()
    if (!text) return
    if (text.length > MAX_POST) {
      setError(`Posts are limited to ${MAX_POST} characters.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      // A page post keeps author_id: the page is who is speaking, the person
      // is who is accountable. The insert policy checks they administer it.
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: account.profileId,
        author_kind: voice.kind === 'page' ? voice.page : null,
        author_entity_id: voice.kind === 'page' ? voice.id : null,
        body: text,
      })
      if (insertError) {
        setError('Could not post. Try again.')
        return
      }
      setBody('')
      onPosted()
    } finally {
      setBusy(false)
    }
  }

  if (!account.profileId) return null

  return (
    <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 11 }}>
        {speaking ? (
          <div style={{ width: 38, height: 38, borderRadius: 10, background: accent, flex: 'none', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', font: font(700, 13, 1), color: '#fff' }}>
            {speaking.image_url
              ? <Img src={speaking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials(speaking.name)}
          </div>
        ) : (
          <Avatar src={account.avatarUrl} name={myName} size={38} color={accent} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {pages.length > 0 && (
            <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
              {[{ label: myName, v: { kind: 'me' } as Voice, on: voice.kind === 'me' },
                ...pages.map((p) => ({
                  label: p.name, v: { kind: 'page', page: p.kind, id: p.id } as Voice,
                  on: voice.kind === 'page' && voice.page === p.kind && voice.id === p.id,
                }))].map((c) => (
                <div key={c.label} className="tap" role="button" onClick={() => setVoice(c.v)}
                     style={{ flex: 'none', borderRadius: 999, padding: '5px 11px', maxWidth: 160,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              border: `1.5px solid ${c.on ? accent : C.border}`,
                              background: c.on ? tint : '#fff',
                              font: font(c.on ? 700 : 600, 11.5, 1.2), color: c.on ? accent : C.body }}>
                  {c.label}
                </div>
              ))}
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={speaking ? `Post as ${speaking.name}…` : 'Share something with the community…'}
            rows={2}
            style={{ width: '100%', border: 'none', outline: 'none', resize: 'none',
                     font: font(400, 14.5, 1.5), color: C.ink, background: 'transparent',
                     boxSizing: 'border-box' as const }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <div style={{ font: font(400, 11.5, 1.3), color: body.length > MAX_POST ? C.danger : C.faint }}>
              {body.length}/{MAX_POST}
            </div>
            <div className="tap" role="button"
                 onClick={() => { if (!busy && body.trim()) void post() }}
                 style={{ borderRadius: 999, padding: '7px 18px',
                          background: busy || !body.trim() ? C.border : accent,
                          font: font(700, 13, 1.2),
                          color: busy || !body.trim() ? C.faint : '#fff',
                          cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Posting…' : 'Post'}
            </div>
          </div>
          {error && (
            <div style={{ font: font(500, 12, 1.4), color: C.danger, marginTop: 6 }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- Empty state

function EmptyFeed() {
  const { accent, tint } = useStore()
  const nav = useNavigate()

  const links: Array<{ label: string; sub: string; to: string }> = [
    { label: 'Browse resources', sub: 'Organizations, groups and services', to: '/list/resources' },
    { label: 'Find businesses', sub: 'Queer-owned and affirming shops', to: '/shop' },
    { label: 'Discover event hosts', sub: 'People and groups hosting events', to: '/events' },
  ]

  return (
    <div style={{ padding: '36px 24px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: tint, margin: '0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent}
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-9A8.4 8.4 0 1 1 21 11.5z" />
        </svg>
      </div>
      <div style={{ font: font(700, 18, 1.25), color: C.ink, marginTop: 16, letterSpacing: '-.01em' }}>
        Your feed is quiet
      </div>
      <div style={{ font: font(400, 13.5, 1.55), color: C.muted, marginTop: 7, textWrap: 'pretty',
                    maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
        Follow people and save businesses, resources and hosts to see their updates here.
      </div>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map((l) => (
          <div key={l.to} className="tap" role="button" onClick={() => nav(l.to)}
               style={{ border: `1.5px solid ${C.border}`, borderRadius: 13, padding: '14px 16px',
                        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(700, 14, 1.25), color: C.ink }}>{l.label}</div>
              <div style={{ font: font(400, 12, 1.35), color: C.muted, marginTop: 3 }}>{l.sub}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.faint}
                 strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
        ))}
      </div>
    </div>
  )
}

// ----------------------------------------------------------- Feed screen

export default function Feed() {
  const { accent, account, signedIn, follows, saved } = useStore()
  const data = useData()
  const nav = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [activePost, setActivePost] = useState<Post | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const loadPosts = useCallback(async () => {
    // Anonymous readers get the same feed, built from the follows and saves
    // held on this device. Reading is all they can do — the composer, likes
    // and replies stay behind sign-in — so no profileId is required here.
    const authorIds = [...follows]
    if (account.profileId && !authorIds.includes(account.profileId)) authorIds.push(account.profileId)

    // Saved resources/businesses/hosts publish as entities, not as users.
    const entityIds = Object.values(saved).map((s) => s.id)

    if (authorIds.length === 0 && entityIds.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    const [byUser, byEntity] = await Promise.all([
      authorIds.length
        ? supabase.from('posts').select(POST_FIELDS)
            .in('author_id', authorIds)
            .order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as RawPost[] }),
      entityIds.length
        ? supabase.from('posts').select(POST_FIELDS)
            .in('author_entity_id', entityIds)
            .order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as RawPost[] }),
    ])

    const seen = new Set<number>()
    const raw = [...((byUser.data ?? []) as RawPost[]), ...((byEntity.data ?? []) as RawPost[])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50)

    setPosts(await hydratePosts(raw, data, account.profileId))
    setLoading(false)
  }, [account.profileId, follows, saved, data])

  useEffect(() => { void loadPosts() }, [loadPosts, reloadKey])

  const reload = () => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,.94)',
                    backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.hairline}`,
                    padding: '56px 16px 12px', display: 'flex', alignItems: 'center' }}>
        <div style={{ font: font(800, 20, 1.15), color: C.ink, letterSpacing: '-.01em' }}>Feed</div>
        <div className="tap" role="button" onClick={reload}
             style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                      font: font(600, 12, 1.2), color: accent }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent}
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
          Refresh
        </div>
      </div>

      {signedIn && <Composer onPosted={reload} />}

      {/* Reading is the whole of the anonymous experience, so say plainly what
          is being kept and for how long rather than letting follows vanish. */}
      {!signedIn && posts.length > 0 && (
        <div style={{ margin: '12px 16px 0', background: C.fill, borderRadius: 12, padding: '10px 13px',
                      font: font(400, 12, 1.45), color: '#6E6A64', textWrap: 'pretty' }}>
          You are reading as a guest. Your follows are stored on this device, lapse after two weeks
          away, and posting, liking or replying needs an account.
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', font: font(400, 14, 1.4), color: C.muted }}>
          Loading…
        </div>
      ) : !signedIn && posts.length === 0 ? (
        <div style={{ padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ font: font(700, 18, 1.25), color: C.ink, letterSpacing: '-.01em' }}>
            Follow something to fill your feed
          </div>
          <div style={{ font: font(400, 13.5, 1.55), color: C.muted, marginTop: 7, textWrap: 'pretty',
                        maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>
            Follow resources, businesses and hosts and their updates land here — no account needed.
            Your follows stay on this device, and lapse if you are away for a couple of weeks.
          </div>
          <div className="tap" role="button" onClick={() => nav('/list/all')}
               style={{ display: 'inline-block', marginTop: 18, borderRadius: 999, padding: '10px 24px',
                        background: accent, font: font(700, 14, 1.2), color: '#fff' }}>
            Browse resources
          </div>
          <div className="tap" role="button" onClick={() => nav('/signin')}
               style={{ display: 'inline-block', marginTop: 10, font: font(600, 13, 1.2), color: C.muted }}>
            Or sign in to post and keep them
          </div>
        </div>
      ) : posts.length === 0 ? (
        <EmptyFeed />
      ) : (
        <div>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onComment={setActivePost}
                      onChange={(next) => setPosts((ps) => ps.map((x) => (x.id === next.id ? next : x)))} />
          ))}
          <div style={{ padding: 20, textAlign: 'center', font: font(400, 12, 1.4), color: C.faint }}>
            You're all caught up.
          </div>
        </div>
      )}

      {activePost && (
        <CommentSheet post={activePost} data={data} onClose={() => { setActivePost(null); reload() }} />
      )}
    </div>
  )
}
