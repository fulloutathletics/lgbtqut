// POST /moderate
//
// Called two ways:
//
//   by the database (pg_net, header x-moderation-secret)
//     { kind: 'link', link }             rule on a link nobody has ruled on
//     { kind: 'post' | 'comment', id }   moderate a post or reply
//     { kind: 'profile', id }            moderate a bio and display name
//     { kind: 'sweep' }                  retry links left pending or errored
//
//   by the profile editor (a signed-in session)
//     { kind: 'preview_link', link }     → { adult, link_in_bio }
//                                          so the editor can say so before Save
//
// Rows are always re-read with the service role; the payload only names
// them, so a forged call can at worst re-check something.
//
// Two providers, both optional (with neither, only the database's known-
// domain rules apply):
//
//   OPENAI_API_KEY   OpenAI moderation (omni-moderation-latest, free). Scores
//                    the standard harm categories.
//   JEV_API          Jev by TypeSafe. Answers this app's own questions with
//                    calibrated probabilities: whether an unfamiliar site is
//                    adult-only or a link-in-bio page, whether a flagged slur
//                    is aimed or reclaimed, solicitation, outing.
//
// Only the text itself goes to either provider: no account id, handle or
// name alongside it. Nothing here logs a body.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json, sameText } from '../_shared/recovery.ts'
import {
  hostHints, isAdultHost, isAllowedHost, isLinkInBioHost, linkHost, linkKey, linksInText,
} from '../_shared/links.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const HOOK_SECRET = Deno.env.get('MODERATION_HOOK_SECRET') ?? ''
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const JEV_KEY = Deno.env.get('JEV_API') ?? ''

/** A verdict is reused this long before the site is looked at again. */
const RECHECK_DAYS = 30
/** Jev probability at or above which a site is treated as adult / link-in-bio. */
const LINK_THRESHOLD = 0.7

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid_request' }, 400) }

  try {
    if (body.kind === 'preview_link') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data } = await admin.auth.getUser(token)
      if (!data?.user) return json({ error: 'unauthorized' }, 401)
      const key = linkKey(String(body.link ?? ''))
      if (!key || key.length > 500) return json({ error: 'invalid_link' }, 400)
      const v = await checkLink(key)
      return json({ adult: !!v.adult, link_in_bio: !!v.link_in_bio })
    }

    const given = req.headers.get('x-moderation-secret') ?? ''
    if (!HOOK_SECRET || !sameText(given, HOOK_SECRET)) return json({ error: 'unauthorized' }, 401)

    switch (body.kind) {
      case 'link': {
        const key = linkKey(String(body.link ?? ''))
        if (key) await checkLink(key)
        return json({ ok: true })
      }
      case 'post':
      case 'comment':
        await moderateContent(body.kind, Number(body.id))
        return json({ ok: true })
      case 'profile':
        await moderateProfile(String(body.id ?? ''))
        return json({ ok: true })
      case 'sweep': {
        const before = new Date(Date.now() - 5 * 60_000).toISOString()
        const { data } = await admin.from('link_checks').select('link')
          .in('status', ['pending', 'error']).lt('created_at', before).limit(25)
        for (const row of data ?? []) await checkLink(row.link, true)
        return json({ ok: true, checked: data?.length ?? 0 })
      }
      default:
        return json({ error: 'invalid_request' }, 400)
    }
  } catch (err) {
    console.error('moderate failed:', err instanceof Error ? err.message : 'unknown')
    return json({ error: 'failed' }, 500)
  }
})

// ================================================================ links

interface LinkRow {
  link: string
  status: 'pending' | 'done' | 'error'
  final_host: string | null
  adult: boolean | null
  link_in_bio: boolean | null
  adult_p: number | null
  link_in_bio_p: number | null
  source: string | null
  checked_at: string | null
}

async function checkLink(key: string, force = false): Promise<Partial<LinkRow>> {
  const { data: existing } = await admin.from('link_checks').select('*').eq('link', key).maybeSingle<LinkRow>()
  const fresh = existing?.status === 'done' && existing.checked_at
    && Date.now() - Date.parse(existing.checked_at) < RECHECK_DAYS * 86_400_000
  if (fresh && !force) return existing

  const verdict = await judgeLink(key)
  const row = { link: key, ...verdict, checked_at: new Date().toISOString() }
  await admin.from('link_checks').upsert(row)
  if (row.status === 'done' && (row.adult || row.link_in_bio)) {
    await admin.rpc('apply_link_verdict', { k: key })
  }
  return row
}

