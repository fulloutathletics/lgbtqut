import { supabase } from './supabase'
import { OPTIMIZED } from './optimizedImages'
import type { AppData, AppEvent, EntityKind, EntityRef } from './types'

// The content tables are static enough to cache aggressively, so the whole
// directory is fetched once. If the tables are missing or empty — which they
// are until `supabase/seed.sql` has been run — fall back to the bundled export
// so the app is still usable. Events, comments, polls and RSVP counts are the
// live surfaces and are fetched separately.

let cache: Promise<AppData> | null = null

async function fromSupabase(): Promise<AppData | null> {
  const [tabs, resources, businesses, hosts, events, crisis, counties, communities, categories] = await Promise.all([
    supabase.from('splash_tabs').select('*').order('position'),
    supabase.from('resources').select('*'),
    supabase.from('businesses').select('*'),
    supabase.from('hosts').select('*'),
    supabase.from('events').select('*').order('starts_on'),
    supabase.from('crisis_lines').select('*').order('position'),
    supabase.from('county_images').select('*').order('position'),
    supabase.from('community_images').select('*').order('position'),
    supabase.from('category_images').select('*').order('position'),
  ])

  const failed = [tabs, resources, businesses, hosts, events, crisis, counties, communities, categories].some((r) => r.error)
  if (failed || !resources.data?.length) return null

  return {
    tabs: tabs.data ?? [],
    resources: resources.data ?? [],
    businesses: businesses.data ?? [],
    hosts: hosts.data ?? [],
    events: events.data ?? [],
    crisis: (crisis.data ?? []).map((c: Record<string, string>) => ({
      name: c.name, desc: c.description, action: c.action_label, tel: c.telephone,
    })),
    countyImages: imageMap(counties.data ?? []),
    communityImages: imageMap(communities.data ?? []),
    categoryImages: imageMap(categories.data ?? []),
  } as AppData
}

// Builds a name→url map from a table of { id, image_url } rows. Rows with
// empty URLs are included so the editor can patch them; the UI falls back
// to a color swatch when the URL is falsy.
function imageMap(rows: Array<{ id: string; image_url: string }>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) map[row.id] = row.image_url
  return map
}

let bundle: Promise<AppData> | null = null
function fromBundle(): Promise<AppData> {
  bundle ??= fetch('/data/seed.json').then((r) => r.json())
  return bundle
}

// Nothing blocks on the network to paint. The bundled copy is local and
// resolves in milliseconds, so it renders first; the Supabase read runs
// alongside it and swaps in whenever it lands. An unreachable project costs
// nothing, which matters — this app is how someone finds a crisis line, and it
// must not hold a blank screen while a request times out.

let current: AppData | null = null
const listeners = new Set<() => void>()
let started = false

function publish(next: AppData, live: boolean) {
  // Live data always wins; the bundle only fills an empty slot.
  if (!live && current) return
  current = next
  for (const fn of listeners) fn()
}

function start() {
  if (started) return
  started = true
  void fromBundle().then((d) => publish(d, false)).catch(() => {})
  void fromSupabase().then((d) => { if (d) publish(d, true) }).catch(() => {})
}

/** Current directory, or null until the first copy lands (a tick or two). */
export function getData(): AppData | null {
  start()
  return current
}

export function subscribeData(fn: () => void): () => void {
  start()
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const TABLE_KEY: Record<string, keyof AppData> = {
  splash_tabs: 'tabs', resources: 'resources', businesses: 'businesses', hosts: 'hosts', events: 'events',
}

/**
 * Reflects a direct table write (the inline image editor) into the live
 * cache immediately, so every screen re-renders with the new URL without
 * waiting on a refetch.
 */
export function patchItemField(table: string, id: string, column: string, value: string) {
  if (!current) return

  // county/community/category images are maps keyed by name, not arrays — patch directly.
  if (table === 'county_images') {
    publish({ ...current, countyImages: { ...current.countyImages, [id]: value } } as AppData, true)
    return
  }
  if (table === 'community_images') {
    publish({ ...current, communityImages: { ...current.communityImages, [id]: value } } as AppData, true)
    return
  }
  if (table === 'category_images') {
    publish({ ...current, categoryImages: { ...current.categoryImages, [id]: value } } as AppData, true)
    return
  }

  const key = TABLE_KEY[table]
  if (!key) return
  const list = current[key] as unknown as Array<Record<string, unknown>>
  publish({ ...current, [key]: list.map((item) => (item.id === id ? { ...item, [column]: value } : item)) } as AppData, true)
}

/**
 * Re-reads the directory after a write the session made itself (a page
 * edited, an event added). Cheap enough to call per save: the tables are
 * small, and the alternative is a page that shows stale copy until reload.
 */
export async function refreshData(): Promise<void> {
  try {
    const d = await fromSupabase()
    if (d) publish(d, true)
  } catch { /* offline: the cache keeps whatever it had */ }
}

/** Promise form, for callers outside React. */
export function loadData(): Promise<AppData> {
  cache ??= new Promise<AppData>((resolve) => {
    const existing = getData()
    if (existing) return resolve(existing)
    const off = subscribeData(() => {
      const d = getData()
      if (d) { off(); resolve(d) }
    })
  })
  return cache
}

// ------------------------------------------------------------- derivations

export const alphabetical = <T extends { name: string }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => a.name.localeCompare(b.name))

