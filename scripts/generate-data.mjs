// Turns the Glide-derived design-reference data into two artifacts:
//   public/data/seed.json  — runtime fallback so the app renders before the DB is seeded
//   supabase/seed.sql      — INSERTs for the real Postgres tables
// Run with: npm run generate:data

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const data = await import(resolve(root, 'design-reference/app-data.js'))
const { TABS, RESOURCES, BUSINESSES, HOSTS, EVENTS } = data

const CDN = 'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/NSfaaNV0fRhAK9yZqEUi/pub/'

// County artwork is client-supplied; categories and communities fall back to a
// rotating swatch set until real photography lands.
const COUNTY_IMG = {
  'Cache County': CDN + 'AY58wkQy3qGWOpQJbKTj.png',
  'Davis County': CDN + 'wXWQPFDqk5sYKfx69KNh.png',
  'Salt Lake County': CDN + 'f209QfRSH198UjpeQ0Xn.png',
  'Utah County': CDN + 'rps4K3DxViXDhKSyjuU4.png',
  'Weber County': CDN + 'IPkATfqPwX93VCUbkOpl.png',
  'Washington County': CDN + 'dEU92UGNbuK547YFYqsx.png',
}

// City lookup with a county-centroid fallback. Replace with real per-business
// coordinates before launch — see the handoff README.
const CITIES = {
  'salt lake city': [-111.891, 40.761], murray: [-111.888, 40.667], midvale: [-111.899, 40.611],
  milcreek: [-111.828, 40.689], millcreek: [-111.828, 40.689], ogden: [-111.973, 41.223],
  'south ogden': [-111.957, 41.187], provo: [-111.658, 40.234], layton: [-111.971, 41.060],
  'heber city': [-111.413, 40.507], helper: [-110.854, 39.684], 'park city': [-111.498, 40.646],
  logan: [-111.834, 41.735], 'st george': [-113.583, 37.096],
}
const COUNTY_PT = {
  'Salt Lake County': [-111.95, 40.66], 'Utah County': [-111.70, 40.10], 'Weber County': [-111.98, 41.24],
  'Davis County': [-112.02, 41.00], 'Wasatch County': [-111.25, 40.42], 'Carbon County': [-110.60, 39.62],
  'Cache County': [-111.80, 41.72], 'Washington County': [-113.40, 37.20],
}

// Stands in for an admin-set `verified` column: businesses and hosts are a
// curated list; resources qualify once contact details are confirmed.
const verifiedResource = (r) => !!(r.web && (r.tel || r.email))

// Age-restricted listings, keyed by entity id. Thresholds are evaluated against
// the viewer's stored DOB at read time.
const ADULT = {
  '7sRQ2k2TQbq2bYnzgKB5ig': { tag: '21+', why: 'Bar — alcohol served, 21 and over' },
  MaqNuPPUSgKJRr5FVNzAaw: { tag: '18+', why: 'Suggestive imagery' },
  DimVydSZRqmRIz0T9vAB4Q: { tag: '21+', why: 'Bar — alcohol served, 21 and over' },
  e2: { tag: '21+', why: 'Alcohol served at this event' },
}

const geocode = (b) => {
  const addr = (b.addr || '').toLowerCase()
  for (const city in CITIES) if (addr.includes(city)) return CITIES[city]
  return COUNTY_PT[b.county] || null
}

