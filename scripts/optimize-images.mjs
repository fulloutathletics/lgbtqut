// Re-encodes the directory's artwork and serves it from our own origin.
//
// Every picture in the directory is a full-size original sitting on a host we
// don't control — the old Glide bucket, Photobucket, Webflow. Nothing about
// them is sized for this app: the Community Search splash card is a 1.2MB PNG
// rendered into a 240px-tall slot. We can't recompress them at the source, so
// this pulls each one down, resizes it to the largest size the app can
// actually show, encodes it as WebP, and writes it to public/images/opt/.
//
// src/lib/optimizedImages.ts maps an FNV-1a hash of each source URL to the
// content hash naming its local copy. At runtime `imgSrc` hashes the URL it
// was handed and serves the local file when that hash is in the map — so a
// picture an admin swaps later mints a URL nobody has optimized, misses the
// map, and loads from its own host exactly as it does today. Nothing to keep
// in sync, and nothing breaks when it drifts.
//
// Naming the file by its contents rather than by its URL matters because the
// service worker caches these first-party images CacheFirst. Re-encoding at a
// different quality writes a different filename, so a reader who already has
// the old bytes fetches the new ones instead of being stuck with a stale copy
// under a name that never changes.
//
// Re-run after `npm run generate:data`, or whenever new artwork lands:
//   npm run optimize:images
// Already-encoded files are left alone; pass --force to redo them.

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, globSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT_DIR = resolve(root, 'public/images/opt')
const SRC_GLOB = resolve(root, 'src/**/*.{ts,tsx}')
const MANIFEST = resolve(root, 'src/lib/optimizedImages.ts')
const SEED = resolve(root, 'public/data/seed.json')

// The widest an image is ever painted is a full-bleed card on the largest
// phone (~430 CSS px), so 1024 covers it at 2x and leaves headroom for a
// tablet. Anything already smaller is left at its own size rather than
// upscaled — a 200px logo blown up to 1024 would be bigger and no better.
const MAX_EDGE = 1024
const QUALITY = 80

const force = process.argv.includes('--force')

// Photobucket and Webflow both 403 a bare programmatic request. They serve
// these same files to the app's <img> tags all day, so this asks for them the
// way the browser does rather than as an anonymous script.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    + ' (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
}

/**
 * FNV-1a, 32-bit, as 8 hex characters. Small, synchronous, and identical in
 * this script and in the browser — the client can't use SubtleCrypto here
 * because `imgSrc` has to return a URL during render, not a promise. The
 * collision check below is what makes 32 bits safe at this scale.
 */
function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Names the encoded file, so different bytes never reuse a filename. */
const contentHash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12)

