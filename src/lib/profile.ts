import { supabase } from './supabase'
import { C } from './theme'

// The personal profile: what it can say, what it may show, and what makes
// it adults-only. The database owns the rules (see the
// profile_media_and_adult_profiles migration); this module mirrors the parts
// the editor needs so it can warn a person before they save, not after.

// ------------------------------------------------------------- choices

export const PRONOUN_OPTIONS = [
  'she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns', 'ask me',
]

export const IDENTITY_OPTIONS = [
  'Lesbian', 'Gay', 'Bi', 'Pan', 'Trans', 'Nonbinary', 'Queer', 'Ace', 'Aro',
  'Intersex', 'Two-Spirit', 'Questioning', 'Ally', 'Parent',
]

export const INTEREST_OPTIONS = [
  'Hiking', 'Climbing', 'Skiing', 'Board games', 'Book club', 'Live music', 'Drag',
  'Karaoke', 'Coffee', 'Cooking', 'Gardening', 'Photography', 'Zines', 'Film',
  'Volunteering', 'Mutual aid', 'Advocacy', 'Peer support', 'Trans health',
  'Parent support', 'Study groups', 'Faith', 'Sober', 'Pets', 'Crafts', 'Gaming',
]

export const COUNTY_OPTIONS = [
  'Salt Lake County', 'Utah County', 'Davis County', 'Weber County', 'Cache County',
  'Washington County', 'Summit County', 'Tooele County', 'Box Elder County', 'Iron County',
  'Wasatch County', 'Carbon County', 'Grand County', 'Uintah County', 'Sanpete County',
  'Sevier County', 'Duchesne County', 'Morgan County', 'San Juan County', 'Juab County',
  'Millard County', 'Emery County', 'Kane County', 'Beaver County', 'Garfield County',
  'Wayne County', 'Rich County', 'Piute County', 'Daggett County', 'Outside Utah',
]

// ---------------------------------------------------------- backgrounds

/** A built-in header the person can pick instead of uploading. Stored as `preset:<id>`. */
export interface Background {
  id: string
  label: string
  css: string
}

export const BACKGROUNDS: Background[] = [
  { id: 'pride', label: 'Pride', css: 'linear-gradient(110deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)' },
  { id: 'trans', label: 'Trans', css: 'linear-gradient(180deg,#5BCEFA 0 20%,#F5A9B8 20% 40%,#FFFFFF 40% 60%,#F5A9B8 60% 80%,#5BCEFA 80%)' },
  { id: 'bi', label: 'Bi', css: 'linear-gradient(180deg,#D60270 0 40%,#9B4F96 40% 60%,#0038A8 60%)' },
  { id: 'lesbian', label: 'Lesbian', css: 'linear-gradient(180deg,#D52D00 0 20%,#FF9A56 20% 40%,#FFFFFF 40% 60%,#D362A4 60% 80%,#A30262 80%)' },
  { id: 'pan', label: 'Pan', css: 'linear-gradient(180deg,#FF218C 0 33%,#FFD800 33% 66%,#21B1FF 66%)' },
  { id: 'nonbinary', label: 'Nonbinary', css: 'linear-gradient(180deg,#FCF434 0 25%,#FFFFFF 25% 50%,#9C59D1 50% 75%,#2C2C2C 75%)' },
  { id: 'ace', label: 'Ace', css: 'linear-gradient(180deg,#0B0B0B 0 25%,#A3A3A3 25% 50%,#FFFFFF 50% 75%,#800080 75%)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg,#FF7A59 0%,#FFB347 45%,#8E44AD 100%)' },
  { id: 'wasatch', label: 'Wasatch', css: 'linear-gradient(160deg,#1F3B4D 0%,#3E6E8C 50%,#C9D9E0 100%)' },
  { id: 'redrock', label: 'Red rock', css: 'linear-gradient(160deg,#7A2E1F 0%,#C8653F 55%,#F2C29B 100%)' },
  { id: 'lavender', label: 'Lavender', css: 'linear-gradient(135deg,#B8A1E6 0%,#E4D6F5 100%)' },
  { id: 'meadow', label: 'Meadow', css: 'linear-gradient(135deg,#2E8B45 0%,#8FD694 100%)' },
  { id: 'night', label: 'Night', css: 'linear-gradient(160deg,#0F0F1A 0%,#2A2450 60%,#4B3FBF 100%)' },
]

/** The CSS for a stored header value: a preset token, an uploaded image, or nothing. */
export function headerStyle(headerUrl: string | null | undefined, fallback: string): {
  background: string; image: string | null
} {
  if (!headerUrl) return { background: fallback, image: null }
  if (headerUrl.startsWith('preset:')) {
    const preset = BACKGROUNDS.find((b) => `preset:${b.id}` === headerUrl)
    return { background: preset?.css ?? fallback, image: null }
  }
  return { background: fallback, image: headerUrl }
}

// ---------------------------------------------------------------- links

/**
 * Platforms whose whole purpose is adult content or adult-only meetups. A
 * link to one of these tags the profile 18+ on save; the same list runs in
 * the database (public.is_adult_link) so the client can only under-report,
 * never override. Keep the two in step.
 */