async function judgeLink(key: string): Promise<Omit<LinkRow, 'link' | 'checked_at'>> {
  const rules = (host: string, adult: boolean, bio: boolean) => ({
    status: 'done' as const, final_host: host, adult, link_in_bio: bio,
    adult_p: null, link_in_bio_p: null, source: 'rules',
  })

  const host = linkHost(key)
  if (isAdultHost(host) || isLinkInBioHost(host)) return rules(host, isAdultHost(host), isLinkInBioHost(host))
  if (isAllowedHost(host)) return { ...rules(host, false, false), source: 'allowlist' }

  // Follow the link: a short link or a custom domain can land anywhere.
  const page = await fetchPage(`https://${key}`)
  for (const hop of page.hosts) {
    if (isAdultHost(hop) || isLinkInBioHost(hop)) return rules(page.finalHost, isAdultHost(hop), isLinkInBioHost(hop))
  }
  if (isAllowedHost(page.finalHost)) return { ...rules(page.finalHost, false, false), source: 'allowlist' }
  // Adult sites label themselves (RTA label, rating meta) so filters can find them.
  if (page.adultLabel) return rules(page.finalHost, true, false)

  // Someone else already linked this site; the site is what is being judged.
  const { data: same } = await admin.from('link_checks')
    .select('adult, link_in_bio, adult_p, link_in_bio_p, source, checked_at')
    .eq('final_host', page.finalHost).eq('status', 'done').eq('source', 'jev')
    .gte('checked_at', new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString())
    .limit(1).maybeSingle()
  if (same) return { status: 'done', final_host: page.finalHost, ...same }

  const answers = await jev(
    {
      link: key,
      redirected_through: page.hosts,
      final_host: page.finalHost,
      page: page.reached ? { title: page.title, description: page.description, site_name: page.siteName } : 'could not be loaded',
      hints_in_name: hostHints(page.finalHost),
    },
    {
      adult_platform: {
        type: 'noul',
        instructions:
          'Is this website an adult-only platform: one whose main purpose is pornography, paid explicit-content ' +
          'subscriptions (like OnlyFans, Fansly or JustFor.Fans), cam shows, escorting or sex work, or adult hookups? ' +
          'Judge the site, not one person\'s page on it. `hints_in_name` only lists words in the domain that are ' +
          'sometimes suspicious; a word like "fans" alone proves nothing.',
        criteria: {
          true: 'The site exists mainly for adult or explicit content, sex work, or adult hookups.',
          false: 'A general social network, shop, news or sports site (e.g. a sports fan site), personal site, ' +
            'community organisation, health or sex-education resource, or anything not mainly adult.',
        },
      },
      link_in_bio: {
        type: 'noul',
        instructions:
          'Is this a link-in-bio page: a single page whose main purpose is to list someone\'s other links, ' +
          'like Linktree, Beacons, bio.link or linkin.bio (including one on a custom domain)?',
        criteria: {
          true: 'A hub page mostly made of buttons or links out to the person\'s other profiles or pages.',
          false: 'A website with its own content, a shop, a single social profile, a professional network ' +
            'like LinkedIn, an event page, or an organisation\'s site.',
        },
      },
    },
  )
  if (!answers) return { status: 'error', final_host: page.finalHost, adult: null, link_in_bio: null, adult_p: null, link_in_bio_p: null, source: null }

  const adultP = answers.adult_platform?.noul ?? 0
  const bioP = answers.link_in_bio?.noul ?? 0
  return {
    status: 'done', final_host: page.finalHost, source: 'jev',
    adult: adultP >= LINK_THRESHOLD, link_in_bio: bioP >= LINK_THRESHOLD,
    adult_p: round(adultP), link_in_bio_p: round(bioP),
  }
}

interface Page {
  reached: boolean
  hosts: string[]
  finalHost: string
  title: string
  description: string
  siteName: string
  adultLabel: boolean
}

/**
 * Follows up to four redirects by hand (so each hop's host can be judged)
 * and reads the first 64 KB of the page it lands on. Only ordinary public
 * web addresses: http(s), default port, a named host.
 */
