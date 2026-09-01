import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, THEMES } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { subscribeToPush } from '../lib/push'
import { supabase } from '../lib/supabase'
import type { AppData, EntityKind, SavedEntry } from '../lib/types'
import { PAGE_KIND, describeRequest, resolveManaged, withdrawPageRequest } from '../lib/pages'
import { isOnboarded } from '../lib/onboarding'
import { Chevron, Verified } from '../components/icons'
import { DeviceOnlyNotice, Img, ProfileHeader, Toggle, font } from '../components/ui'
import { SubscriptionPanel, channelSummary } from '../components/SubscriptionPanel'

// Profile — route `/profile`.
//
// Five panes behind a segmented pill bar. Pane selection is local state, not a
// route, so the tab bar keeps treating this as one screen.

const PANES = [
  { key: 'saved', label: 'Saved' },
  { key: 'themes', label: 'Themes' },
  { key: 'contribute', label: 'Contribute' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'account', label: 'Account' },
] as const

type Pane = (typeof PANES)[number]['key']

// -------------------------------------------------------------- saved items

interface SavedItem {
  id: string
  kind: EntityKind
  name: string
  img: string
  sub: string
  to: string
  /** Hosts with no linked business or resource cannot send newsletters. */
  allowNewsletter: boolean
}

const KIND_LABEL: Record<EntityKind, string> = {
  resource: 'Resource',
  business: 'Business',
  host: 'Event host',
}

const GROUPS: Array<{ kind: EntityKind; heading: string }> = [
  { kind: 'resource', heading: 'Resources' },
  { kind: 'business', heading: 'Businesses' },
  { kind: 'host', heading: 'Event hosts' },
]

function resolveSaved(data: AppData, saved: Record<string, SavedEntry>): SavedItem[] {
  const out: SavedItem[] = []
  for (const entry of Object.values(saved)) {
    if (entry.kind === 'resource') {
      const r = data.resources.find((x) => x.id === entry.id)
      if (r) {
        out.push({
          id: r.id, kind: 'resource', name: r.name, img: r.image_url,
          sub: r.category, to: `/resource/${r.id}`, allowNewsletter: true,
        })
      }
    } else if (entry.kind === 'business') {
      const b = data.businesses.find((x) => x.id === entry.id)
      if (b) {
        out.push({
          id: b.id, kind: 'business', name: b.name, img: b.image_url,
          sub: b.county || 'Online only', to: `/business/${b.id}`, allowNewsletter: true,
        })
      }
    } else {
      const h = data.hosts.find((x) => x.id === entry.id)
      if (h) {
        out.push({
          id: h.id, kind: 'host', name: h.name, img: h.image_url, sub: 'Event host',
          to: `/host/${h.id}`,
          allowNewsletter: !!(h.linked_business_id || h.linked_resource_id),
        })
      }
    }
  }
  return out
}

// ------------------------------------------------------------- small pieces

const Card = ({ children }: { children: ReactNode }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>{children}</div>
)

const Eyebrow = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ font: font(700, 12, 1.2), letterSpacing: '.1em', textTransform: 'uppercase',
                color: '#9A968F', marginBottom: 10, ...style }}>{children}</div>
)

const PaneTitle = ({ title, note }: { title: string; note: string }) => (
  <>
    <div style={{ font: font(800, 19, 1.2), color: C.ink, letterSpacing: '-.01em', margin: '2px 0 4px' }}>{title}</div>
    <div style={{ font: font(400, 12.5, 1.5), color: '#8C887F', marginBottom: 16, textWrap: 'pretty' }}>{note}</div>
  </>
)

function LinkRow({ title, sub, onClick, last }: {
  title: string; sub: string; onClick: () => void; last?: boolean
}) {
  return (
    <div className="tap" role="button" onClick={onClick}
         style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 14px',
                  borderBottom: last ? 'none' : `1px solid ${C.hairline}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>{title}</div>
        <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{sub}</div>
      </div>
      <Chevron size={15} color="#C3BFB8" />
    </div>
  )
}

function ToggleRow({ title, sub, on, onChange, last, disabled }: {
  title: string; sub: string; on: boolean; onChange: () => void; last?: boolean; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px',
                  borderBottom: last ? 'none' : `1px solid ${C.hairline}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: font(600, 14, 1.25), color: '#1A1A18', textWrap: 'pretty' }}>{title}</div>
        <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  )
}