/** Toll-free numbers are labeled "Hotline" rather than "Telephone". */
export const isHotline = (tel: string) =>
  /^(\+?1[\s\-.]?)?\(?(800|833|844|855|866|877|888)\)?/.test(tel.trim()) || /^\d{3}$/.test(tel.trim())

export const telHref = (tel: string) => `tel:${tel.replace(/[^\d+]/g, '')}`
export const mapHref = (addr: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
export const webHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/** Hatched placeholder used wherever an image is missing or fails to load. */
export const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23E9E5DF'/%3E%3Cpath d='M-10 10 L10 -10 M0 40 L40 0 M30 50 L50 30' stroke='%23E2DDD6' stroke-width='7'/%3E%3C/svg%3E"

/**
 * A 32-bit FNV-1a hash as 8 hex characters — the same function, character for
 * character, as the one in scripts/optimize-images.mjs. It has to be
 * synchronous (SubtleCrypto is not) because this runs during render.
 */
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// Called once per image per render, and a list screen paints 150 of them on
// every keystroke in the search field. Hashing the same handful of URLs over
// and over is wasted work, so each answer is kept.
const resolved = new Map<string, string>()

/**
 * The URL to actually load an image from.
 *
 * Most of the directory's artwork is a full-size original on a host we don't
 * control, sized for nothing in particular — several splash cards were over a
 * megabyte for a 240px slot. `npm run optimize:images` re-encodes what it can
 * reach into public/images/opt/ and records which URLs it covered; anything in
 * that manifest is served from our own origin instead, which skips a
 * third-party DNS lookup and TLS handshake as well as the bytes.
 *
 * A URL with no local copy — a picture an admin swapped since the last run, or
 * one on a host the optimizer couldn't reach — is returned untouched and loads
 * exactly as it does today. The manifest is a cache, not a source of truth, so
 * it can go stale without breaking anything.
 */
export function imgSrc(url?: string): string {
  if (!url) return PLACEHOLDER
  const hit = resolved.get(url)
  if (hit) return hit

  const local = OPTIMIZED[fnv1a(url)]
  const src = local ? `/images/opt/${local}.webp` : url
  resolved.set(url, src)
  return src
}

/**
 * Build a public URL for an image stored in the Supabase "app-images" bucket.
 * Pass the folder path within the bucket, e.g. storageUrl('splash/crisis.png').
 */
export function storageUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/storage/v1/object/public/app-images/${path}`
}

// ------------------------------------------------------- entity resolution
//
// A resource, business and host are three faces of one organisation. Content
// (events, posts) names its owner as (kind, id); which face a reader sees is
// decided by where they entered from, not by which table the row lives in.

/** The shared profile behind whichever face was addressed, or null if unknown. */
export function entityRef(data: AppData | null, kind: EntityKind | null, id: string | null): EntityRef | null {
  if (!data || !kind || !id) return null
  if (kind === 'resource') {
    const r = data.resources.find((x) => x.id === id)
    return r ? { kind, id, name: r.name, image_url: r.image_url, verified: r.verified } : null
  }
  if (kind === 'business') {
    const b = data.businesses.find((x) => x.id === id)
    return b ? { kind, id, name: b.name, image_url: b.image_url, verified: b.verified } : null
  }
  const h = data.hosts.find((x) => x.id === id)
  return h ? { kind, id, name: h.name, image_url: h.image_url, verified: h.verified } : null
}

/** Route for an entity's own page, per face. */
export const entityHref = (ref: EntityRef) =>
  ref.kind === 'resource' ? `/resource/${ref.id}`
  : ref.kind === 'business' ? `/business/${ref.id}`
  : `/host/${ref.id}`

/** Upcoming-first events this entity organises, whichever face you came in by. */
export function eventsFor(data: AppData | null, kind: EntityKind, id: string): AppEvent[] {
  if (!data) return []
  return data.events
    .filter((e) => (e.entity_kind ? e.entity_kind === kind && e.entity_id === id : e.host_id === id))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
}

/** Mix a hex color with white at the given alpha, for tints and dashed borders. */
export function alpha(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
