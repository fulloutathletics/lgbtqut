import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { entityHref, entityRef } from '../lib/data'
import type { AppData, EntityKind } from '../lib/types'
import { Img, font } from './ui'
import { Back, Heart } from './icons'

// A post, wherever it appears — the feed, or the list at the bottom of the
// person's own profile. One card, one reply sheet, one hydration step, so the
// two screens cannot drift apart on what a post looks like.

/** A post row as stored: authored by a user, and optionally published as a page. */
export interface RawPost {
  id: number
  author_id: string | null
  author_kind: EntityKind | null
  author_entity_id: string | null
  body: string
  created_at: string
}

export interface Post extends RawPost {
  author_name: string | null
  author_handle: string | null
  author_avatar: string | null
  /** Where tapping the author goes. Null when the author cannot be shown. */
  author_href: string | null
  /** Set when the post was published as a page rather than a person. */
  official_kind: EntityKind | null
  comment_count: number
  like_count: number
  liked: boolean
}

export interface Comment {
  id: number
  post_id: number
  author_id: string
  parent_id: number | null
  body: string
  created_at: string
  author_name: string | null
  author_handle: string | null
  author_avatar: string | null
  as_entity_kind: EntityKind | null
  as_entity_id: string | null
}

export const POST_FIELDS = 'id, author_id, author_kind, author_entity_id, body, created_at'

export function timeAgo(iso: string): string {
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

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

/** The address of a person's profile: the handle when they have one, else the name. */
export const profileHref = (handle: string | null | undefined, name: string | null | undefined) =>
  handle ? `/u/${encodeURIComponent(handle.replace(/^@/, ''))}`
  : name ? `/u/${encodeURIComponent(name)}` : null

/**
 * Attaches authors, like and reply counts to raw rows in three parallel
 * reads. A post published as a page is the page speaking; the person on the
 * row is there for accountability, not display.
 */
export async function hydratePosts(
  raw: RawPost[], data: AppData | null, viewerId: string | null,
): Promise<Post[]> {
  if (raw.length === 0) return []
  const ids = [...new Set(raw.map((p) => p.author_id).filter((id): id is string => !!id))]
  const postIds = raw.map((p) => p.id)

  const [profiles, counts, likes] = await Promise.all([
    ids.length
      ? supabase.from('social_profiles').select('id, display_name, public_handle, avatar_url').in('id', ids)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string; public_handle: string | null; avatar_url: string | null }> }),
    supabase.from('comments').select('post_id').in('post_id', postIds),
    supabase.from('post_likes').select('post_id, profile_id').in('post_id', postIds),
  ])

  const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const replyCount = new Map<number, number>()
  for (const c of counts.data ?? []) replyCount.set(c.post_id, (replyCount.get(c.post_id) ?? 0) + 1)
  const likeCount = new Map<number, number>()
  const mine = new Set<number>()
  for (const l of likes.data ?? []) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1)
    if (viewerId && l.profile_id === viewerId) mine.add(l.post_id)
  }

  return raw.map((p) => {
    const entity = entityRef(data, p.author_kind, p.author_entity_id)
    const prof = p.author_id ? byId.get(p.author_id) : undefined
    return {
      ...p,
      author_name: entity?.name ?? prof?.display_name ?? null,
      author_handle: entity ? null : prof?.public_handle ?? null,
      author_avatar: entity?.image_url ?? prof?.avatar_url ?? null,
      author_href: entity ? entityHref(entity) : profileHref(prof?.public_handle, prof?.display_name),
      official_kind: entity?.kind ?? null,
      comment_count: replyCount.get(p.id) ?? 0,
      like_count: likeCount.get(p.id) ?? 0,
      liked: mine.has(p.id),
    }
  })
}

// ------------------------------------------------------------------ avatar