const Check = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
)

// --------------------------------------------------------------- Saved pane

function SavedPane({ items }: { items: SavedItem[] }) {
  const nav = useNavigate()
  const { signedIn } = useStore()

  return (
    <div>
      {!signedIn && <div style={{ margin: '0 -16px' }}><DeviceOnlyNotice /></div>}

      {items.length === 0 ? (
        <div style={{ border: '1.5px dashed #DFDBD5', borderRadius: 14, padding: '24px 18px', textAlign: 'center' }}>
          <div style={{ font: font(600, 14, 1.3), color: C.body }}>Nothing saved yet</div>
          <div style={{ font: font(400, 12.5, 1.5), color: '#8C887F', marginTop: 5 }}>
            Tap the heart on any resource, business or host to keep it here.
          </div>
        </div>
      ) : (
        GROUPS.map(({ kind, heading }) => {
          const rows = items.filter((i) => i.kind === kind)
          if (!rows.length) return null
          return (
            <div key={kind} style={{ marginBottom: 22 }}>
              <Eyebrow>{heading}</Eyebrow>
              <Card>
                {rows.map((s, i) => (
                  <div key={s.id} className="tap" role="button" onClick={() => nav(s.to)}
                       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                                borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden',
                                  background: '#F0EDE8', flex: 'none' }}>
                      <Img src={s.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>{s.name}</div>
                      <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 2 }}>{s.sub}</div>
                    </div>
                    <Chevron size={15} color="#C3BFB8" />
                  </div>
                ))}
              </Card>
            </div>
          )
        })
      )}
    </div>
  )
}

// -------------------------------------------------------------- Themes pane

function ThemesPane() {
  const { theme: active, accent, setTheme } = useStore()

  const grid = (group: 'standard' | 'pride') => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {Object.entries(THEMES)
        .filter(([, t]) => t.group === group)
        .map(([key, t]) => {
          const on = key === active
          return (
            <div key={key} className="tap" role="button" onClick={() => setTheme(key)}
                 style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, margin: '0 auto',
                            background: t.dot, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: on
                              ? `inset 0 0 0 1px rgba(0,0,0,.08), 0 0 0 3px #fff, 0 0 0 5px ${accent}`
                              : 'inset 0 0 0 1px rgba(0,0,0,.08)' }}>
                {on && (
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,.45)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={15} />
                  </div>
                )}
              </div>
              <div style={{ font: font(on ? 700 : 600, 11.5, 1.25), color: on ? '#1A1A18' : '#5C5851',
                            marginTop: 8, textWrap: 'pretty' }}>{t.label}</div>
            </div>
          )
        })}
    </div>
  )

  return (
    <div>
      <PaneTitle title="Choose Your Theme"
                 note="Themes swap the header, accent color and card tint across every page." />
      <div style={{ font: font(700, 13, 1.2), color: '#2A2A28', marginBottom: 12 }}>Standard Themes</div>
      {grid('standard')}
      <div style={{ font: font(700, 13, 1.2), color: '#2A2A28', margin: '26px 0 12px' }}>Classic Themes</div>
      {grid('pride')}
    </div>
  )
}

// ---------------------------------------------------------- Contribute pane

// Placeholder inbox — the submission forms are not built yet, so these rows
// open a pre-addressed email instead of a dead end.
const mailto = (subject: string) =>
  `mailto:hello@lgbtq.ut?subject=${encodeURIComponent(subject)}`

function ContributePane() {
  const nav = useNavigate()
  const open = (subject: string) => () => { window.location.href = mailto(subject) }

  return (
    <div>
      <PaneTitle
        title="Contribute"
        note="Everything in this app was submitted by someone in the community. Volunteers review every entry." />
      <Card>
        <LinkRow title="Manage a page"
                 sub="Run an organization, business or event host page from this account"
                 onClick={() => nav('/apply')} />
        <LinkRow title="Submit a resource"
                 sub="Add an organization, group or service"
                 onClick={open('Submit a resource')} />
        <LinkRow title="Suggest a business"
                 sub="Queer-owned or actively affirming"
                 onClick={open('Suggest a business')} />
        <LinkRow title="Report a listing"
                 sub="Closed, moved, or no longer affirming"
                 onClick={open('Report a listing')} last />
      </Card>
      <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 22, textAlign: 'center',
                    textWrap: 'pretty' }}>
        LGBTQ.UT is a volunteer project. Listings are reviewed, not endorsed.
      </div>
    </div>
  )
}