// Four worked examples of the backend-configured section system, carried over
// from the prototype. Everything else renders with no sections.
const BIZ_PAGE = {
  XLx0YWrKSQCqBYAsiJv1JA: {
    coupons: [
      { title: '15% off your table', terms: 'Show this screen to your server. Dine-in, any party size.', code: 'PRIDE15', expires: 'Through Sept 30' },
      { title: 'Free baklava', terms: 'With any two entrées, Tuesday through Thursday.', code: 'SWEET2', expires: 'Through Oct 15' },
    ],
    sections: [
      { title: 'Menu Highlights', sub: 'Lebanese, made from scratch daily', layout: { type: 'stack', size: 'large', orient: 'full' },
        items: [{ title: 'Mezze Platter', sub: 'Hummus, muhammara, labneh, warm pita', value: '$18' },
                { title: 'Shawarma Plate', sub: 'Chicken or cauliflower, garlic toum, pickles', value: '$21' },
                { title: 'Za’atar Manoushe', sub: 'Baked to order, olive oil and sumac', value: '$12' }] },
      { title: 'Catering & Events', sub: 'We cater Pride events across the valley', layout: { type: 'carousel', size: 'medium', orient: 'horizontal' },
        items: [{ title: 'Office lunch', sub: '10–40 people' }, { title: 'Wedding buffet', sub: '40–200 people' }, { title: 'Drop-off trays', sub: 'Order 48h ahead' }] },
    ],
  },
  'oA-zsVB4Tc2IoGXGJwV.Ew': {
    coupons: [{ title: '$20 off first visit', terms: 'New clients only. Mention LGBTQ.UT when you book.', code: 'WELCOME20', expires: 'No expiration' }],
    sections: [
      { title: 'Services', sub: 'Gender-affirming cuts, no gendered pricing', layout: { type: 'list', size: 'medium', orient: 'full' },
        items: [{ title: 'Haircut & style', sub: 'All hair types, 45 min', value: '$55' },
                { title: 'Color / gloss', sub: 'Consultation included', value: 'from $95' },
                { title: 'Spa facial', sub: '60 min', value: '$85' },
                { title: 'Beard shaping', sub: '30 min', value: '$35' }] },
      { title: 'The Space', sub: '', layout: { type: 'carousel', size: 'medium', orient: 'vertical' },
        items: [{ title: 'Front chairs', sub: '' }, { title: 'Wash station', sub: '' }, { title: 'Waiting area', sub: '' }] },
    ],
  },
  'SQxQBj7MT-mmNMGjiuF3lQ': {
    coupons: [{ title: 'First week free', terms: 'Drop in any time. No card required, no contract.', code: 'FIRSTWEEK', expires: 'Ongoing' }],
    sections: [
      { title: 'Class Schedule', sub: 'All classes are all-bodies, all-levels', layout: { type: 'list', size: 'medium', orient: 'full' },
        items: [{ title: 'Trans & NB lifting', sub: 'Mondays, 7:00 PM', value: 'Free' },
                { title: 'Barbell fundamentals', sub: 'Tue / Thu, 6:00 PM', value: 'Members' },
                { title: 'Open gym', sub: 'Daily, 5:00 AM – 10:00 PM', value: 'Members' }] },
      { title: 'Membership', sub: '', layout: { type: 'grid', size: 'medium', orient: 'tile' },
        items: [{ title: 'Monthly', sub: '$45 / month, cancel anytime' }, { title: 'Annual', sub: '$420 / year, two months free' },
                { title: 'Sliding scale', sub: 'Pay what you can, no questions' }, { title: 'Day pass', sub: '$12, includes a locker' }] },
    ],
  },
  RekEbrQSStqQiu6uJKJTYg: {
    sections: [
      { title: 'This Month at the Shop', sub: '', layout: { type: 'carousel', size: 'large', orient: 'horizontal' },
        items: [{ title: 'Queer Book Club', sub: 'Second Sunday, 4:00 PM' }, { title: 'Trans Writers Night', sub: 'Aug 21, 7:00 PM' },
                { title: 'Zine Making', sub: 'Aug 28, 2:00 PM' }] },
      { title: 'Staff Picks', sub: '', layout: { type: 'grid', size: 'large', orient: 'tile' },
        items: [{ title: 'Fiction', sub: '6 titles' }, { title: 'Trans memoir', sub: '9 titles' },
                { title: 'Local zines', sub: 'Restocked weekly' }, { title: 'Kids & teens', sub: '12 titles' }] },
    ],
  },
  'gHcZb9UtQZuiXGdnolYC-w': {
    coupons: [{ title: 'Free shipping', terms: 'On any two-bag order to a Utah address.', code: 'UTSHIP', expires: 'Through Dec 31' }],
    sections: [
      { title: 'Current Roasts', sub: 'Roasted to order every Monday', layout: { type: 'carousel', size: 'large', orient: 'horizontal' },
        items: [{ title: 'Heretic Blend', sub: 'Chocolate, cherry — medium' }, { title: 'Ex-Communicated', sub: 'Dark, smoky — French roast' },
                { title: 'Decaf Doubt', sub: 'Swiss water process' }] },
    ],
  },
}

