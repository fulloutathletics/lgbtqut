import { useMemo, useState } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { PAGE_KIND, managesPage, searchPages, submitPageRequest } from '../lib/pages'
import type { EntityKind, EntityRef } from '../lib/types'
import { Verified } from './icons'
import { Img, SearchField, font } from './ui'
import { Button, ChoiceCard, ErrorBox, Field } from './form'

// Asks to manage one page. Two shapes behind one form:
//   claim — the listing already exists; the person says which and offers proof.
//   new   — nothing is listed yet; they name it and a reviewer creates it.
// Listings are never self-claimed: this only ever files a request.

type Mode = 'claim' | 'new'

export function PageRequestForm({ kind, onSubmitted, onSkip, skipLabel = 'Skip for now' }: {
  kind: EntityKind
  onSubmitted: () => void
  onSkip?: () => void
  skipLabel?: string
}) {
  const data = useData()
  const { accent, tint, account, refreshAccount } = useStore()
  const meta = PAGE_KIND[kind]

  const [mode, setMode] = useState<Mode | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<EntityRef | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [proof, setProof] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const results = useMemo(() => {
    if (!data || mode !== 'claim') return []
    const q = query.trim()
    if (!q) return []
    return searchPages(data, q, kind).slice(0, 8)
  }, [data, mode, query, kind])

  const alreadyMine = picked ? managesPage(account.managed, picked.kind, picked.id) : false
  const alreadyAsked = picked
    ? account.requests.some((r) => r.status === 'pending' && r.entity_kind === picked.kind && r.entity_id === picked.id)
    : false

  const ready = mode === 'claim'
    ? !!picked && !alreadyMine && !alreadyAsked && proof.trim().length > 0
    : mode === 'new'
      ? name.trim().length > 1 && proof.trim().length > 0
      : false

  const submit = async () => {
    if (!ready || !account.profileId) return
    setBusy(true)
    setError('')
    const err = await submitPageRequest(account.profileId, mode === 'claim'
      ? { kind, entityId: picked!.id, proposedName: picked!.name, proof, contact }
      : { kind, proposedName: name, proposedBio: bio, proof, contact })
    setBusy(false)
    if (err) {
      setError('Could not send your request. Try again in a moment.')
      return
    }
    await refreshAccount()
    onSubmitted()
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        <ChoiceCard label={`It is already listed`} on={mode === 'claim'}
                    onClick={() => { setMode('claim'); setError('') }}
                    sub={`Find the ${meta.label.toLowerCase()} in the directory and ask to manage its page.`} />
        <ChoiceCard label="It is not listed yet" on={mode === 'new'}
                    onClick={() => { setMode('new'); setPicked(null); setError('') }}
                    sub={`Propose a new ${meta.label.toLowerCase()} page. A reviewer adds it and hands you the keys.`} />
      </div>

      {mode === 'claim' && (
        <div style={{ marginTop: 18 }}>
          {picked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${accent}`,
                          borderRadius: 13, padding: '11px 13px', background: tint }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: '#EFEDE9', flex: 'none' }}>
                <Img src={picked.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ font: font(700, 14.5, 1.25), color: C.ink, minWidth: 0, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.name}</div>
                  {picked.verified && <Verified color={accent} />}
                </div>
                <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 2 }}>{meta.label}</div>
              </div>
              <div className="tap" role="button" onClick={() => { setPicked(null); setQuery('') }}
                   style={{ font: font(600, 12.5, 1.2), color: accent, flex: 'none' }}>Change</div>
            </div>
          ) : (
            <>
              <div style={{ margin: '0 -16px' }}>
                <SearchField value={query} onChange={setQuery} placeholder={`Search ${meta.plural.toLowerCase()}`} />
              </div>
              {query.trim() && results.length === 0 && (
                <div style={{ font: font(400, 13, 1.5), color: C.muted, padding: '14px 2px', textWrap: 'pretty' }}>
                  Nothing by that name. If it is not in the directory yet, choose “It is not listed yet” above.
                </div>
              )}
              {results.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="tap" role="button" onClick={() => setPicked(r)}
                     style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px',
                              borderBottom: `1px solid ${C.hairline}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: '#EFEDE9', flex: 'none' }}>
                    <Img src={r.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ font: font(600, 14, 1.25), color: C.ink, minWidth: 0, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    {r.verified && <Verified color={accent} />}
                  </div>
                </div>
              ))}
            </>
          )}

          {alreadyMine && (
            <div style={{ marginTop: 12, font: font(500, 12.5, 1.5), color: C.muted }}>
              You already manage this page.
            </div>
          )}
          {alreadyAsked && (
            <div style={{ marginTop: 12, font: font(500, 12.5, 1.5), color: C.muted }}>
              You have already asked for this page. It is waiting on a reviewer.
            </div>
          )}
        </div>
      )}

      {mode === 'new' && (
        <>
          <Field label={`${meta.label} name`} value={name} onChange={setName}
                 placeholder={kind === 'host' ? 'e.g. Ogden Queer Hikes' : 'Name'} hint={meta.proposeHint} />
          <Field label="One line about it" value={bio} onChange={setBio} multiline rows={2}
                 placeholder={kind === 'host' ? 'What you host and where' : 'What it is, in a sentence'} />
        </>
      )}

      {mode && !alreadyMine && !alreadyAsked && (
        <>
          <Field label="How can a reviewer confirm you?" value={proof} onChange={setProof} multiline rows={3}
                 placeholder={mode === 'claim'
                   ? 'A staff page that names you, an email from the organization’s domain, a social account you run…'
                   : 'A link to a flyer, an Instagram account, a website — anything that shows this is real.'}
                 hint="Reviewers are volunteers and check every request by hand. Whatever you write here is seen only by them." />
          <Field label="Best way to reach you — optional" value={contact} onChange={setContact}
                 placeholder="An email or handle a reviewer can reply to"
                 hint="Your account has no email on file that reviewers can see, so this is how they reach you with questions." />
        </>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        <Button onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? 'Sending…' : 'Send for review'}
        </Button>
        {onSkip && <Button secondary onClick={onSkip}>{skipLabel}</Button>}
      </div>
    </div>
  )
}
