import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { refreshData } from '../lib/data'
import { useData } from '../lib/useData'
import { useStore } from '../lib/store'
import { C } from '../lib/theme'
import { Empty, Img, SearchField, StickyBar, Tap, Toggle, font } from '../components/ui'
import { Chevron } from '../components/icons'

// Schema-driven console: every content table is described once below and the
// same list + editor render all of them. Access is gated client-side on
// `isAdmin` for UX, but the real enforcement is RLS — every write policy
// checks public.is_admin() server-side.

type FieldType =
  | 'text' | 'textarea' | 'number' | 'bool' | 'date'
  | 'list'   // text[] ↔ comma-separated input
  | 'json'   // jsonb  ↔ pretty-printed textarea
  | 'image'  // URL input + upload into the app-images bucket
  | 'select'
  | 'entity' // "kind:id" in the form ↔ entity_kind + entity_id (+ legacy host_id) columns

interface FieldDef {
  key: string
  label: string
  type: FieldType
  /** For selects: fixed options, or a directory to offer every entity from. */
  options?: { value: string; label: string }[] | 'hosts' | 'businesses' | 'resources'
  /** Used when the row has no value yet — a NOT NULL select must start on something. */
  defaultValue?: string
  hint?: string
}

interface EntityDef {
  table: string
  title: string
  singular: string
  /** bigserial PKs are generated — hide the id on create. */
  autoId?: boolean
  /** app-images folder that this entity's uploads land in. */
  imageFolder: string
  orderBy: string
  listTitle: (r: Record<string, unknown>) => string
  listSub?: (r: Record<string, unknown>) => string
  listImg?: (r: Record<string, unknown>) => string
  fields: FieldDef[]
}

const AGE_OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: '18+', label: '18+' },
  { value: '21+', label: '21+' },
]

const str = (v: unknown) => (v == null ? '' : String(v))

