import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { entityHref, entityRef, eventsFor, patchItemField, refreshData } from '../lib/data'
import { PAGE_KIND } from '../lib/pages'
import type { AgeRating, AppData, AppEvent, EntityKind } from '../lib/types'
import { Img, font } from '../components/ui'
import { Button, Card, ErrorBox, Field, FlowHeader, Note, Title, labelStyle, fieldStyle } from '../components/form'

// ManagePage — route `/manage/:kind/:id`.
//
// The editing face of a page, for the people who administer it. One screen
// serves all three kinds: which columns are editable is a table, not a
// branch. Images are edited from the public page (the camera button), which
// keeps a single upload path. Verification is not here at all — a reviewer
// grants it, and the database refuses to let a page flip it on itself.

const TABLE: Record<EntityKind, 'resources' | 'businesses' | 'hosts'> = {
  resource: 'resources', business: 'businesses', host: 'hosts',
}

interface Col { key: string; label: string; multiline?: boolean; hint?: string; placeholder?: string }

const COLUMNS: Record<EntityKind, Col[]> = {
  host: [
    { key: 'name', label: 'Name' },
    { key: 'bio', label: 'About', multiline: true, hint: 'What you host, for whom, and where. Shown under your name.' },
  ],
  business: [
    { key: 'name', label: 'Name' },
    { key: 'address', label: 'Address', hint: 'Street address, or leave blank if online only.' },
    { key: 'website', label: 'Website' },
    { key: 'telephone', label: 'Telephone' },
    { key: 'email', label: 'Public email', hint: 'Shown on the listing. Not your account email.' },
  ],
  resource: [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description', multiline: true },
    { key: 'website', label: 'Website' },
    { key: 'telephone', label: 'Telephone or hotline' },
    { key: 'email', label: 'Public email', hint: 'Shown on the listing. Not your account email.' },
    { key: 'address', label: 'Address' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
  ],
}

function rowFor(data: AppData, kind: EntityKind, id: string): Record<string, unknown> | null {
  const list = kind === 'resource' ? data.resources : kind === 'business' ? data.businesses : data.hosts
  return (list as unknown as Array<Record<string, unknown>>).find((x) => x.id === id) ?? null
}

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export default function ManagePage() {
  const { kind: kindParam = '', id = '' } = useParams<{ kind: string; id: string }>()
  const kind = (['resource', 'business', 'host'].includes(kindParam) ? kindParam : null) as EntityKind | null
  const nav = useNavigate()
  const data = useData()
  const { administers, signedIn, accent, tint } = useStore()

  const row = useMemo(() => (data && kind ? rowFor(data, kind, id) : null), [data, kind, id])
  const cols = kind ? COLUMNS[kind] : []

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!row) return
    const d: Record<string, string> = {}
    for (const c of cols) d[c.key] = String(row[c.key] ?? '')
    setDraft(d)
  // The draft is seeded once per page; later cache refreshes must not clobber typing.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id])

  if (!data || !kind) return <div />

  const allowed = signedIn && administers(kind, id)
  const ref = entityRef(data, kind, id)

  if (!ref || !allowed) {
    return (
      <div style={{ minHeight: '100%', background: '#fff' }}>
        <FlowHeader title="Manage" onBack={() => nav(-1)} />
        <div style={{ padding: '22px 16px' }}>
          <Title>{!ref ? 'That page is no longer listed.' : 'You do not manage this page.'}</Title>
          {ref && (
            <Note>Only people a reviewer has confirmed can edit it. You can ask for access from Profile → Account.</Note>
          )}
        </div>
      </div>
    )
  }

  const dirty = cols.some((c) => draft[c.key] !== String(row?.[c.key] ?? ''))

  const save = async () => {
    if (!dirty) return
    setBusy(true)
    setError('')
    const patch: Record<string, string> = {}
    for (const c of cols) if (draft[c.key] !== String(row?.[c.key] ?? '')) patch[c.key] = draft[c.key].trim()
    const { error: err } = await supabase.from(TABLE[kind]).update(patch).eq('id', id)
    setBusy(false)
    if (err) { setError('Could not save. Check your connection and try again.'); return }
    for (const [col, v] of Object.entries(patch)) patchItemField(TABLE[kind], id, col, v)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <FlowHeader title={ref.name} sub={`${PAGE_KIND[kind].label} page · you manage this`} onBack={() => nav(-1)} />

      <div style={{ padding: '18px 16px 32px' }}>
        <div className="tap" role="button" onClick={() => nav(entityHref(ref))}
             style={{ display: 'flex', alignItems: 'center', gap: 12, background: tint, borderRadius: 12,
                      padding: '11px 13px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: '#EFEDE9', flex: 'none' }}>
            <Img src={ref.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: font(700, 13.5, 1.25), color: accent }}>View the public page</div>
            <div style={{ font: font(400, 11.5, 1.4), color: '#6E6A64', marginTop: 2 }}>
              Photos are changed there, with the camera button.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <Title>Details</Title>
          {cols.map((c) => (
            <Field key={c.key} label={c.label} value={draft[c.key] ?? ''} multiline={c.multiline} rows={5}
                   hint={c.hint} placeholder={c.placeholder}
                   onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />
          ))}
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button style={{ marginTop: 20 }} disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </Button>
          <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 12, textWrap: 'pretty' }}>
            The verified badge is granted by a reviewer and cannot be set here.
          </div>
        </div>

        <EventsEditor kind={kind} id={id} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ events

function EventsEditor({ kind, id }: { kind: EntityKind; id: string }) {
  const data = useData()
  const nav = useNavigate()
  const { accent } = useStore()
  const events = eventsFor(data, kind, id)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [desc, setDesc] = useState('')
  const [age, setAge] = useState<AgeRating>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = name.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const add = async () => {
    if (!ready) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('events').insert({
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      entity_kind: kind,
      entity_id: id,
      // Legacy readers still join on host_id; keep it pointed at the host face when there is one.
      host_id: kind === 'host' ? id : null,
      name: name.trim(),
      starts_on: date,
      date_label: dateLabel(date),
      description: desc.trim(),
      age_rating: age,
    })
    setBusy(false)
    if (err) { setError('Could not add the event. Try again.'); return }
    await refreshData()
    setName(''); setDate(''); setDesc(''); setAge(null); setOpen(false)
  }

  const remove = async (e: AppEvent) => {
    if (!window.confirm(`Remove “${e.name}”? People who RSVP’d will no longer see it.`)) return
    await supabase.from('events').delete().eq('id', e.id)
    await refreshData()
  }

  return (
    <div style={{ marginTop: 32 }}>
      <Title>Events</Title>
      <Note style={{ marginTop: 6 }}>
        Posted under this page’s name. Followers who keep the Events channel on hear about each one.
      </Note>

      {events.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Card>
            {events.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                       borderBottom: i === events.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                <div className="tap" role="button" onClick={() => nav(`/event/${e.id}`)} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 14, 1.25), color: '#1A1A18', textWrap: 'pretty' }}>{e.name}</div>
                  <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3 }}>{e.date_label}</div>
                </div>
                <div className="tap" role="button" onClick={() => void remove(e)}
                     style={{ font: font(600, 12.5, 1.2), color: C.danger, flex: 'none' }}>Remove</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {!open ? (
        <Button secondary style={{ marginTop: 14 }} onClick={() => setOpen(true)}>Add an event</Button>
      ) : (
        <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 14, padding: '4px 14px 16px' }}>
          <Field label="Event name" value={name} onChange={setName} placeholder="Trans Night at the Library" />
          <Field label="Date" type="date" value={date} onChange={setDate} />
          <Field label="Details" value={desc} onChange={setDesc} multiline rows={4}
                 placeholder="Where, when it starts, who it is for, and anything people should bring." />
          <div style={{ marginTop: 16 }}>
            <div style={labelStyle}>Age rating</div>
            <select value={age ?? ''} onChange={(e) => setAge((e.target.value || null) as AgeRating)}
                    style={{ ...fieldStyle, appearance: 'none' }}>
              <option value="">All ages</option>
              <option value="18+">18+ — suggestive content</option>
              <option value="21+">21+ — alcohol, bars and clubs</option>
            </select>
            <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
              Rated events are hidden from anyone under the threshold, and from adults who opted out.
            </div>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Button secondary style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</Button>
            <Button style={{ flex: 1, background: ready && !busy ? accent : undefined }} disabled={!ready || busy}
                    onClick={() => void add()}>{busy ? 'Adding…' : 'Add event'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