export const ADULT_LINK_PATTERN =
  /(^|[/.@\s])(onlyfans|fansly|justfor\.?fans|loyalfans|manyvids|fancentro|fanvue|admireme|unlockt|4my\.?fans|clips4sale|iwantclips|sextpanther|pornhub|xvideos|xhamster|redtube|youporn|brazzers|chaturbate|myfreecams|stripchat|cam4|livejasmin|bongacams|adultfriendfinder|sniffies|grindr|scruff|recon|feeld|rentmen|tryst)\.(com|net|co|xxx|tv|app|io|me|to)(\/|$|\s)/i

export const isAdultLink = (url: string) => ADULT_LINK_PATTERN.test(url.toLowerCase())

/** Trims a pasted link down to `host/path` — no scheme, no trailing slash. */
export function normalizeLink(raw: string): string {
  return raw.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

/** Roughly a hostname with an optional path, and nothing that is not a URL. */
export function isPlausibleLink(link: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(link)
}

export const linkHref = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`)

const BRANDS: Array<{ match: RegExp; label: string; color: string }> = [
  { match: /(^|\.)instagram\.com/i, label: 'Instagram', color: '#C13584' },
  { match: /(^|\.)tiktok\.com/i, label: 'TikTok', color: '#161615' },
  { match: /(^|\.)(twitter|x)\.com/i, label: 'X', color: '#161615' },
  { match: /(^|\.)bsky\.app/i, label: 'Bluesky', color: '#1185FE' },
  { match: /(^|\.)threads\.net/i, label: 'Threads', color: '#161615' },
  { match: /(^|\.)facebook\.com/i, label: 'Facebook', color: '#1877F2' },
  { match: /(^|\.)youtube\.com|(^|\.)youtu\.be/i, label: 'YouTube', color: '#FF0000' },
  { match: /(^|\.)twitch\.tv/i, label: 'Twitch', color: '#9146FF' },
  { match: /(^|\.)discord\.(gg|com)/i, label: 'Discord', color: '#5865F2' },
  { match: /(^|\.)linkedin\.com/i, label: 'LinkedIn', color: '#0A66C2' },
  { match: /(^|\.)github\.com/i, label: 'GitHub', color: '#161615' },
  { match: /(^|\.)linktr\.ee/i, label: 'Linktree', color: '#39E09B' },
  { match: /(^|\.)etsy\.com/i, label: 'Etsy', color: '#F1641E' },
  { match: /(^|\.)spotify\.com/i, label: 'Spotify', color: '#1DB954' },
  { match: /(^|\.)bandcamp\.com/i, label: 'Bandcamp', color: '#629AA9' },
  { match: /(^|\.)venmo\.com/i, label: 'Venmo', color: '#008CFF' },
  { match: /(^|\.)cash\.app/i, label: 'Cash App', color: '#00D632' },
  { match: /(^|\.)ko-fi\.com/i, label: 'Ko-fi', color: '#FF5E5B' },
  { match: /(^|\.)patreon\.com/i, label: 'Patreon', color: '#FF424D' },
]

export interface LinkMeta {
  /** The platform name when recognised, otherwise the bare host. */
  label: string
  /** The path or handle part, for a second line. */
  detail: string
  color: string
  adult: boolean
}

export function linkMeta(link: string): LinkMeta {
  const clean = normalizeLink(link)
  const slash = clean.indexOf('/')
  const host = slash === -1 ? clean : clean.slice(0, slash)
  const path = slash === -1 ? '' : clean.slice(slash + 1)
  const brand = BRANDS.find((b) => b.match.test(host))
  const adult = isAdultLink(clean)
  if (adult) return { label: host, detail: path, color: C.agePill, adult }
  if (brand) return { label: brand.label, detail: path.replace(/^@/, '') ? `@${path.replace(/^@/, '')}` : host, color: brand.color, adult }
  return { label: host, detail: path, color: '#5C5851', adult }
}

// --------------------------------------------------------------- upload

const BUCKET = 'profile-media'

/** Longest edge, in pixels, per slot. Avatars are shown at 96px; headers span the screen. */
const MAX_EDGE = { avatar: 640, header: 1600 } as const

/**
 * Re-encodes any browser-decodable image as a bounded JPEG. Always JPEG:
 * the bucket accepts three types but re-encoding is what strips metadata
 * (a phone's GPS tags above all) and caps the bytes at something a profile
 * page can afford to load.
 */
async function shrink(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Could not process the image.')
  return blob
}

/**
 * Uploads a picture for one slot of the caller's own profile and returns
 * its public URL. Every upload gets a fresh filename so caches never serve
 * the old picture at the new address. Only the folder named after the
 * signed-in id is writable, so `profileId` must be the caller's own.
 */
export async function uploadProfileImage(
  profileId: string, slot: 'avatar' | 'header', file: File,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const blob = await shrink(file, MAX_EDGE[slot])
  const path = `${profileId}/${slot}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw new Error('Upload failed. Check your connection and try again.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