const ENTITIES: Record<string, EntityDef> = {
  events: {
    table: 'events', title: 'Events', singular: 'event', imageFolder: 'events', orderBy: 'starts_on',
    listTitle: (r) => str(r.name), listSub: (r) => str(r.date_label), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'organiser', label: 'Organiser', type: 'entity' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'starts_on', label: 'Date', type: 'date' },
      { key: 'date_label', label: 'Date label', type: 'text', hint: 'Shown on cards, e.g. "Fri Sep 12 · 7pm"' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'age_rating', label: 'Age rating', type: 'select', options: AGE_OPTIONS },
      { key: 'age_reason', label: 'Age reason', type: 'text' },
    ],
  },
  hosts: {
    table: 'hosts', title: 'Hosts', singular: 'host', imageFolder: 'hosts', orderBy: 'name',
    listTitle: (r) => str(r.name), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'bio', label: 'Bio', type: 'textarea' },
      { key: 'image_url', label: 'Avatar', type: 'image' },
      { key: 'header_url', label: 'Header image', type: 'image' },
      { key: 'verified', label: 'Verified', type: 'bool' },
      { key: 'linked_business_id', label: 'Linked business', type: 'select', options: 'businesses' },
      { key: 'linked_resource_id', label: 'Linked resource', type: 'select', options: 'resources' },
    ],
  },
  businesses: {
    table: 'businesses', title: 'Businesses', singular: 'business', imageFolder: 'businesses', orderBy: 'name',
    listTitle: (r) => str(r.name), listSub: (r) => str(r.county), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'county', label: 'County', type: 'text' },
      { key: 'image_url', label: 'Logo / card image', type: 'image' },
      { key: 'background_url', label: 'Background image', type: 'image' },
      { key: 'color', label: 'Brand color', type: 'text', hint: 'Hex, e.g. #7A2FA6' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'website', label: 'Website', type: 'text' },
      { key: 'telephone', label: 'Telephone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'map_url', label: 'Map URL', type: 'text' },
      { key: 'tags', label: 'Tags', type: 'list' },
      { key: 'rating', label: 'Rating', type: 'number' },
      { key: 'review_count', label: 'Review count', type: 'number' },
      { key: 'verified', label: 'Verified', type: 'bool' },
      { key: 'latitude', label: 'Latitude', type: 'number' },
      { key: 'longitude', label: 'Longitude', type: 'number' },
      { key: 'coupons', label: 'Coupons (JSON)', type: 'json', hint: '[{ "title", "terms", "code", "expires" }]' },
      { key: 'sections', label: 'Page sections (JSON)', type: 'json', hint: 'Max 2 of { title, sub, layout:{type,size,orient}, items:[...] }' },
      { key: 'age_rating', label: 'Age rating', type: 'select', options: AGE_OPTIONS },
      { key: 'age_reason', label: 'Age reason', type: 'text' },
    ],
  },
  resources: {
    table: 'resources', title: 'Resources', singular: 'resource', imageFolder: 'resources', orderBy: 'name',
    listTitle: (r) => str(r.name),
    listSub: (r) => [str(r.category), str(r.county)].filter(Boolean).join(' · '),
    listImg: (r) => str(r.image_url),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'county', label: 'Primary county', type: 'text' },
      { key: 'counties', label: 'Counties', type: 'list' },
      { key: 'communities', label: 'Communities', type: 'list' },
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'website', label: 'Website', type: 'text' },
      { key: 'telephone', label: 'Telephone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'facebook', label: 'Facebook', type: 'text' },
      { key: 'instagram', label: 'Instagram', type: 'text' },
      { key: 'verified', label: 'Verified', type: 'bool' },
      { key: 'age_rating', label: 'Age rating', type: 'select', options: AGE_OPTIONS },
      { key: 'age_reason', label: 'Age reason', type: 'text' },
    ],
  },
  'splash-tabs': {
    table: 'splash_tabs', title: 'Splash tabs', singular: 'splash tab', imageFolder: 'splash', orderBy: 'position',
    listTitle: (r) => str(r.name), listSub: (r) => str(r.subtitle), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'position', label: 'Position', type: 'number', hint: 'Home cards render in this order' },
    ],
  },
  'crisis-lines': {
    table: 'crisis_lines', title: 'Crisis lines', singular: 'crisis line', autoId: true,
    imageFolder: 'menu-cards', orderBy: 'position',
    listTitle: (r) => str(r.name), listSub: (r) => str(r.telephone),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'action_label', label: 'Action label', type: 'text', hint: 'Button text, e.g. "Call now"' },
      { key: 'telephone', label: 'Telephone', type: 'text' },
      { key: 'position', label: 'Position', type: 'number' },
    ],
  },
  'county-images': {
    table: 'county_images', title: 'County images', singular: 'county image',
    imageFolder: 'counties', orderBy: 'position',
    listTitle: (r) => str(r.id), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'position', label: 'Position', type: 'number' },
    ],
  },
  'community-images': {
    table: 'community_images', title: 'Community images', singular: 'community image',
    imageFolder: 'communities', orderBy: 'position',
    listTitle: (r) => str(r.id), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'position', label: 'Position', type: 'number' },
    ],
  },
  'category-images': {
    table: 'category_images', title: 'Category images', singular: 'category image',
    imageFolder: 'categories', orderBy: 'position',
    listTitle: (r) => str(r.id), listImg: (r) => str(r.image_url),
    fields: [
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'position', label: 'Position', type: 'number' },
    ],
  },
}

const slug = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// --------------------------------------------------------------- access gate

function Gate({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const { isAdmin, signedIn } = useStore()
  if (isAdmin) return <>{children}</>
  return (
    <>
      <StickyBar title="Admin" />
      <Empty>
        {signedIn
          ? 'This account does not have admin access.'
          : <span>You must be <span className="tap" role="button" onClick={() => nav('/signin')}
              style={{ textDecoration: 'underline', display: 'inline' }}>signed in</span> as an admin to manage content.</span>}
      </Empty>
    </>
  )
}

// ---------------------------------------------------------------------- hub

export default function Admin() {
  const nav = useNavigate()
  const data = useData()
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    void Promise.all(
      Object.entries(ENTITIES).map(async ([key, def]) => {
        const { count } = await supabase.from(def.table).select('*', { count: 'exact', head: true })
        return [key, count ?? 0] as const
      }),
    ).then((pairs) => { if (alive) setCounts(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [data])

  return (
    <Gate>
      <StickyBar title="Admin console" onBack={() => nav('/profile')} />
      <div style={{ padding: '14px 16px 6px', font: font(400, 13, 1.5), color: C.muted }}>
        Everything here writes straight to the live directory. Changes appear in the app immediately.
      </div>
      <div style={{ padding: '8px 16px 8px' }}>
        {Object.entries(ENTITIES).map(([key, def]) => (
          <Tap key={key} onClick={() => nav(`/admin/${key}`)}
               style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 2px',
                        borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(600, 15, 1.25), color: C.ink }}>{def.title}</div>
            </div>
            {counts[key] != null && (
              <span style={{ background: C.fill, borderRadius: 999, padding: '3px 10px',
                             font: font(600, 11.5, 1.3), color: C.body }}>{counts[key]}</span>
            )}
            <Chevron size={15} />
          </Tap>
        ))}
        <Tap onClick={() => nav('/upload')}
             style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 2px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: font(600, 15, 1.25), color: C.ink }}>Image manager</div>
            <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3 }}>
              Browse, upload and replace files in the app-images bucket.
            </div>
          </div>
          <Chevron size={15} />
        </Tap>
      </div>
    </Gate>
  )
}