async function fetchPage(start: string): Promise<Page> {
  const page: Page = { reached: false, hosts: [], finalHost: linkHost(start), title: '', description: '', siteName: '', adultLabel: false }
  let url: URL
  try { url = new URL(start) } catch { return page }

  for (let hop = 0; hop < 5; hop++) {
    if (!/^https?:$/.test(url.protocol) || url.port || !/[a-z]/i.test(url.hostname)
        || /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname) || /^[\d.]+$|:/.test(url.hostname)) return page
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    page.hosts.push(host)
    page.finalHost = host

    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'LGBTQ.UT link check (+https://lgbtqut.app)', Accept: 'text/html' },
      })
    } catch { return page }

    const next = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && next) {
      await res.body?.cancel()
      try { url = new URL(next, url) } catch { return page }
      continue
    }

    const html = await readUpTo(res, 64 * 1024)
    page.reached = res.ok
    page.title = clip(decode(/<title[^>]*>([^<]*)/i.exec(html)?.[1] ?? ''))
    page.description = clip(meta(html, 'description') || meta(html, 'og:description'))
    page.siteName = clip(meta(html, 'og:site_name'))
    page.adultLabel = /RTA-5042-1996-1400-1577-RTA/i.test(html) || /^(adult|mature|RTA)/i.test(meta(html, 'rating'))
    return page
  }
  return page
}

async function readUpTo(res: Response, limit: number): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.length }
  return new TextDecoder().decode(all.slice(0, limit))
}

