import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { headerStyle } from '../lib/profile'
import { Img, font } from './ui'
import { Avatar, personColor, profileHref } from './Post'

// People to follow — the way into other people's profiles.
//
// The feed is built from follows, and follows lapse (a guest's after two weeks
// away) or are replaced (by the account's own on sign-in). Without a way to
// find people, anyone who fell out of the follow list fell out of the app.
// Only profiles that opted into being found are listed here: `discoverable`
// and `recommendable`. A `visible` profile is reachable by its link and its
// posts, never surfaced to strangers.

export interface PersonCard {
  id: string
  display_name: string
  public_handle: string | null
  avatar_url: string | null
  header_url: string | null
  pronouns: string | null
  bio: string | null
  age_rating: string | null
}

const PERSON_FIELDS = 'id, display_name, public_handle, avatar_url, header_url, pronouns, bio, age_rating'

/** Everyone who asked to be found, newest profile activity first. */
export function useDiscoverablePeople(limit = 40): PersonCard[] | null {
  const [people, setPeople] = useState<PersonCard[] | null>(null)
  useEffect(() => {
    let alive = true
    void supabase.from('social_profiles').select(PERSON_FIELDS)
      .eq('visibility', 'discoverable').eq('recommendable', true)
      .order('updated_at', { ascending: false }).limit(limit)
      .then(({ data }) => { if (alive) setPeople((data ?? []) as PersonCard[]) })
    return () => { alive = false }
  }, [limit])
  return people
}

function FollowButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const { isFollowing, toggleFollow } = useStore()
  const on = isFollowing(id)
  return (
    <div className="tap" role="button" aria-pressed={on}
         onClick={(e) => { e.stopPropagation(); toggleFollow(id) }}
         style={{ borderRadius: 999, padding: compact ? '6px 14px' : '8px 0', textAlign: 'center',
                  background: on ? '#fff' : C.ink, border: `1.5px solid ${on ? C.border : C.ink}`,
                  font: font(700, 12.5, 1.2), color: on ? C.body : '#fff' }}>
      {on ? 'Following' : 'Follow'}
    </div>
  )
}

function Card({ person }: { person: PersonCard }) {
  const nav = useNavigate()
  const color = personColor(person.id)
  const header = headerStyle(person.header_url, color)
  const href = profileHref(person.public_handle, person.display_name)
  return (
    <div className="tap" role="link" onClick={() => href && nav(href)}
         style={{ flex: 'none', width: 158, borderRadius: 16, border: `1px solid ${C.border}`, background: '#fff',
                  overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', height: 50, background: header.background }}>
        {header.image && (
          <Img src={header.image} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <div style={{ padding: '0 12px 12px', marginTop: -22, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ position: 'relative', alignSelf: 'flex-start', borderRadius: 999, border: '3px solid #fff',
                      background: '#fff' }}>
          <Avatar src={person.avatar_url} name={person.display_name} size={44} color={color} />
        </div>
        <div style={{ font: font(700, 13.5, 1.25), color: C.ink, marginTop: 6, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.display_name}</div>
        <div style={{ font: font(400, 11.5, 1.3), color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }}>
          {[person.public_handle && `@${person.public_handle.replace(/^@/, '')}`, person.pronouns]
            .filter(Boolean).join(' · ') || ' '}
        </div>
        <div style={{ font: font(400, 12, 1.4), color: C.body, marginTop: 6, flex: 1, minHeight: 34,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {person.bio ?? ''}
        </div>
        <div style={{ marginTop: 10 }}><FollowButton id={person.id} /></div>
      </div>
    </div>
  )
}

/** A sideways-scrolling strip of people the viewer does not follow yet. */
export function PeopleRail({ people, title = 'People to follow' }: { people: PersonCard[] | null; title?: string }) {
  const { account, isBlocked, isFollowing, canSee } = useStore()
  // Following someone should not make their card vanish mid-tap, so the set
  // is fixed from what was already followed when the list arrived.
  const [shown, setShown] = useState<PersonCard[]>([])
  useEffect(() => {
    if (!people) return
    setShown(people.filter((p) =>
      p.id !== account.profileId && !isBlocked(p.display_name) && !isFollowing(p.id) && canSee(p.age_rating)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, account.profileId])

  if (shown.length === 0) return null
  return (
    <section style={{ padding: '14px 0 16px', borderBottom: `1px solid ${C.hairline}`, background: C.fill }}>
      <div style={{ padding: '0 16px 10px', font: font(800, 15, 1.2), color: C.ink, letterSpacing: '-.01em' }}>
        {title}
      </div>
      <div className="hs" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 2px' }}>
        {shown.map((p) => <Card key={p.id} person={p} />)}
      </div>
    </section>
  )
}