// --------------------------------------------------------------------- list

export function AdminList() {
  const nav = useNavigate()
  const { kind = '' } = useParams()
  const { accent } = useStore()
  const def = ENTITIES[kind]
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!def) return
    let alive = true
    void supabase.from(def.table).select('*').order(def.orderBy).then(({ data, error }) => {
      if (!alive) return
      if (error) setError(error.message)
      else setRows(data ?? [])
    })
    return () => { alive = false }
  }, [def])

  if (!def) return <Empty>Unknown section.</Empty>

  const filtered = (rows ?? []).filter((r) =>
    def.listTitle(r).toLowerCase().includes(q.toLowerCase()))

  return (
    <Gate>
      <StickyBar
        title={def.title}
        onBack={() => nav('/admin')}
        right={
          <Tap onClick={() => nav(`/admin/${kind}/new`)}
               style={{ background: accent, color: '#fff', borderRadius: 999, padding: '7px 15px',
                        font: font(700, 12.5, 1.2) }}>
            + New
          </Tap>
        }
      />
      <SearchField value={q} onChange={setQ} placeholder={`Search ${def.title.toLowerCase()}…`} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {rows === null ? (
        <Empty>Loading…</Empty>
      ) : filtered.length === 0 ? (
        <Empty>No {def.title.toLowerCase()} yet.</Empty>
      ) : (
        <div style={{ paddingBottom: 40 }}>
          {filtered.map((r) => (
            <Tap key={String(r.id)} onClick={() => nav(`/admin/${kind}/${encodeURIComponent(String(r.id))}`)}
                 style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                          borderBottom: `1px solid ${C.hairline}` }}>
              {def.listImg && (
                <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flex: 'none',
                              background: C.fill }}>
                  {def.listImg(r) && <Img src={def.listImg(r)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: font(600, 14.5, 1.25), color: C.ink, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.listTitle(r)}</div>
                {def.listSub?.(r) && (
                  <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 3 }}>{def.listSub(r)}</div>
                )}
              </div>
              <Chevron size={15} />
            </Tap>
          ))}
        </div>
      )}
    </Gate>
  )
}

// ------------------------------------------------------------------- editor

type FormState = Record<string, string | boolean>

/** DB row → editable strings/booleans. */
function toForm(def: EntityDef, row: Record<string, unknown>): FormState {
  const f: FormState = {}
  for (const field of def.fields) {
    const v = row[field.key]
    if (field.type === 'bool') f[field.key] = v === true
    else if (field.type === 'entity') {
      f[field.key] = row.entity_kind && row.entity_id ? `${row.entity_kind}:${row.entity_id}` : ''
    }
    else if (field.type === 'list') f[field.key] = Array.isArray(v) ? v.join(', ') : ''
    else if (field.type === 'json') f[field.key] = v == null ? '' : JSON.stringify(v, null, 2)
    else if (v == null && field.defaultValue !== undefined) f[field.key] = field.defaultValue
    else f[field.key] = str(v)
  }
  return f
}

