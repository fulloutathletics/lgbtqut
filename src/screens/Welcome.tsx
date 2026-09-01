import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { PAGE_KIND } from '../lib/pages'
import { markOnboarded } from '../lib/onboarding'
import type { EntityKind } from '../lib/types'
import { font } from '../components/ui'
import { Button, ChoiceCard, ErrorBox, Field, FlowHeader, Note, Title } from '../components/form'
import { PageRequestForm } from '../components/PageRequestForm'

// Welcome — route `/welcome`. Runs once, right after sign-up.
//
// One account, many faces. The account is private: a login and a date of
// birth. What people see is chosen here — an optional personal profile, and
// any pages (organization, business, event host) the person wants to run.
// Someone can be all of these at once from one sign-in, and each is
// optional. Every step can be skipped and finished later from Profile.

type Intent = 'person' | EntityKind

const INTENTS: Array<{ key: Intent; label: string; sub: string }> = [
  {
    key: 'person', label: 'A profile for me',
    sub: 'Name, pronouns, a bio. Lets people follow you and see you at events. Optional — you can take part without one.',
  },
  {
    key: 'resource', label: 'I represent an organization',
    sub: PAGE_KIND.resource.blurb,
  },
  {
    key: 'business', label: 'I run a business',
    sub: PAGE_KIND.business.blurb,
  },
  {
    key: 'host', label: 'I host events',
    sub: 'Under my own name or a collective, not an organization or business listing.',
  },
]

type Step = { kind: 'intent' } | { kind: 'person' } | { kind: 'page'; page: EntityKind } | { kind: 'done' }


