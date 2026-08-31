import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { ProfileHeader, font } from '../components/ui'
import { Back } from '../components/icons'
import { useData } from '../lib/useData'
import { entityHref, entityRef } from '../lib/data'
import type { EntityKind } from '../lib/types'

// Feed — route `/feed`.
//
// The only social feature: text-only posts and threaded comments. Users
// follow other users to fill their feed. No photo uploads in posts —
// images are limited to profile avatars/headers.

/** A post row as stored: authored either by a user or by a directory entity. */
interface RawPost {
  id: number
  author_id: string | null
  author_kind: 'resource' | 'business' | 'host' | null
  author_entity_id: string | null
  body: string
  created_at: string
}

interface Post extends RawPost {
  author_name: string | null
  author_handle: string | null
  author_avatar: string | null
  comment_count: number
}

interface Comment {
  id: number
  post_id: number
  author_id: string
  parent_id: number | null
  body: string
  created_at: string
  author_name: string | null
  author_handle: string | null
  /** Set when an admin published this under their entity's name. */
  as_entity_kind: EntityKind | null
  as_entity_id: string | null
}

const MAX_POST = 280

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ----------------------------------------------------------- Post composer

function Composer({ onPosted }: { onPosted: () => void }) {
  const { accent, account } = useStore()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: account.profileId,
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
        <div style={{ width: 38, height: 38, borderRadius: 999, background: accent, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      font: font(700, 13, 1), color: '#fff' }}>
          {account.displayName ? initials(account.displayName) : '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share something with the community…"
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

// ----------------------------------------------------------- Post card

function PostCard({ post, onComment }: {
  post: Post
  onComment: (post: Post) => void
}) {
  const { accent } = useStore()
  const nav = useNavigate()

  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 11 }}>
        <div className="tap" onClick={() => post.author_name && nav(`/u/${encodeURIComponent(post.author_name)}`)}
             style={{ width: 40, height: 40, borderRadius: 999, background: accent, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      font: font(700, 13, 1), color: '#fff' }}>
          {post.author_name ? initials(post.author_name) : '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span className="tap" onClick={() => post.author_name && nav(`/u/${encodeURIComponent(post.author_name)}`)}
                  style={{ font: font(700, 13.5, 1.2), color: C.ink }}>
              {post.author_name ?? 'Unknown'}
            </span>
            {post.author_handle && (
              <span style={{ font: font(400, 12, 1.2), color: C.muted }}>
                {post.author_handle.startsWith('@') ? post.author_handle : `@${post.author_handle}`}
              </span>
            )}
            <span style={{ font: font(400, 11.5, 1.2), color: C.faint }}>· {timeAgo(post.created_at)}</span>
          </div>
          <div style={{ font: font(400, 14.5, 1.55), color: C.body, marginTop: 5, textWrap: 'pretty',
                        wordBreak: 'break-word' }}>
            {post.body}
          </div>
          <div className="tap" role="button" onClick={() => onComment(post)}
               style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9,
                        font: font(600, 12, 1.2), color: C.muted }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.muted}
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-9A8.4 8.4 0 1 1 21 11.5z" />
            </svg>
            {post.comment_count > 0 ? `${post.comment_count} ${post.comment_count === 1 ? 'reply' : 'replies'}` : 'Reply'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- Comment thread

function CommentRow({ comment, onReply }: {
  comment: Comment
  onReply: (parent: Comment) => void
}) {
  const { accent, tint } = useStore()
  const data = useData()
  const nav = useNavigate()
  // An entity reply is badged so an official answer reads differently from
  // the same person speaking for themselves.
  const official = entityRef(data, comment.as_entity_kind, comment.as_entity_id)

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <div className="tap" onClick={() => comment.author_name && nav(`/u/${encodeURIComponent(comment.author_name)}`)}
             style={{ width: 30, height: 30, borderRadius: 999, background: accent, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      font: font(600, 11, 1), color: '#fff' }}>
          {comment.author_name ? initials(comment.author_name) : '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
            <span
              className="tap"
              onClick={() => {
                if (official) nav(entityHref(official))
                else if (comment.author_name) nav(`/u/${encodeURIComponent(comment.author_name)}`)
              }}
              style={{ font: font(700, 12.5, 1.2), color: C.ink }}
            >
              {comment.author_name ?? 'Unknown'}
            </span>
            {official && (
              <span style={{ borderRadius: 4, padding: '2px 6px', background: tint, color: accent,
                             font: font(700, 9, 1.4), letterSpacing: '.05em' }}>
                {official.kind === 'host' ? 'HOST' : official.kind.toUpperCase()}
              </span>
            )}
            <span style={{ font: font(400, 11, 1.2), color: C.faint }}>· {timeAgo(comment.created_at)}</span>
          </div>
          <div style={{ font: font(400, 13.5, 1.5), color: C.body, marginTop: 3, textWrap: 'pretty',
                        wordBreak: 'break-word' }}>
            {comment.body}
          </div>
          <div className="tap" role="button" onClick={() => onReply(comment)}
               style={{ font: font(600, 11.5, 1.2), color: C.muted, marginTop: 5, display: 'inline-block' }}>
            Reply
          </div>
        </div>
      </div>
    </div>
  )
}

function CommentSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const { accent, account } = useStore()
  const data = useData()
  const nav = useNavigate()
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadComments = useCallback(async () => {
    const { data: rows } = await supabase
      .from('comments')
      .select('id, post_id, author_id, parent_id, body, created_at, as_entity_kind, as_entity_id')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    if (!rows) return
    const ids = rows.map((c) => c.author_id)
    const { data: profiles } = await supabase
      .from('social_profiles')
      .select('id, display_name, public_handle')
      .in('id', ids)
    const map = new Map((profiles ?? []).map((p) => [p.id, p]))
    setComments(rows.map((c) => {
      // Published under an entity's name by one of its admins: the entity is
      // who the reader is talking to, so it is the identity shown.
      const speaking = entityRef(data, c.as_entity_kind, c.as_entity_id)
      return {
        ...c,
        author_name: speaking?.name ?? map.get(c.author_id)?.display_name ?? null,
        author_handle: speaking ? null : map.get(c.author_id)?.public_handle ?? null,
      }
    }))
    setLoading(false)
  }, [post.id, data])

  useEffect(() => { void loadComments() }, [loadComments])

  const submit = async () => {
    const text = body.trim()
    if (!text || !account.profileId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: post.id,
        author_id: account.profileId,
        parent_id: replyTo?.id ?? null,
        body: text,
      })
      if (error) return
      setBody('')
      setReplyTo(null)
      await loadComments()
    } finally {
      setBusy(false)
    }
  }

  const topLevel = comments.filter((c) => c.parent_id === null)
  const repliesOf = (parentId: number) => comments.filter((c) => c.parent_id === parentId)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.35)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: '18px 18px 0 0', maxHeight: '85vh',
                    display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 999, background: C.border, margin: '8px auto' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 12px',
                      borderBottom: `1px solid ${C.hairline}` }}>
          <div className="tap" role="button" onClick={onClose}
               style={{ width: 30, height: 30, borderRadius: 999, background: C.fill,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Back size={15} />
          </div>
          <div style={{ font: font(700, 15, 1.2), color: C.ink }}>Replies</div>
        </div>

        {/* Original post */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', gap: 9 }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: accent, flex: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          font: font(600, 12, 1), color: '#fff' }}>
              {post.author_name ? initials(post.author_name) : '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(700, 13, 1.2), color: C.ink }}>
                {post.author_name ?? 'Unknown'}
                <span style={{ font: font(400, 11.5, 1.2), color: C.faint, marginLeft: 6 }}>· {timeAgo(post.created_at)}</span>
              </div>
              <div style={{ font: font(400, 14, 1.5), color: C.body, marginTop: 4, textWrap: 'pretty',
                            wordBreak: 'break-word' }}>
                {post.body}
              </div>
            </div>
          </div>
        </div>

        {/* Comments list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', font: font(400, 13, 1.4), color: C.muted }}>Loading…</div>
          ) : topLevel.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', font: font(400, 13.5, 1.5), color: C.muted }}>
              No replies yet. Be the first.
            </div>
          ) : (
            topLevel.map((c) => (
              <div key={c.id}>
                <CommentRow comment={c} onReply={(parent) => { setReplyTo(parent); setBody('') }} />
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} style={{ marginLeft: 39, borderLeft: `2px solid ${C.hairline}`, paddingLeft: 10 }}>
                    <CommentRow comment={r} onReply={(parent) => { setReplyTo(parent); setBody('') }} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        {account.profileId ? (
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.hairline}` }}>
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <span style={{ font: font(400, 11.5, 1.3), color: C.muted }}>
                  Replying to {replyTo.author_name ?? 'Unknown'}
                </span>
                <div className="tap" role="button" onClick={() => setReplyTo(null)}
                     style={{ font: font(600, 11.5, 1.3), color: accent }}>Cancel</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 9 }}>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a reply…"
                style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 999,
                         padding: '9px 14px', outline: 'none', font: font(400, 14, 1.3), color: C.ink,
                         background: '#fff', boxSizing: 'border-box' as const }} />
              <div className="tap" role="button"
                   onClick={() => { if (!busy && body.trim()) void submit() }}
                   style={{ borderRadius: 999, padding: '9px 16px', flex: 'none',
                            background: busy || !body.trim() ? C.border : accent,
                            font: font(700, 13, 1.2), color: busy || !body.trim() ? C.faint : '#fff',
                            cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '…' : 'Reply'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px', borderTop: `1px solid ${C.hairline}` }}>
            <div className="tap" role="button" onClick={() => nav('/signin')}
                 style={{ textAlign: 'center', font: font(600, 13, 1.3), color: accent }}>
              Sign in to reply
            </div>
          </div>
        )}
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
        ? supabase.from('posts')
            .select('id, author_id, author_kind, author_entity_id, body, created_at')
            .in('author_id', authorIds)
            .order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as RawPost[] }),
      entityIds.length
        ? supabase.from('posts')
            .select('id, author_id, author_kind, author_entity_id, body, created_at')
            .in('author_entity_id', entityIds)
            .order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as RawPost[] }),
    ])

    const rawPosts = [...(byUser.data ?? []), ...(byEntity.data ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50)

    if (rawPosts.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    // Fetch author profiles (user-authored posts only — entity posts resolve
    // against the already-cached directory below).
    const ids = [...new Set(rawPosts.map((p) => p.author_id).filter((id): id is string => !!id))]
    const { data: profiles } = ids.length
      ? await supabase
          .from('social_profiles')
          .select('id, display_name, public_handle, avatar_url')
          .in('id', ids)
      : { data: [] }
    const map = new Map((profiles ?? []).map((p) => [p.id, p]))

    // Fetch comment counts
    const postIds = rawPosts.map((p) => p.id)
    const { data: counts } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds)

    const countMap = new Map<number, number>()
    for (const c of counts ?? []) {
      countMap.set(c.post_id, (countMap.get(c.post_id) ?? 0) + 1)
    }

    setPosts(rawPosts.map((p) => {
      const entity = entityRef(data, p.author_kind, p.author_entity_id)
      const prof = p.author_id ? map.get(p.author_id) : undefined
      return {
        ...p,
        author_name: prof?.display_name ?? entity?.name ?? null,
        author_handle: prof?.public_handle ?? null,
        author_avatar: prof?.avatar_url ?? entity?.image_url ?? null,
        comment_count: countMap.get(p.id) ?? 0,
      }
    }))
    setLoading(false)
  }, [account.profileId, follows, saved, data])

  useEffect(() => { void loadPosts() }, [loadPosts, reloadKey])

  const reload = () => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  return (
    <div>
      {/* The banner every other main tab opens with. Feed had a bar of its own,
          which made the one social tab look like a screen from another app. */}
      <ProfileHeader title="Feed" tagline="Updates from the people and places you follow." />

      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 12px' }}>
        <div className="tap" role="button" onClick={reload}
             style={{ display: 'flex', alignItems: 'center', gap: 5,
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
          away, and posting or replying needs an account.
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
            <PostCard key={p.id} post={p} onComment={setActivePost} />
          ))}
          <div style={{ padding: 20, textAlign: 'center', font: font(400, 12, 1.4), color: C.faint }}>
            You're all caught up.
          </div>
        </div>
      )}

      {activePost && (
        <CommentSheet post={activePost} onClose={() => { setActivePost(null); reload() }} />
      )}
    </div>
  )
}