/** Editable form → DB payload. Throws with a readable message on bad JSON. */
function fromForm(def: EntityDef, f: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of def.fields) {
    const v = f[field.key]
    if (field.type === 'bool') out[field.key] = v === true
    else if (field.type === 'entity') {
      const [entityKind, ...rest] = String(v).split(':')
      const entityId = rest.join(':')
      if (!entityKind || !entityId) throw new Error(`Choose an ${field.label.toLowerCase()}.`)
      out.entity_kind = entityKind
      out.entity_id = entityId
      // Legacy readers still join on host_id.
      out.host_id = entityKind === 'host' ? entityId : null
    }
    else if (field.type === 'number') {
      const s = String(v).trim()
      out[field.key] = s === '' ? null : Number(s)
      if (s !== '' && Number.isNaN(out[field.key])) throw new Error(`${field.label} must be a number.`)
    } else if (field.type === 'list') {
      out[field.key] = String(v).split(',').map((x) => x.trim()).filter(Boolean)
    } else if (field.type === 'json') {
      const s = String(v).trim()
      if (s === '') { out[field.key] = [] } else {
        try { out[field.key] = JSON.parse(s) } catch { throw new Error(`${field.label} is not valid JSON.`) }
      }
    } else if (field.type === 'select' || field.type === 'date') {
      const s = String(v).trim()
      // A select carrying a defaultValue backs a NOT NULL column; fall back to
      // that rather than sending a null the constraint will reject.
      out[field.key] = s === '' ? (field.defaultValue ?? null) : s
    } else {
      out[field.key] = String(v)
    }
  }
  // Columns that started life NOT NULL DEFAULT '' shouldn't be sent null.
  for (const field of def.fields) {
    if (out[field.key] === null && field.type !== 'number' && field.type !== 'select' && field.type !== 'date') {
      out[field.key] = ''
    }
  }
  return out
}

export function AdminEditor() {
  const nav = useNavigate()
  const { kind = '', id } = useParams()
  const { accent } = useStore()
  const data = useData()
  const def = ENTITIES[kind]
  const isNew = id === undefined
  const [form, setForm] = useState<FormState | null>(isNew ? (def ? toForm(def, {}) : null) : null)
  const [rowId, setRowId] = useState(isNew ? '' : String(id))
  const [idTouched, setIdTouched] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!def || isNew) return
    let alive = true
    void supabase.from(def.table).select('*').eq('id', String(id)).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      if (error || !data) setError(error?.message ?? 'Row not found.')
      else setForm(toForm(def, data))
    })
    return () => { alive = false }
  }, [def, id, isNew])

  const set = useCallback((key: string, v: string | boolean) => {
    setForm((f) => (f ? { ...f, [key]: v } : f))
  }, [])

  // Directory-backed select options.
  const options = useMemo(() => ({
    hosts: (data?.hosts ?? []).map((h) => ({ value: h.id, label: h.name })),
    businesses: (data?.businesses ?? []).map((b) => ({ value: b.id, label: b.name })),
    resources: (data?.resources ?? []).map((r) => ({ value: r.id, label: r.name })),
  }), [data])

  if (!def) return <Empty>Unknown section.</Empty>

  const title = isNew ? `New ${def.singular}` : `Edit ${def.singular}`

  const save = async () => {
    if (!form) return
    setError(null)
    let payload: Record<string, unknown>
    try {
      payload = fromForm(def, form)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    if (!def.autoId) {
      const finalId = rowId.trim() || slug(String(form.name ?? ''))
      if (!finalId) { setError('An ID is required — give it a name first.'); return }
      payload.id = finalId
    } else if (!isNew) {
      payload.id = Number(id)
    }
    setBusy(true)
    const { error: dbErr } = isNew
      ? await supabase.from(def.table).insert(payload)
      : await supabase.from(def.table).update(payload).eq('id', def.autoId ? Number(id) : String(id))
    setBusy(false)
    if (dbErr) { setError(dbErr.message); return }
    void refreshData()
    nav(`/admin/${kind}`)
  }

  const remove = async () => {
    if (isNew) return
    if (!confirm(`Delete this ${def.singular}? This cannot be undone.`)) return
    setBusy(true)
    const { error: dbErr } = await supabase.from(def.table).delete()
      .eq('id', def.autoId ? Number(id) : String(id))
    setBusy(false)
    if (dbErr) { setError(dbErr.message); return }
    void refreshData()
    nav(`/admin/${kind}`)
  }

  return (
    <Gate>
      <StickyBar
        title={title}
        onBack={() => nav(`/admin/${kind}`)}
        right={
          <Tap onClick={busy ? undefined : () => void save()}
               style={{ background: accent, color: '#fff', borderRadius: 999, padding: '7px 15px',
                        font: font(700, 12.5, 1.2), opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save'}
          </Tap>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {form === null ? (
        <Empty>Loading…</Empty>
      ) : (
        <div style={{ padding: '14px 16px 44px' }}>
          {!def.autoId && (
            <Field label="ID" hint={isNew ? 'Auto-filled from the name; used in links.' : 'IDs cannot be changed.'}>
              <input
                value={idTouched || !isNew ? rowId : slug(String(form.name ?? ''))}
                onChange={(e) => { setIdTouched(true); setRowId(e.target.value) }}
                disabled={!isNew}
                style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }}
              />
            </Field>
          )}
          {def.fields.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <FieldInput field={field} value={form[field.key]} onChange={(v) => set(field.key, v)}
                          folder={def.imageFolder} options={options} />
            </Field>
          ))}
          {!isNew && (
            <button onClick={() => void remove()} disabled={busy}
                    style={{ marginTop: 18, width: '100%', border: 0, borderRadius: 12, padding: '13px 0',
                             background: C.dangerBg, color: C.danger, font: font(700, 14, 1.2), cursor: 'pointer' }}>
              Delete {def.singular}
            </button>
          )}
        </div>
      )}
    </Gate>
  )
}