export function Avatar({ src, name, size = 40, color, square = false }: {
  src?: string | null; name: string | null; size?: number; color: string; square?: boolean
}) {
  return (
    <div style={{ width: size, height: size, borderRadius: square ? size * 0.26 : 999, background: color,
                  flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', font: font(700, size * 0.34, 1), color: '#fff' }}>
      {src ? <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
           : name ? initials(name) : '?'}
    </div>
  )
}

const KIND_BADGE: Record<EntityKind, string> = { resource: 'ORG', business: 'BUSINESS', host: 'HOST' }

function Badge({ kind }: { kind: EntityKind }) {
  const { accent, tint } = useStore()
  return (
    <span style={{ borderRadius: 4, padding: '2px 6px', background: tint, color: accent,
                   font: font(700, 9, 1.4), letterSpacing: '.05em' }}>
      {KIND_BADGE[kind]}
    </span>
  )
}

// --------------------------------------------------------------- post card

export function PostCard({ post, onComment, onChange, showAuthor = true }: {
  post: Post
  onComment: (post: Post) => void
  /** Called with the updated post after a like toggles, so the list can keep it. */
  onChange?: (post: Post) => void
  /** Off on a profile page, where every card is by the same person. */
  showAuthor?: boolean
}) {
  const { accent, account, signedIn } = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)

  const toggleLike = async () => {
    if (!signedIn || !account.profileId) { nav('/signin'); return }
    if (busy) return
    setBusy(true)
    const next: Post = post.liked
      ? { ...post, liked: false, like_count: Math.max(0, post.like_count - 1) }
      : { ...post, liked: true, like_count: post.like_count + 1 }
    onChange?.(next)
    try {
      const { error } = post.liked
        ? await supabase.from('post_likes').delete().match({ post_id: post.id, profile_id: account.profileId })
        : await supabase.from('post_likes').insert({ post_id: post.id, profile_id: account.profileId })
      if (error) onChange?.(post)
    } finally {
      setBusy(false)
    }
  }

  const goAuthor = () => { if (post.author_href) nav(post.author_href) }
  const likeColor = post.liked ? '#D6336C' : C.muted

  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 11 }}>
        {showAuthor && (
          <div className="tap" onClick={goAuthor}>
            <Avatar src={post.author_avatar} name={post.author_name} color={accent} square={!!post.official_kind} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            {showAuthor && (
              <span className="tap" onClick={goAuthor} style={{ font: font(700, 13.5, 1.2), color: C.ink }}>
                {post.author_name ?? 'Unknown'}
              </span>
            )}
            {showAuthor && post.official_kind && <Badge kind={post.official_kind} />}
            {showAuthor && post.author_handle && (
              <span style={{ font: font(400, 12, 1.2), color: C.muted }}>
                @{post.author_handle.replace(/^@/, '')}
              </span>
            )}
            <span style={{ font: font(400, 11.5, 1.2), color: C.faint }}>
              {showAuthor ? '· ' : ''}{timeAgo(post.created_at)}
            </span>
          </div>
          <div style={{ font: font(400, 14.5, 1.55), color: C.body, marginTop: showAuthor ? 5 : 3, textWrap: 'pretty',
                        wordBreak: 'break-word' }}>
            {post.body}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 9 }}>
            <div className="tap" role="button" aria-pressed={post.liked} onClick={() => { void toggleLike() }}
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                          font: font(600, 12, 1.2), color: likeColor }}>
              <Heart size={16} filled={post.liked} color={likeColor} />
              {post.like_count > 0 ? post.like_count : 'Like'}
            </div>
            <div className="tap" role="button" onClick={() => onComment(post)}
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
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
    </div>
  )
}

// ----------------------------------------------------------- comment thread

function CommentRow({ comment, onReply, data }: {
  comment: Comment
  onReply: (parent: Comment) => void
  data: AppData | null
}) {
  const { accent } = useStore()
  const nav = useNavigate()
  // An entity reply is badged so an official answer reads differently from
  // the same person speaking for themselves.
  const official = entityRef(data, comment.as_entity_kind, comment.as_entity_id)
  const href = official ? entityHref(official) : profileHref(comment.author_handle, comment.author_name)

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <div className="tap" onClick={() => href && nav(href)}>
          <Avatar src={comment.author_avatar} name={comment.author_name} size={30} color={accent}
                  square={!!official} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
            <span className="tap" onClick={() => href && nav(href)}
                  style={{ font: font(700, 12.5, 1.2), color: C.ink }}>
              {comment.author_name ?? 'Unknown'}
            </span>
            {official && <Badge kind={official.kind} />}
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

export function CommentSheet({ post, data, onClose }: { post: Post; data: AppData | null; onClose: () => void }) {
  const { accent, account } = useStore()
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
    const ids = [...new Set(rows.map((c) => c.author_id))]
    const { data: profiles } = await supabase
      .from('social_profiles')
      .select('id, display_name, public_handle, avatar_url')
      .in('id', ids)
    const map = new Map((profiles ?? []).map((p) => [p.id, p]))
    setComments(rows.map((c) => {
      const speaking = entityRef(data, c.as_entity_kind, c.as_entity_id)
      const prof = map.get(c.author_id)
      return {
        ...c,
        author_name: speaking?.name ?? prof?.display_name ?? null,
        author_handle: speaking ? null : prof?.public_handle ?? null,
        author_avatar: speaking?.image_url ?? prof?.avatar_url ?? null,
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
        <div style={{ width: 36, height: 4, borderRadius: 999, background: C.border, margin: '8px auto' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 12px',
                      borderBottom: `1px solid ${C.hairline}` }}>
          <div className="tap" role="button" onClick={onClose}
               style={{ width: 30, height: 30, borderRadius: 999, background: C.fill,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Back size={15} />
          </div>
          <div style={{ font: font(700, 15, 1.2), color: C.ink }}>Replies</div>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', gap: 9 }}>
            <Avatar src={post.author_avatar} name={post.author_name} size={34} color={accent}
                    square={!!post.official_kind} />
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
                <CommentRow comment={c} data={data} onReply={(parent) => { setReplyTo(parent); setBody('') }} />
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} style={{ marginLeft: 39, borderLeft: `2px solid ${C.hairline}`, paddingLeft: 10 }}>
                    <CommentRow comment={r} data={data} onReply={(parent) => { setReplyTo(parent); setBody('') }} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

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