const CRISIS = [
  { name: '988 Suicide & Crisis Lifeline', desc: 'Call or text 988. Free, confidential, 24/7 — for anyone in Utah.', action: 'Call 988', tel: '988' },
  { name: 'The Trevor Project', desc: 'Crisis counseling for LGBTQ+ young people under 25.', action: 'Call 1-866-488-7386', tel: '18664887386' },
  { name: 'Trans Lifeline', desc: 'Peer support run by and for trans people. No non-consensual active rescue.', action: 'Call 877-565-8860', tel: '18775658860' },
  { name: 'Utah Warm Line', desc: 'Non-crisis peer support when you need to talk it through.', action: 'Call 1-833-773-2588', tel: '18337732588' },
]

const resources = RESOURCES.map((r) => ({
  id: r.id, name: r.name, category: r.cat || '', county: r.county || '',
  counties: r.counties || [], communities: r.demo || [],
  image_url: r.img || '', description: r.desc || '',
  website: r.web || '', telephone: r.tel || '', email: r.email || '',
  address: r.addr || '', facebook: r.fb || '', instagram: r.ig || '',
  verified: verifiedResource(r),
  age_rating: ADULT[r.id]?.tag || null,
  age_reason: ADULT[r.id]?.why || null,
}))

const businesses = BUSINESSES.map((b) => {
  const pt = geocode(b)
  const cfg = BIZ_PAGE[b.id] || {}
  return {
    id: b.id, name: b.name, county: b.county || '', image_url: b.img || '',
    background_url: b.bg || '', color: b.color || '#7A2FA6', address: b.addr || '',
    website: b.web || '', telephone: b.tel || '', email: b.email || '',
    map_url: b.mapUrl || '', tags: b.tags || [],
    rating: b.rating || 0, review_count: b.reviews || 0,
    verified: true,
    longitude: pt ? pt[0] : null, latitude: pt ? pt[1] : null,
    coupons: cfg.coupons || [], sections: cfg.sections || [],
    age_rating: ADULT[b.id]?.tag || null,
    age_reason: ADULT[b.id]?.why || null,
  }
})

const hosts = HOSTS.map((h) => ({
  id: h.id, name: h.name, image_url: h.img || '', header_url: h.header || '',
  verified: true, bio: '', linked_business_id: null, linked_resource_id: null,
}))

const events = EVENTS.map((e) => ({
  id: e.id, host_id: e.hostId, name: e.name, date_label: e.date,
  starts_on: e.iso, description: e.desc || '', image_url: e.img || '',
  age_rating: ADULT[e.id]?.tag || null,
  age_reason: ADULT[e.id]?.why || null,
}))

const tabs = TABS.map((t, i) => ({
  id: t.id, name: t.name, subtitle: t.sub || '', image_url: t.img || '', position: i,
}))

const seed = { tabs, resources, businesses, hosts, events, crisis: CRISIS, countyImages: COUNTY_IMG }

mkdirSync(resolve(root, 'public/data'), { recursive: true })
writeFileSync(resolve(root, 'public/data/seed.json'), JSON.stringify(seed))

// ---- SQL ----------------------------------------------------------------

const q = (v) => {
  if (v === null || v === undefined || v === '') return 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}
const arr = (v) => (v && v.length ? `array[${v.map(q).join(',')}]::text[]` : `'{}'::text[]`)
const json = (v) => `'${JSON.stringify(v ?? []).replace(/'/g, "''")}'::jsonb`
const num = (v) => (v === null || v === undefined ? 'null' : String(v))
const bool = (v) => (v ? 'true' : 'false')

// Upsert rather than truncate: this file is re-run every time the source sheets
// change, and `truncate ... cascade` on a live database would take the RSVPs,
// comments and reviews that reference these rows with it.
const upsert = (cols) => `on conflict (id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`

const lines = [
  '-- Generated by scripts/generate-data.mjs. Do not hand-edit.',
  '-- Content tables only; user-owned tables are populated by the app.',
  '-- Safe to re-run: every statement upserts by primary key.',
  '',
  'begin;',
  '',
]

const TAB_COLS = ['name', 'subtitle', 'image_url', 'position']
lines.push(`insert into public.splash_tabs (id, ${TAB_COLS.join(', ')}) values`)
lines.push(tabs.map((t) => `  (${q(t.id)}, ${q(t.name)}, ${q(t.subtitle)}, ${q(t.image_url)}, ${t.position})`).join(',\n'))
lines.push(upsert(TAB_COLS) + ';')
lines.push('')

const RES_COLS = ['name', 'category', 'county', 'counties', 'communities', 'image_url', 'description',
  'website', 'telephone', 'email', 'address', 'facebook', 'instagram', 'verified', 'age_rating', 'age_reason']
