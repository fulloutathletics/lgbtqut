import { supabase } from './supabase'
import type { AppData } from './types'

// The content tables are static enough to cache aggressively, so the whole
// directory is fetched once. If the tables are missing or empty — which they
// are until `supabase/seed.sql` has been run — fall back to the bundled export
// so the app is still usable. Events, comments, polls and RSVP counts are the
// live surfaces and are fetched separately.

let cache: Promise<AppData> | null = null

async function fromSupabase(): Promise<AppData | null> {
  const [tabs, resources, businesses, hosts, events, crisis] = await Promise.all([
    supabase.from('splash_tabs').select('*').order('position'),
    supabase.from('resources').select('*'),
    supabase.from('businesses').select('*'),
    supabase.from('hosts').select('*'),
    supabase.from('events').select('*').order('starts_on'),
    supabase.from('crisis_lines').select('*').order('position'),
  ])

  const failed = [tabs, resources, businesses, hosts, events, crisis].some((r) => r.error)
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
    countyImages: await countyImages(),
  } as AppData
}

// County artwork lives with the seed rather than the DB — it is presentation,
// not content, and the six images are client-supplied fixtures.
async function countyImages(): Promise<Record<string, string>> {
  const seed = await fromBundle()
  return seed.countyImages
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

export const imgSrc = (url?: string) => url || PLACEHOLDER

/**
 * Build a public URL for an image stored in the Supabase "app-images" bucket.
 * Pass the folder path within the bucket, e.g. storageUrl('splash/crisis.png').
 */
export function storageUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/storage/v1/object/public/app-images/${path}`
}

/** Mix a hex color with white at the given alpha, for tints and dashed borders. */
export function alpha(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