// -------------------------------------------------------------- Alerts pane

type PushState = 'idle' | 'working' | 'on' | 'denied' | 'unsupported' | 'error'

function AlertsPane({ items }: { items: SavedItem[] }) {
  const { signedIn, pauseAll, setPauseAll, channels, accent } = useStore()

  // First-party broadcasts have no store field yet; they belong on the profile
  // row server-side once the notification service lands.
  const [announcements, setAnnouncements] = useState(true)
  const [crisis, setCrisis] = useState(true)

  const [push, setPush] = useState<PushState>('idle')
  const [pushError, setPushError] = useState('')

  const enablePush = async () => {
    setPush('working')
    setPushError('')
    try {
      const sub = await subscribeToPush()
      if (!sub) {
        setPush('serviceWorker' in navigator && 'PushManager' in window ? 'denied' : 'unsupported')
        return
      }
      setPush('on')
    } catch (err) {
      setPush('error')
      setPushError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const pushNote = push === 'on' ? 'On. This device will receive alerts.'
    : push === 'working' ? 'Asking your browser…'
    : push === 'denied' ? 'Your browser blocked notifications. Allow them in site settings, then try again.'
    : push === 'unsupported' ? 'This device or browser cannot receive push notifications.'
    : push === 'error' ? pushError || 'Could not turn push on.'
    : 'Everything we send arrives here — there is no email address on file to send to.'

  const active = items.filter((s) => channelSummary(channels(s.id), s.allowNewsletter) !== 'Not receiving updates')

  return (
    <div>
      <PaneTitle
        title="Alerts"
        note="Saving a business, resource or event host subscribes you to all three of their channels. Turn any channel off without unsaving." />

      {!signedIn && <div style={{ margin: '0 -16px' }}><DeviceOnlyNotice /></div>}

      <div style={{ marginBottom: 20 }}>
        <Card>
          <ToggleRow
            title="Pause all notifications"
            sub={pauseAll ? 'Nothing will be sent until you turn this off.' : 'Keeps every subscription, sends nothing.'}
            on={pauseAll}
            onChange={() => setPauseAll(!pauseAll)}
            last />
        </Card>
      </div>

      <div style={{ marginBottom: 26 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>Enable push notifications</div>
              <div style={{ font: font(400, 11.5, 1.4), color: push === 'error' || push === 'denied' ? C.danger : C.muted,
                            marginTop: 3, textWrap: 'pretty' }}>{pushNote}</div>
            </div>
            <div className="tap" role="button"
                 onClick={() => { if (push !== 'working' && push !== 'on') void enablePush() }}
                 style={{ flex: 'none', borderRadius: 999, padding: '8px 15px',
                          background: push === 'on' ? C.successBg : accent,
                          font: font(700, 12.5, 1.2), color: push === 'on' ? C.success : '#fff',
                          opacity: push === 'working' ? 0.6 : 1 }}>
              {push === 'on' ? 'Enabled' : push === 'working' ? 'Working…' : 'Enable'}
            </div>
          </div>
        </Card>
      </div>

      {items.length > 0 && (
        <div style={{ marginBottom: 26, opacity: pauseAll ? 0.55 : 1 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Your subscriptions</Eyebrow>
          <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginBottom: 12 }}>
            {active.length} of {items.length} subscriptions are active
          </div>
          {items.map((s) => (
            <div key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 7 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden',
                              background: '#F0EDE8', flex: 'none' }}>
                  <Img src={s.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18', textWrap: 'pretty' }}>{s.name}</div>
                  <div style={{ font: font(400, 11, 1.3), color: C.muted, marginTop: 2 }}>{KIND_LABEL[s.kind]}</div>
                </div>
              </div>
              <SubscriptionPanel entityId={s.id} allowNewsletter={s.allowNewsletter} />
            </div>
          ))}
        </div>
      )}

      <Eyebrow>From LGBTQ.UT</Eyebrow>
      <Card>
        <ToggleRow
          title="LGBTQ.UT announcements"
          sub="New resources and app news. A weekly digest, not per-listing."
          on={announcements}
          onChange={() => setAnnouncements(!announcements)} />
        <ToggleRow
          title="Crisis alerts"
          sub="Legislation and safety notices for Utah. Sent rarely and only when it matters."
          on={crisis}
          onChange={() => setCrisis(!crisis)}
          last />
      </Card>
      <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 14, textWrap: 'pretty' }}>
        Every alert is a push notification. The app holds no email address, so there is nowhere else to send them.
      </div>
    </div>
  )
}

// ------------------------------------------------------------- Account pane
//
// One account, many faces. The card at the top says what this account is;
// below it, each face the person has — a personal profile, and every page
// they run — gets its own row, so nobody has to remember which sign-in
// belongs to which identity. There is only ever one.

const TIERS = {
  anonymous: {
    title: 'Browsing as a guest',
    note: 'Search, save and alerts work without an account, but they live on this device only. Commenting, RSVPs, reviews, running a page and age-restricted listings need one.',
  },
  account: {
    title: 'Account',
    note: 'A private login and date of birth. Full participation — comments, RSVPs and reviews. Nothing about you is public until you add a profile.',
  },
  public: {
    title: 'Account',
    note: 'A private login and date of birth. What people see is chosen below.',
  },
}

function Avatar({ src, name, size = 44, color }: { src?: string | null; name: string; size?: number; color: string }) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{ width: size, height: size, borderRadius: 999, overflow: 'hidden', flex: 'none',
                  background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: font(700, size * 0.34, 1), color: '#fff' }}>
      {src ? <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

function AccountPane() {
  const nav = useNavigate()
  const data = useData()
  const {
    account, signedIn, age, hideAdult, setHideAdult,
    blocked, muted, unblock, unmute, accent, tint, refreshAccount,
  } = useStore()

  const tier = TIERS[account.tier]
  const pages = useMemo(() => resolveManaged(data, account.managed), [data, account.managed])
  const pending = account.requests.filter((r) => r.status === 'pending')
  const answered = account.requests.filter((r) => r.status !== 'pending').slice(0, 3)
  const showFinishSetup = signedIn && account.profileId && !isOnboarded(account.profileId)
    && !account.displayName && pages.length === 0 && account.requests.length === 0

  // The whole Age settings block is for signed-in adults only. A minor never
  // sees it, never sees it named, and is never told anything was filtered.
  const showAgeSettings = signedIn && age !== null && age >= 18
  const see18 = age !== null && age >= 18 && !hideAdult
  const see21 = age !== null && age >= 21 && !hideAdult

  const signOut = () => { void supabase.auth.signOut() }
  const myProfilePath = account.handle ? `/u/${encodeURIComponent(account.handle)}`
    : `/u/${encodeURIComponent(account.displayName ?? '')}`

  return (
    <div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ font: font(800, 18, 1.2), color: C.ink, letterSpacing: '-.01em' }}>{tier.title}</div>
        <div style={{ font: font(400, 12.5, 1.5), color: '#7C7871', marginTop: 7, textWrap: 'pretty' }}>
          {tier.note}
        </div>
        {account.username && (
          <div style={{ font: font(500, 12.5, 1.4), color: C.body, marginTop: 10, paddingTop: 10,
                        borderTop: `1px solid ${C.hairline}` }}>
            Signed in as {account.username} · private
          </div>
        )}
        {!signedIn && (
          <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <div className="tap" role="button" onClick={() => nav('/signin')}
                 style={{ borderRadius: 999, padding: '9px 20px', background: accent,
                          font: font(700, 13, 1.2), color: '#fff' }}>
              Create an account
            </div>
            <div className="tap" role="button" onClick={() => nav('/signin')}
                 style={{ borderRadius: 999, padding: '9px 20px', border: `1.5px solid ${C.border}`,
                          font: font(700, 13, 1.2), color: C.body }}>
              Sign in
            </div>
          </div>
        )}
      </div>

      {showFinishSetup && (
        <div className="tap" role="button" onClick={() => nav('/welcome')}
             style={{ marginTop: 14, background: tint, borderRadius: 14, padding: '13px 15px', display: 'flex',
                      alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: font(700, 14, 1.25), color: accent }}>Finish setting up</div>
            <div style={{ font: font(400, 12, 1.45), color: '#6E6A64', marginTop: 3, textWrap: 'pretty' }}>
              Add a profile, or ask to run a page for an organization, business or event series.
            </div>
          </div>
          <Chevron size={15} color={accent} />
        </div>
      )}

      {signedIn && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>You</Eyebrow>
          <Card>
            {account.displayName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                            borderBottom: `1px solid ${C.hairline}` }}>
                <Avatar src={account.avatarUrl} name={account.displayName} color={accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(700, 14.5, 1.25), color: '#1A1A18' }}>{account.displayName}</div>
                  <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3 }}>
                    Personal profile{account.handle ? ` · @${account.handle}` : ''}
                  </div>
                </div>
                <div className="tap" role="button" onClick={() => nav(myProfilePath)}
                     style={{ font: font(600, 12.5, 1.2), color: accent, flex: 'none' }}>View</div>
              </div>
            ) : (
              <div style={{ padding: '13px 14px', borderBottom: `1px solid ${C.hairline}` }}>
                <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>No personal profile yet</div>
                <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>
                  You can comment and RSVP without one; you appear as your login username. A profile gives
                  you a name, pronouns and a page people can follow.
                </div>
              </div>
            )}
            <LinkRow title={account.displayName ? 'Edit your personal profile' : 'Create a personal profile'}
                     sub="Name, pronouns, area, bio, links — and who can find it."
                     onClick={() => nav('/profile/edit')} last />
          </Card>
        </div>
      )}

      {signedIn && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>Pages you run</Eyebrow>
          {pages.length > 0 ? (
            <Card>
              {pages.map((p, i) => (
                <div key={`${p.kind}-${p.id}`}
                     style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                              borderBottom: i === pages.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: '#F0EDE8', flex: 'none' }}>
                    <Img src={p.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ font: font(600, 14, 1.25), color: '#1A1A18', minWidth: 0, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {p.verified && <Verified color={accent} />}
                    </div>
                    <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 2 }}>
                      {PAGE_KIND[p.kind].label} page · {p.role}
                    </div>
                  </div>
                  <div className="tap" role="button" onClick={() => nav(`/manage/${p.kind}/${p.id}`)}
                       style={{ borderRadius: 999, background: accent, color: '#fff', padding: '7px 14px',
                                font: font(700, 12, 1.2), flex: 'none' }}>Manage</div>
                </div>
              ))}
            </Card>
          ) : (
            <div style={{ font: font(400, 12.5, 1.5), color: C.muted, textWrap: 'pretty' }}>
              None yet. A page is an organization, business or event host you run — it has its own name and
              followers, and you post as it from this account.
            </div>
          )}

          {pending.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Card>
                {pending.map((r, i) => {
                  const d = describeRequest(data, r)
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                             borderBottom: i === pending.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: 999, background: '#D19A00', flex: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18' }}>{d.title}</div>
                        <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 2, textWrap: 'pretty' }}>{d.sub}</div>
                      </div>
                      <div className="tap" role="button"
                           onClick={() => { void withdrawPageRequest(r.id).then(refreshAccount) }}
                           style={{ font: font(600, 12, 1.2), color: C.faint, flex: 'none' }}>Withdraw</div>
                    </div>
                  )
                })}
              </Card>
            </div>
          )}

          {answered.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Card>
                {answered.map((r, i) => {
                  const d = describeRequest(data, r)
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                             borderBottom: i === answered.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: 999, flex: 'none',
                                    background: r.status === 'approved' ? C.success : C.danger }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: font(600, 13.5, 1.25), color: '#1A1A18' }}>{d.title}</div>
                        <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 2, textWrap: 'pretty' }}>{d.sub}</div>
                      </div>
                    </div>
                  )
                })}
              </Card>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <Card>
              <LinkRow title="Manage a page"
                       sub="Ask to run a listed organization or business, or add a new page."
                       onClick={() => nav('/apply')} last />
            </Card>
          </div>
        </div>
      )}

      {signedIn && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>Sign-in</Eyebrow>
          <Card>
            <LinkRow title="Sign out"
                     sub="Saved listings stay on this device."
                     onClick={signOut} last />
          </Card>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <Eyebrow>Blocked and muted</Eyebrow>
        {blocked.length + muted.length > 0 ? (
          <Card>
            {blocked.map((name) => (
              <div key={`b-${name}`}
                   style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                            borderBottom: `1px solid ${C.hairline}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Blocked entries show the name only — nothing else about them is surfaced. */}
                  <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>{name}</div>
                  <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3 }}>Blocked</div>
                </div>
                <div className="tap" role="button" onClick={() => unblock(name)}
                     style={{ borderRadius: 999, border: `1.5px solid ${C.border}`, padding: '7px 15px',
                              font: font(600, 12.5, 1.2), color: '#2A2A28', flex: 'none' }}>
                  Unblock
                </div>
              </div>
            ))}
            {muted.map((name, i) => (
              <div key={`m-${name}`}
                   style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                            borderBottom: i === muted.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>{name}</div>
                  <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3 }}>Muted</div>
                </div>
                <div className="tap" role="button" onClick={() => unmute(name)}
                     style={{ borderRadius: 999, border: `1.5px solid ${C.border}`, padding: '7px 15px',
                              font: font(600, 12.5, 1.2), color: '#2A2A28', flex: 'none' }}>
                  Unmute
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <div style={{ font: font(400, 12.5, 1.5), color: C.muted }}>
            You have not blocked or muted anyone.
          </div>
        )}
        <div style={{ font: font(400, 11.5, 1.5), color: '#8C887F', marginTop: 11, textWrap: 'pretty' }}>
          Muting collapses someone's comments and hides their reviews — they can still see you. Blocking works both
          ways: neither of you sees the other anywhere in the app, and you are still warned when they are going to an
          event you are viewing.
        </div>
      </div>

      {showAgeSettings && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>Age settings</Eyebrow>
          <Card>
            <ToggleRow
              title="Hide age-restricted listings"
              sub={age !== null && age < 21
                ? '18+ listings are showing. Bars and alcohol events stay hidden until you are 21.'
                : 'Bars, alcohol events and suggestive content stay out of your lists.'}
              on={hideAdult}
              onChange={() => setHideAdult(!hideAdult)}
              last />
          </Card>
          <div style={{ marginTop: 11 }}>
            <Card>
              {[
                { label: '18+ — Suggestive content', on: see18 },
                { label: '21+ — Alcohol, bars and clubs', on: see21 },
              ].map((b, i) => (
                <div key={b.label}
                     style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                              borderBottom: i === 0 ? `1px solid ${C.hairline}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0, font: font(600, 13.5, 1.3), color: '#1A1A18' }}>
                    {b.label}
                  </div>
                  <div style={{ flex: 'none', borderRadius: 999, padding: '4px 11px',
                                background: b.on ? C.successBg : C.fill,
                                font: font(700, 11, 1.3), color: b.on ? C.success : '#8C887F',
                                letterSpacing: '.04em' }}>
                    {b.on ? 'Visible' : 'Hidden'}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- shell

export default function Profile() {
  const [pane, setPane] = useState<Pane>('saved')
  const { saved, accent, account, signedIn } = useStore()
  const data = useData()

  const items = useMemo(() => (data ? resolveSaved(data, saved) : []), [data, saved])

  if (!data) return <div />

  return (
    <div>
      <ProfileHeader
        title={account.displayName ? account.displayName : 'Your Profile'}
        tagline={!signedIn ? 'Saved places, themes and settings.'
          : account.managed.length > 0
            ? `You and the ${account.managed.length === 1 ? 'page' : `${account.managed.length} pages`} you run, from one account.`
            : 'Saved places, your profile and settings.'} />

      <div style={{ padding: '0 16px 28px' }}>
        <div className="hs" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '2px 0 16px' }}>
          {PANES.map((p) => {
            const on = pane === p.key
            const count = p.key === 'saved' && items.length ? String(items.length) : ''
            return (
              <div key={p.key} className="tap" role="button" onClick={() => setPane(p.key)}
                   style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999,
                            padding: '8px 15px', border: `1.5px solid ${on ? accent : '#E7E3DD'}`,
                            background: on ? accent : '#fff', color: on ? '#fff' : C.body }}>
                <div style={{ font: font(600, 13, 1.2) }}>{p.label}</div>
                {count && (
                  <div style={{ borderRadius: 999, background: on ? 'rgba(255,255,255,.26)' : '#F1EFEB',
                                padding: '1px 7px', font: font(700, 10.5, 1.5),
                                color: on ? '#fff' : '#7C7871' }}>{count}</div>
                )}
              </div>
            )
          })}
        </div>

        {pane === 'saved' && <SavedPane items={items} />}
        {pane === 'themes' && <ThemesPane />}
        {pane === 'contribute' && <ContributePane />}
        {pane === 'alerts' && <AlertsPane items={items} />}
        {pane === 'account' && <AccountPane />}
      </div>
    </div>
  )
}
