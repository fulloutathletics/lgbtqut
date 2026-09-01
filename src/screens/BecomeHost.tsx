import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { PAGE_KIND } from '../lib/pages'
import type { EntityKind } from '../lib/types'
import { font } from '../components/ui'
import { Button, ChoiceCard, FlowHeader, Note, Title } from '../components/form'
import { PageRequestForm } from '../components/PageRequestForm'

// Manage a page — route `/apply` (the old "Become a host" entry point).
//
// Any signed-in person can ask to run a page: an organization listed under
// Resources, a business on Shop Queer, or an event host. Listings cannot be
// self-claimed — this files a request and a reviewer confirms it. Accepts
// `?kind=host` to skip the first question.

const KINDS: EntityKind[] = ['resource', 'business', 'host']

export default function BecomeHost() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { signedIn, accent, tint } = useStore()

  const preset = params.get('kind') as EntityKind | null
  const [kind, setKind] = useState<EntityKind | null>(KINDS.includes(preset as EntityKind) ? preset : null)
  const [stage, setStage] = useState<'kind' | 'form' | 'done'>(kind ? 'form' : 'kind')

  if (!signedIn) {
    return (
      <div style={{ minHeight: '100%', background: '#fff' }}>
        <FlowHeader title="Manage a page" onBack={() => nav(-1)} />
        <div style={{ padding: '22px 16px 32px' }}>
          <Title>Sign in first</Title>
          <Note>
            A page is tied to the account that runs it, so you need one before asking for access. Creating an
            account takes a minute and nothing about you is public unless you choose it.
          </Note>
          <Button style={{ marginTop: 22 }} onClick={() => nav('/signin')}>Sign in or create an account</Button>
        </div>
      </div>
    )
  }

  const back = () => {
    if (stage === 'form' && !preset) setStage('kind')
    else nav(-1)
  }

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <FlowHeader title="Manage a page" onBack={back}
                  sub={stage === 'done' ? 'Submitted' : stage === 'kind' ? 'What kind of page?' : PAGE_KIND[kind!].label} />

      <div style={{ padding: '22px 16px 32px' }}>
        {stage === 'kind' && (
          <>
            <Title>What do you want to run?</Title>
            <Note>
              A page has its own name, followers and events, separate from your personal profile. You can run
              more than one from this account, and other people can help run the same page.
            </Note>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              {KINDS.map((k) => (
                <ChoiceCard key={k} label={PAGE_KIND[k].label} sub={PAGE_KIND[k].blurb}
                            on={kind === k} onClick={() => setKind(k)} />
              ))}
            </div>
            <div style={{ marginTop: 16, borderRadius: 12, background: tint, padding: '12px 14px',
                          font: font(400, 12.5, 1.5), color: C.body, textWrap: 'pretty' }}>
              <span style={{ font: font(700, 12.5, 1.5), color: accent }}>Hosting events? </span>
              An organization or business posts events from its own page. Only pick “Event host” for things you
              run outside of one.
            </div>
            <Button style={{ marginTop: 22 }} disabled={!kind} onClick={() => setStage('form')}>Continue</Button>
          </>
        )}

        {stage === 'form' && kind && (
          <>
            <Title>{kind === 'host' ? 'Your host page' : `Which ${PAGE_KIND[kind].label.toLowerCase()}?`}</Title>
            <Note>Listings are never claimed by whoever asks first. A volunteer reviewer checks every request.</Note>
            <PageRequestForm kind={kind} onSubmitted={() => setStage('done')} />
          </>
        )}

        {stage === 'done' && (
          <>
            <div style={{ width: 66, height: 66, borderRadius: 999, background: tint, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', margin: '8px auto 0' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" />
              </svg>
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}><Title>Sent for review</Title></div>
            <Note style={{ textAlign: 'center' }}>
              A volunteer reviewer checks that you represent the page and that the listing belongs in the
              directory. Most requests are answered within two business days. Its status shows under
              Profile → Account until then.
            </Note>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              <Button onClick={() => nav('/profile')}>Back to your profile</Button>
              <Button secondary onClick={() => { setKind(null); setStage('kind') }}>Ask for another page</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