export default function Welcome() {
  const nav = useNavigate()
  const { account, signedIn, accent, tint, refreshAccount } = useStore()

  const [chosen, setChosen] = useState<Set<Intent>>(new Set(['person']))
  const [i, setI] = useState(0)
  const [filed, setFiled] = useState<EntityKind[]>([])

  // Personal profile draft
  const [displayName, setDisplayName] = useState(account.displayName ?? '')
  const [pronouns, setPronouns] = useState('')
  const [county, setCounty] = useState('')
  const [visibility, setVisibility] = useState<'visible' | 'discoverable'>('visible')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [personDone, setPersonDone] = useState<'created' | 'skipped' | null>(null)

  useEffect(() => {
    if (!signedIn && account.tier === 'anonymous') {
      // The store settles the session on first paint; only bounce once it has.
      const t = setTimeout(() => { if (!signedIn) nav('/signin', { replace: true }) }, 800)
      return () => clearTimeout(t)
    }
  }, [signedIn, account.tier, nav])

  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [{ kind: 'intent' }]
    if (chosen.has('person')) s.push({ kind: 'person' })
    for (const k of ['resource', 'business', 'host'] as EntityKind[]) {
      if (chosen.has(k)) s.push({ kind: 'page', page: k })
    }
    s.push({ kind: 'done' })
    return s
  }, [chosen])

  const step = steps[Math.min(i, steps.length - 1)]
  const next = () => setI((n) => Math.min(n + 1, steps.length - 1))
  const back = () => { if (i === 0) nav('/profile'); else setI((n) => n - 1) }

  const toggle = (k: Intent) => setChosen((prev) => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k); else s.add(k)
    return s
  })

  const savePerson = async () => {
    if (!displayName.trim()) { setError('A display name is what other people see. Add one, or skip this step.'); return }
    if (!account.profileId) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('social_profiles').upsert({
      id: account.profileId,
      display_name: displayName.trim(),
      pronouns: pronouns.trim() || null,
      county: county.trim() || null,
      visibility,
      search_visible: visibility === 'discoverable',
      recommendable: visibility === 'discoverable',
      updated_at: new Date().toISOString(),
    })
    setBusy(false)
    if (err) { setError('Could not save your profile. Try again.'); return }
    await refreshAccount()
    setPersonDone('created')
    next()
  }

  const finish = () => {
    if (account.profileId) markOnboarded(account.profileId)
    nav('/profile', { replace: true })
  }

  // Someone who represents an organization or business rarely needs a host
  // page too: events are posted from the listing itself.
  const hostRedundant = step.kind === 'page' && step.page === 'host' && (chosen.has('resource') || chosen.has('business'))

  const title = step.kind === 'intent' ? 'Welcome'
    : step.kind === 'person' ? 'Your profile'
    : step.kind === 'page' ? PAGE_KIND[step.page].label
    : 'All set'

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <FlowHeader title={title} onBack={back}
                  sub={step.kind === 'done' ? 'Ready' : `Step ${i + 1} of ${steps.length}`}
                  progress={{ at: i, of: steps.length }} />

      <div style={{ padding: '22px 16px 32px' }}>
        {step.kind === 'intent' && (
          <>
            <Title>How will you use LGBTQ.UT?</Title>
            <Note>
              Pick everything that fits. One sign-in covers all of it — you never juggle separate accounts,
              and each of these stays its own page with its own name.
            </Note>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              {INTENTS.map((it) => (
                <ChoiceCard key={it.key} multi label={it.label} sub={it.sub}
                            on={chosen.has(it.key)} onClick={() => toggle(it.key)} />
              ))}
            </div>
            <div style={{ font: font(400, 12, 1.55), color: C.faint, marginTop: 16, textWrap: 'pretty' }}>
              Choose nothing and you can still save places, follow pages, RSVP and comment. Everything here can
              be added later from Profile.
            </div>
            <Button style={{ marginTop: 22 }} onClick={next}>
              {chosen.size === 0 ? 'Skip — just browsing' : 'Continue'}
            </Button>
          </>
        )}

        {step.kind === 'person' && (
          <>
            <Title>Your personal profile</Title>
            <Note>
              This is you, not any page you run. It carries your name and pronouns on comments and RSVPs,
              and people can follow it. Your login and date of birth stay private either way.
            </Note>
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="What people call you"
                   hint="Can be a first name, a nickname, or anything you go by." />
            <Field label="Pronouns — optional" value={pronouns} onChange={setPronouns} placeholder="they/them" />
            <Field label="Area — optional" value={county} onChange={setCounty} placeholder="Weber County"
                   hint="A county or city, never an address." />

            <div style={{ marginTop: 20, font: font(700, 13, 1.2), color: '#2A2A28' }}>Who can find it</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <ChoiceCard label="Visible" on={visibility === 'visible'} onClick={() => setVisibility('visible')}
                          sub="People you interact with can open your profile. It does not appear in search." />
              <ChoiceCard label="Discoverable" on={visibility === 'discoverable'} onClick={() => setVisibility('discoverable')}
                          sub="Also appears in search and suggestions. You can change this any time." />
            </div>

            {error && <ErrorBox>{error}</ErrorBox>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              <Button onClick={() => void savePerson()} disabled={busy}>{busy ? 'Saving…' : 'Create my profile'}</Button>
              <Button secondary onClick={() => { setPersonDone('skipped'); next() }}>Skip for now</Button>
            </div>
          </>
        )}

        {step.kind === 'page' && (
          <>
            <Title>
              {step.page === 'resource' ? 'Which organization?'
                : step.page === 'business' ? 'Which business?'
                : 'Your host page'}
            </Title>
            <Note>
              {step.page === 'host'
                ? 'A host page is where your events live. It has its own name and followers, separate from your personal profile — people follow the events, not you.'
                : `Pages belong to the ${PAGE_KIND[step.page].label.toLowerCase()}, not to you, so several people can run one. A reviewer confirms you before anything changes.`}
            </Note>

            {hostRedundant && (
              <div style={{ marginTop: 16, borderRadius: 12, background: tint, padding: '12px 14px',
                            font: font(400, 12.5, 1.5), color: C.body, textWrap: 'pretty' }}>
                <span style={{ font: font(700, 12.5, 1.5), color: accent }}>You may not need this. </span>
                Events can be posted straight from an organization or business page, so only add a host page
                for things you run separately — a social, a hike, a series under your own name.
              </div>
            )}

            <PageRequestForm
              kind={step.page}
              onSubmitted={() => { setFiled((f) => [...f, step.page]); next() }}
              onSkip={next}
              skipLabel={hostRedundant ? 'Skip — I will post from my page' : 'Skip for now'} />
          </>
        )}

        {step.kind === 'done' && (
          <>
            <div style={{ width: 66, height: 66, borderRadius: 999, background: tint, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', margin: '8px auto 0' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4"
                   strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Title>You are in</Title>
            </div>
            <div style={{ marginTop: 18, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <Row title="Account" sub={`Signed in as ${account.username ?? 'you'}. Private.`} />
              <Row title="Personal profile"
                   sub={personDone === 'created' || account.displayName
                     ? `${account.displayName ?? displayName} — ${visibility === 'discoverable' ? 'discoverable' : 'visible to people you interact with'}`
                     : 'Not created. Add one any time from Profile → Account.'} />
              {filed.length > 0 && (
                <Row title={filed.length === 1 ? 'Page request' : 'Page requests'}
                     sub={`${filed.map((k) => PAGE_KIND[k].label).join(', ')} — a volunteer reviewer checks each one, usually within two business days. You will see the result in Profile.`} />
              )}
              <Row title="What you can do now" last
                   sub="Save places, follow pages and people, RSVP, comment, and see age-appropriate listings." />
            </div>
            <Button style={{ marginTop: 22 }} onClick={finish}>Go to my profile</Button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ title, sub, last }: { title: string; sub: string; last?: boolean }) {
  return (
    <div style={{ padding: '13px 14px', borderBottom: last ? 'none' : `1px solid ${C.hairline}` }}>
      <div style={{ font: font(600, 14, 1.25), color: '#1A1A18' }}>{title}</div>
      <div style={{ font: font(400, 12, 1.45), color: C.muted, marginTop: 3, textWrap: 'pretty' }}>{sub}</div>
    </div>
  )
}