function meta(html: string, name: string): string {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const a = new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]*content=["']([^"']*)`, 'i').exec(html)
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${n}["']`, 'i').exec(html)
  return decode(a?.[1] ?? b?.[1] ?? '')
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
const clip = (s: string) => s.slice(0, 300)
const round = (n: number) => Math.round(n * 1000) / 1000

// ================================================================= text

type Where = 'post' | 'reply' | 'profile'

interface Finding { reason: string; action: 'hidden' | 'rated_18' | 'review' | 'support'; detail: Record<string, number> }

interface Decision { hide: string | null; adult: boolean; findings: Finding[] }

async function moderateContent(kind: 'post' | 'comment', id: number) {
  if (!Number.isInteger(id)) return
  const table = kind === 'post' ? 'posts' : 'comments'
  const { data: row } = await admin.from(table)
    .select('id, author_id, body, hidden_reason').eq('id', id).maybeSingle()
  if (!row) return
  // A reviewer's call stands until a reviewer changes it.
  if (row.hidden_reason?.startsWith('reviewer:')) return

  const d = await decide(row.body ?? '', kind === 'post' ? 'post' : 'reply')
  if (!d) return
  const adultLink = await hasAdultLink(row.body ?? '')

  // Only overwrite a hide that moderation made; a link-in-bio hide made by
  // apply_link_verdict stays until the link is gone.
  const linkHide = row.hidden_reason === 'auto:link_in_bio' && (await hasBioLink(row.body ?? ''))
  await admin.from(table).update({
    hidden_at: d.hide ? new Date().toISOString() : linkHide ? undefined : null,
    hidden_reason: d.hide ? `auto:${d.hide}` : linkHide ? 'auto:link_in_bio' : null,
    adult: d.adult || adultLink,
  }).eq('id', id)
  await replaceFlags(kind, String(id), row.author_id, d.findings)
}

async function moderateProfile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  const { data: row } = await admin.from('social_profiles')
    .select('id, display_name, bio').eq('id', id).maybeSingle()
  if (!row) return
  const text = [row.display_name && `Name: ${row.display_name}`, row.bio && `Bio: ${row.bio}`].filter(Boolean).join('\n')
  if (!text) return

  const d = await decide(text, 'profile')
  if (!d) return
  // A profile is not hidden by a machine; what would hide a post goes to a reviewer.
  const findings = d.findings.map((f) => (f.action === 'hidden' ? { ...f, action: 'review' as const } : f))
  await admin.from('social_profiles').update({ ai_adult: d.adult }).eq('id', id)
  await replaceFlags('profile', id, id, findings)
}

async function replaceFlags(kind: string, id: string, author: string, findings: Finding[]) {
  // Link verdicts write their own flags; those are not this pass's to clear.
  await admin.from('moderation_flags').delete()
    .eq('subject_kind', kind).eq('subject_id', id).is('resolved_at', null)
    .not('reason', 'in', '(link_in_bio,adult_link)')
  if (!findings.length) return
  await admin.from('moderation_flags').insert(findings.map((f) => ({
    subject_kind: kind, subject_id: id, author_id: author, reason: f.reason, action: f.action, detail: f.detail,
  })))
}

async function hasAdultLink(body: string): Promise<boolean> {
  const keys = linksInText(body).map(linkKey)
  if (keys.some((k) => isAdultHost(linkHost(k)))) return true
  if (!keys.length) return false
  const { data } = await admin.from('link_checks').select('link').in('link', keys).eq('adult', true).limit(1)
  return !!data?.length
}

async function hasBioLink(body: string): Promise<boolean> {
  const keys = linksInText(body).map(linkKey)
  if (keys.some((k) => isLinkInBioHost(linkHost(k)))) return true
  if (!keys.length) return false
  const { data } = await admin.from('link_checks').select('link').in('link', keys).eq('link_in_bio', true).limit(1)
  return !!data?.length
}

/**
 * Both providers at once, then one decision. The rule of thumb: OpenAI alone
 * never hides anything. Its hate and harassment scores run high on queer
 * people talking about themselves (reclaimed words, frank talk about bodies
 * and sex), so a hide needs Jev, which is told the context, to agree. The
 * exceptions are the cases where being wrong the other way costs more:
 * anything sexual involving minors.
 */
async function decide(text: string, where: Where): Promise<Decision | null> {
  const [o, j] = await Promise.all([openai(text), jevText(text, where)])
  if (!o && !j) return null

  const d: Decision = { hide: null, adult: false, findings: [] }
  const hide = (reason: string, detail: Record<string, number>) => {
    d.hide ??= reason
    d.findings.push({ reason, action: 'hidden', detail })
  }
  const review = (reason: string, detail: Record<string, number>) => d.findings.push({ reason, action: 'review', detail })
  const os = (k: string) => o?.[k] ?? 0
  const js = (k: string) => j?.[k] ?? 0
  const max = (...n: number[]) => Math.max(...n)

  // Sexual content involving minors.
  const minors = { openai: round(os('sexual/minors')), jev: round(js('minors')) }
  if (os('sexual/minors') >= 0.4 || js('minors') >= 0.6) hide('minors', minors)

  // Hate and harassment: aimed at someone, not reclaimed or reported.
  const oHate = max(os('harassment'), os('hate'), os('harassment/threatening'), os('hate/threatening'))
  const oThreat = max(os('harassment/threatening'), os('hate/threatening'), os('violence'))
  const hate = { openai: round(oHate), openai_threat: round(oThreat), jev: round(js('hate_or_harassment')) }
  if (o && j) {
    if (js('hate_or_harassment') >= 0.8 && oHate >= 0.5) hide('hate_or_harassment', hate)
    else if (oThreat >= 0.8 && js('hate_or_harassment') >= 0.5) hide('threat', hate)
    else if (js('hate_or_harassment') >= 0.6 || oHate >= 0.7) review('hate_or_harassment', hate)
  } else if (j) {
    if (js('hate_or_harassment') >= 0.9) hide('hate_or_harassment', hate)
    else if (js('hate_or_harassment') >= 0.6) review('hate_or_harassment', hate)
  } else if (oHate >= 0.8 || oThreat >= 0.8) {
    review('hate_or_harassment', hate)
  }

  // Sexual content: allowed, for adults.
  const sexual = { openai: round(os('sexual')), jev: round(js('sexual_explicit')) }
  if (os('sexual') >= 0.7 || js('sexual_explicit') >= 0.8) {
    d.adult = true
    d.findings.push({ reason: 'sexual_content', action: 'rated_18', detail: sexual })
  }
  if (js('solicitation') >= 0.8) {
    d.adult = true
    review('solicitation', { jev: round(js('solicitation')) })
  }
  if (where === 'profile' && js('adult_pointer') >= 0.8) {
    d.adult = true
    d.findings.push({ reason: 'adult_pointer', action: 'rated_18', detail: { jev: round(js('adult_pointer')) } })
  }

  // Spam, scams and outing: Jev's alone.
  if (js('spam_or_scam') >= 0.9) hide('spam_or_scam', { jev: round(js('spam_or_scam')) })
  else if (js('spam_or_scam') >= 0.7) review('spam_or_scam', { jev: round(js('spam_or_scam')) })
  if (js('outing_or_doxxing') >= 0.85) hide('outing_or_doxxing', { jev: round(js('outing_or_doxxing')) })
  else if (js('outing_or_doxxing') >= 0.6) review('outing_or_doxxing', { jev: round(js('outing_or_doxxing')) })

  // Illegal goods and violent crime.
  if (max(os('illicit'), os('illicit/violent')) >= 0.8) {
    review('illicit', { openai: round(max(os('illicit'), os('illicit/violent'))) })
  }

  // Someone who may be struggling is never hidden, only noticed.
  const selfHarm = max(os('self-harm'), os('self-harm/intent'), os('self-harm/instructions'))
  if (selfHarm >= 0.5) {
    d.findings.push({ reason: 'self_harm', action: 'support', detail: { openai: round(selfHarm) } })
  }

  return d
}

async function openai(text: string): Promise<Record<string, number> | null> {
  if (!OPENAI_KEY) return null
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) { console.error('openai moderation', res.status); return null }
    const out = await res.json()
    return out?.results?.[0]?.category_scores ?? null
  } catch {
    console.error('openai moderation unreachable')
    return null
  }
}