const IMAGE_URL = /https?:\/\/[^\s'"`]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s'"`]*)?/gi

/**
 * Every image URL the app can ask for, in stable order.
 *
 * Most come from the directory export, but a handful are written straight into
 * the source — the wordmark in `ProfileHeader`, the fallback banner in
 * `ResourceList` — and those are on screen more often than any single listing,
 * so they are worth optimizing too.
 */
function collectUrls(data) {
  const found = new Set()

  const walk = (node) => {
    if (!node) return
    if (typeof node === 'string') {
      if (/^https?:\/\//.test(node) && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(node)) found.add(node)
      return
    }
    if (typeof node === 'object') for (const key of Object.keys(node)) walk(node[key])
  }
  walk(data)

  for (const file of globSync(SRC_GLOB)) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMAGE_URL)) found.add(match[0])
  }

  return [...found].sort()
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`

/**
 * The previous run's urlHash → filename pairs, so a re-run only pays for
 * artwork that is actually new. Parsed rather than imported because the
 * manifest is TypeScript and this script is plain Node.
 */
function readPreviousManifest() {
  const map = new Map()
  if (!existsSync(MANIFEST)) return map
  for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
    const m = /^\s*'([0-9a-f]{8})': '([0-9a-f]+)',$/.exec(line)
    if (m) map.set(m[1], m[2])
  }
  return map
}

async function main() {
  const data = JSON.parse(readFileSync(SEED, 'utf8'))
  const urls = collectUrls(data)

  // 32-bit hashes over a set this small should never collide, but a silent
  // collision would serve one organisation's logo under another's name. Refuse
  // to generate anything rather than ship that.
  const byHash = new Map()
  for (const url of urls) {
    const h = hash(url)
    if (byHash.has(h)) throw new Error(`hash collision on ${h}:\n  ${byHash.get(h)}\n  ${url}`)
    byHash.set(h, url)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`${urls.length} images referenced by seed.json and src/\n`)

  // urlHash -> contentHash, in the order the sorted URL list produces so the
  // generated manifest is stable across runs.
  const covered = new Map()
  const failures = []
  // Bytes this run downloaded and wrote, kept apart from the running total on
  // disk so the savings line compares like with like.
  let sourceBytes = 0
  let encodedBytes = 0
  let onDiskBytes = 0

  // A previous run's manifest lets an unchanged image skip the download and
  // re-encode entirely; --force ignores it.
  const previous = force ? new Map() : readPreviousManifest()

  for (const url of urls) {
    const h = hash(url)
    const known = previous.get(h)
    if (known && existsSync(join(OUT_DIR, `${known}.webp`))) {
      covered.set(h, known)
      onDiskBytes += statSync(join(OUT_DIR, `${known}.webp`)).size
      continue
    }

    let response
    try {
      response = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (err) {
      // A dead URL is not a reason to fail the run — the app already falls
      // back to a hatched swatch when an image 404s, and skipping it here just
      // means it keeps loading (or failing) from its own host.
      failures.push([url, String(err.message ?? err)])
      continue
    }

    const input = Buffer.from(await response.arrayBuffer())
    try {
      const image = sharp(input, { animated: true })
      const meta = await image.metadata()

      // Animated GIFs would lose their animation through a still re-encode,
      // and they're rare enough not to be worth the WebP animation path.
      if ((meta.pages ?? 1) > 1) {
        failures.push([url, 'animated — left at source'])
        continue
      }

      const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
      const encoded = await image
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 6 })
        .toBuffer()

      // Flat logo art — most of this directory — often comes out smaller
      // lossless than lossy, and without the ringing around hard edges.
      const lossless = await sharp(input)
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ lossless: true, effort: 6 })
        .toBuffer()

      const best = lossless.length < encoded.length ? lossless : encoded

      // Re-encoding a picture that was already small and well compressed can
      // make it bigger. Keeping that would trade a third-party request for a
      // first-party one and lose bytes doing it, so skip those.
      if (best.length >= input.length) {
        failures.push([url, `no saving (${kb(input.length)} → ${kb(best.length)})`])
        continue
      }

      const name = contentHash(best)
      writeFileSync(join(OUT_DIR, `${name}.webp`), best)
      covered.set(h, name)
      sourceBytes += input.length
      encodedBytes += best.length
      onDiskBytes += best.length
      console.log(
        `${kb(input.length).padStart(7)} → ${kb(best.length).padStart(6)}` +
        `  ${String(longest).padStart(4)}px  ${url.slice(url.lastIndexOf('/') + 1)}`,
      )
    } catch (err) {
      failures.push([url, String(err.message ?? err)])
    }
  }

  // Drop files whose source URL is no longer in the directory, so replaced
  // artwork doesn't accumulate in the repo forever.
  const live = new Set([...covered.values()].map((name) => `${name}.webp`))
  for (const file of readdirSync(OUT_DIR)) {
    if (!live.has(file)) {
      rmSync(join(OUT_DIR, file))
      console.log(`removed orphan ${file}`)
    }
  }

  writeFileSync(MANIFEST, [
    '// Generated by scripts/optimize-images.mjs — do not edit by hand.',
    '//',
    '// FNV-1a hash of a source image URL → the name of its re-encoded copy in',
    '// public/images/opt/. See `imgSrc` in ./data.ts for how it is used.',
    '',
    'export const OPTIMIZED: Record<string, string> = {',
    // Keys are quoted because a hex hash can begin with a digit, which is not
    // a valid bare property name.
    ...[...covered].map(([urlHash, name]) => `  '${urlHash}': '${name}',`),
    '}',
    '',
  ].join('\n'))

  console.log(`\n${covered.size}/${urls.length} images optimized`)
  if (sourceBytes) {
    const saved = 100 - (encodedBytes / sourceBytes) * 100
    console.log(`this run: ${kb(sourceBytes)} → ${kb(encodedBytes)} (${saved.toFixed(0)}% smaller)`)
  }
  console.log(`public/images/opt now holds ${kb(onDiskBytes)} across ${new Set(covered.values()).size} files`)

  if (failures.length) {
    console.log(`\n${failures.length} left at source:`)
    for (const [url, why] of failures) console.log(`  ${why} — ${url}`)
  }
}

await main()