lines.push(`insert into public.resources (id, ${RES_COLS.join(', ')}) values`)
lines.push(resources.map((r) => `  (${q(r.id)}, ${q(r.name)}, ${q(r.category)}, ${q(r.county)}, ${arr(r.counties)}, ${arr(r.communities)}, ${q(r.image_url)}, ${q(r.description)}, ${q(r.website)}, ${q(r.telephone)}, ${q(r.email)}, ${q(r.address)}, ${q(r.facebook)}, ${q(r.instagram)}, ${bool(r.verified)}, ${q(r.age_rating)}, ${q(r.age_reason)})`).join(',\n'))
lines.push(upsert(RES_COLS) + ';')
lines.push('')

// `coupons` and `sections` are deliberately in the update list: they are the
// backend-configured page layout, and re-seeding must carry config changes through.
const BIZ_COLS = ['name', 'county', 'image_url', 'background_url', 'color', 'address', 'website',
  'telephone', 'email', 'map_url', 'tags', 'rating', 'review_count', 'verified', 'longitude',
  'latitude', 'coupons', 'sections', 'age_rating', 'age_reason']
lines.push(`insert into public.businesses (id, ${BIZ_COLS.join(', ')}) values`)
lines.push(businesses.map((b) => `  (${q(b.id)}, ${q(b.name)}, ${q(b.county)}, ${q(b.image_url)}, ${q(b.background_url)}, ${q(b.color)}, ${q(b.address)}, ${q(b.website)}, ${q(b.telephone)}, ${q(b.email)}, ${q(b.map_url)}, ${arr(b.tags)}, ${num(b.rating)}, ${num(b.review_count)}, ${bool(b.verified)}, ${num(b.longitude)}, ${num(b.latitude)}, ${json(b.coupons)}, ${json(b.sections)}, ${q(b.age_rating)}, ${q(b.age_reason)})`).join(',\n'))
lines.push(upsert(BIZ_COLS) + ';')
lines.push('')

const HOST_COLS = ['name', 'image_url', 'header_url', 'verified', 'bio']
lines.push(`insert into public.hosts (id, ${HOST_COLS.join(', ')}) values`)
lines.push(hosts.map((h) => `  (${q(h.id)}, ${q(h.name)}, ${q(h.image_url)}, ${q(h.header_url)}, ${bool(h.verified)}, ${q(h.bio)})`).join(',\n'))
lines.push(upsert(HOST_COLS) + ';')
lines.push('')

const EVENT_COLS = ['host_id', 'name', 'date_label', 'starts_on', 'description', 'image_url', 'age_rating', 'age_reason']
lines.push(`insert into public.events (id, ${EVENT_COLS.join(', ')}) values`)
lines.push(events.map((e) => `  (${q(e.id)}, ${q(e.host_id)}, ${q(e.name)}, ${q(e.date_label)}, ${q(e.starts_on)}, ${q(e.description)}, ${q(e.image_url)}, ${q(e.age_rating)}, ${q(e.age_reason)})`).join(',\n'))
lines.push(upsert(EVENT_COLS) + ';')
lines.push('')

// crisis_lines has a surrogate key, so it upserts on the name instead — and
// stale entries are removed, because a dead crisis number is worse than none.
const CRISIS_COLS = ['description', 'action_label', 'telephone', 'position']
lines.push(`insert into public.crisis_lines (name, ${CRISIS_COLS.join(', ')}) values`)
lines.push(CRISIS.map((c, i) => `  (${q(c.name)}, ${q(c.desc)}, ${q(c.action)}, ${q(c.tel)}, ${i})`).join(',\n'))
lines.push(`on conflict (name) do update set ${CRISIS_COLS.map((c) => `${c} = excluded.${c}`).join(', ')};`)
lines.push('')
lines.push(`delete from public.crisis_lines where name not in (${CRISIS.map((c) => q(c.name)).join(', ')});`)
lines.push('')
lines.push('commit;')

mkdirSync(resolve(root, 'supabase'), { recursive: true })
writeFileSync(resolve(root, 'supabase/seed.sql'), lines.join('\n') + '\n')

console.log(`seed.json: ${tabs.length} tabs, ${resources.length} resources, ${businesses.length} businesses, ${hosts.length} hosts, ${events.length} events`)
console.log('seed.sql written')