async function jevText(text: string, where: Where): Promise<Record<string, number> | null> {
  const place = where === 'profile' ? 'a person\'s profile name and bio' : where === 'reply' ? 'a reply to a post' : 'a post'
  const context =
    `This is ${place} on LGBTQ.UT, a directory and community app for LGBTQ+ people in Utah, open to ages 13 and up. ` +
    'Members often use reclaimed words about themselves (queer, dyke, fag, tranny used in-group), talk frankly about ' +
    'identity, bodies, transition, dating and sexual health, and quote or describe bigotry they have faced. None of ' +
    'that is a violation by itself. '

  const questions: Record<string, Question> = {
    hate_or_harassment: {
      type: 'noul',
      instructions: context + 'Does the text attack, demean, threaten or harass a person or a group (including LGBTQ+ people) — ' +
        'as opposed to self-description, reclaimed language, criticism of ideas, or reporting abuse they received?',
      criteria: {
        true: 'It is aimed at someone: slurs used against people, insults, threats, dehumanising claims, or pile-on harassment.',
        false: 'Self-description, in-group reclaimed use, quoting to criticise, venting without a target, or ordinary disagreement.',
      },
    },
    sexual_explicit: {
      type: 'noul',
      instructions: context + 'Is the text sexually explicit: graphic description of sex acts or genitals meant to arouse?',
      criteria: {
        true: 'Graphic or pornographic sexual content.',
        false: 'Mentions of sex, dating, bodies, kink identity or sexual health without graphic detail.',
      },
    },
    solicitation: {
      type: 'noul',
      instructions: context + 'Is the text selling or advertising sexual content or services, or steering people to paid adult content?',
      criteria: {
        true: 'e.g. "DM for my menu", "subscribe for spicy content", escort ads, sugar arrangements.',
        false: 'No commercial sexual offer.',
      },
    },
    minors: {
      type: 'noul',
      instructions: context + 'Does the text sexualise anyone under 18, or seek sexual or romantic contact with a minor, or ask a minor to move to a private channel for such contact?',
      criteria: {
        true: 'Any sexual content involving minors, or grooming behaviour.',
        false: 'Nothing of the kind (ordinary mention of youth, age, or youth services is fine).',
      },
    },
    spam_or_scam: {
      type: 'noul',
      instructions: context + 'Is the text spam or a scam: bulk promotion, fake giveaways, crypto or money schemes, phishing, or unrelated advertising?',
      criteria: { true: 'Spam or scam.', false: 'A genuine post, including a member or local business sharing their own work or events.' },
    },
    outing_or_doxxing: {
      type: 'noul',
      instructions: context + 'Does the text reveal private information about someone else without their consent: outing a named person\'s ' +
        'sexual orientation, gender identity or trans status, deadnaming them, or posting their address, workplace, phone or similar?',
      criteria: { true: 'Exposes another identifiable person.', false: 'About the writer themself, public figures\' public roles, or no one identifiable.' },
    },
  }
  if (where === 'profile') {
    questions.adult_pointer = {
      type: 'noul',
      instructions: context + 'Does this profile point people toward the person\'s adult or explicit content elsewhere, even by hint ' +
        '(e.g. "🌶️ link", "18+ acc", "spicy account", "ask for my other page")?',
      criteria: { true: 'It directs people to adult content.', false: 'No pointer to adult content.' },
    }
  }

  const answers = await jev({ text }, questions)
  if (!answers) return null
  return Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v?.noul ?? 0]))
}

// ================================================================== jev

type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }

interface Answer { type: string; noul?: number; choice?: string; score?: number; probabilities?: Record<string, number> }

/** One call to Jev. Retries once on 429/529; null when unconfigured or failing. */
async function jev(state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer> | null> {
  if (!JEV_KEY) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${JEV_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state, questions }),
        signal: AbortSignal.timeout(8000),
      })
      if ((res.status === 429 || res.status === 529) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800))
        continue
      }
      if (!res.ok) { console.error('jev', res.status); return null }
      const out = await res.json()
      return out?.answers ?? null
    } catch {
      console.error('jev unreachable')
      return null
    }
  }
  return null
}