// ------------------------------------------------------------- field pieces

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <div style={{ font: font(700, 11.5, 1.3), color: C.muted, textTransform: 'uppercase',
                    letterSpacing: '.07em', marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function FieldInput({ field, value, onChange, folder, options }: {
  field: FieldDef
  value: string | boolean
  onChange: (v: string | boolean) => void
  folder: string
  options: Record<'hosts' | 'businesses' | 'resources', { value: string; label: string }[]>
}) {
  const { accent } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  switch (field.type) {
    case 'bool':
      return <Toggle on={value === true} onChange={() => onChange(!(value === true))} />

    case 'textarea':
      return <textarea value={String(value)} onChange={(e) => onChange(e.target.value)}
                       rows={5} style={{ ...inputStyle, resize: 'vertical' }} />

    case 'json':
      return <textarea value={String(value)} onChange={(e) => onChange(e.target.value)}
                       rows={7} spellCheck={false}
                       style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />

    case 'date':
      return <input type="date" value={String(value)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />

    case 'number':
      return <input type="number" step="any" value={String(value)}
                    onChange={(e) => onChange(e.target.value)} style={inputStyle} />

    case 'select': {
      const opts = typeof field.options === 'string' ? options[field.options] : (field.options ?? [])
      const fixed = typeof field.options !== 'string'
      return (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {!fixed && <option value="">— none —</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }

    case 'entity':
      return (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          <option value="">— choose —</option>
          <optgroup label="Hosts">
            {options.hosts.map((o) => <option key={o.value} value={`host:${o.value}`}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Businesses">
            {options.businesses.map((o) => <option key={o.value} value={`business:${o.value}`}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Resources">
            {options.resources.map((o) => <option key={o.value} value={`resource:${o.value}`}>{o.label}</option>)}
          </optgroup>
        </select>
      )

    case 'image': {
      const upload = async (file: File) => {
        setUploading(true)
        setUploadErr(null)
        const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '-')}`
        const { error } = await supabase.storage.from('app-images').upload(path, file, {
          upsert: true, contentType: file.type,
        })
        setUploading(false)
        if (error) { setUploadErr(error.message); return }
        onChange(supabase.storage.from('app-images').getPublicUrl(path).data.publicUrl)
      }
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {String(value) && (
              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flex: 'none', background: C.fill }}>
                <Img src={String(value)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <input value={String(value)} onChange={(e) => onChange(e.target.value)}
                   placeholder="https://… or upload →" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    style={{ border: 0, borderRadius: 9, padding: '10px 13px', background: accent, color: '#fff',
                             font: font(700, 12, 1.2), cursor: 'pointer', flex: 'none' }}>
              {uploading ? '…' : 'Upload'}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                 style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          {uploadErr && <div style={{ font: font(500, 12, 1.4), color: C.danger, marginTop: 5 }}>{uploadErr}</div>}
        </div>
      )
    }

    default:
      return <input value={String(value)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
  }
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10,
                  background: C.dangerBg, color: C.danger, font: font(500, 13, 1.4) }}>
      {children}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 10,
  padding: '10px 12px', font: font(400, 14, 1.4), color: C.ink, background: '#fff', outline: 'none',
}
