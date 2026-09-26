// POST /auth-reset — two stages, both from the same open screen.
//
//   { stage: 'request', login_username, email, device_hash }
//     out: { ok: true } — always, whatever happened
//
//   { stage: 'complete', device_secret, code, password }
//     out: { session } | { error: 'invalid_code' | 'weak_password' | 'failed' }
//
// Request: the person proves they know the address the account was made with.
// It is hashed and checked against that account's fingerprint; on a match, a
// 6-digit code goes to the address they just typed. The answer never varies —
// a different reply for "no such username", "wrong address" or "slow down"
// would let anyone test whether a person has an account in a queer directory.
//
// The code alone is not enough. The screen that asked keeps a random secret
// and sent only its hash; completing needs that secret *and* the code, within
// 15 minutes, in at most a few tries. The person types the code back into the
// screen they asked from — the home-screen app, Safari, whatever it was — so
// it works everywhere, and the copy of the email every sending service keeps
// in its logs cannot reset anything. There is no link to phish, either.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  cors, decoy, json, looksLikeEmail, mac, mailBody, mailConfig, matches, normalizeEmail,
  sameText, sendMail, sha256Hex, sixDigitCode,
} from '../_shared/recovery.ts'

const MAX_PER_HOUR = 5
const CODE_TTL_MIN = 15
const MAX_TRIES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors })

  const cfg = mailConfig()
  if (!cfg) return json({ error: 'email_unavailable' }, 503)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid_request' }, 400) }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // ------------------------------------------------------------ complete
  if (body.stage === 'complete') {
    try {
      const secret = String(body.device_secret ?? '')
      const code = String(body.code ?? '').replace(/\D/g, '')
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'weak_password' }, 400)
      if (secret.length < 20 || code.length !== 6) return json({ error: 'invalid_code' }, 400)

      // Only this device's live tickets are candidates, so a code without the
      // secret matches nothing at all.
      const { data: tickets } = await admin.from('reset_tickets')
        .select('id, profile_id, code_tag, attempts')
        .eq('device_hash', await sha256Hex(secret))
        .gt('expires_at', new Date().toISOString())
        .lt('attempts', MAX_TRIES)
        .order('created_at', { ascending: false }).limit(5)

      let hit: { id: string; profile_id: string } | null = null
      for (const t of tickets ?? []) {
        if (sameText(t.code_tag, await mac(cfg.pepper, 'reset', `${t.id}:${code}`))) { hit = t; break }
      }
      if (!hit) {
        for (const t of tickets ?? []) {
          await admin.from('reset_tickets').update({ attempts: t.attempts + 1 }).eq('id', t.id)
        }
        return json({ error: 'invalid_code' }, 400)
      }

      const { data: user, error: updateError } = await admin.auth.admin.updateUserById(hit.profile_id, { password })
      if (updateError || !user?.user?.email) {
        const weak = /password/i.test(updateError?.message ?? '')
        if (!weak) console.error('auth-reset: could not update the password')
        return json({ error: weak ? 'weak_password' : 'failed' }, weak ? 400 : 500)
      }
      // Spent: this code, and any other outstanding ones for the account.
      await admin.from('reset_tickets').delete().eq('profile_id', hit.profile_id)

      // Sign this device in, and every other session out: a reset is often
      // the moment someone suspects another person has the account.
      const { data: signedIn } = await admin.auth.signInWithPassword({ email: user.user.email, password })
      const session = signedIn?.session ?? null
      if (session) await admin.auth.admin.signOut(session.access_token, 'others')
      return json({ session })
    } catch {
      console.error('auth-reset: unexpected failure completing a reset')
      return json({ error: 'failed' }, 500)
    }
  }

  // ------------------------------------------------------------- request
  const ok = json({ ok: true })
  try {
    const username = String(body.login_username ?? '').trim().toLowerCase()
    const email = normalizeEmail(String(body.email ?? ''))
    const deviceHash = String(body.device_hash ?? '')
    if (!username || !looksLikeEmail(email) || !/^[0-9a-f]{64}$/.test(deviceHash)) return ok

    const { data: profile } = await admin.from('profiles').select('id').eq('login_username', username).maybeSingle()
    const { data: recovery } = profile
      ? await admin.from('account_recovery')
          .select('email_hash, window_start, window_count').eq('profile_id', profile.id).maybeSingle()
      : { data: null }

    if (!profile || !recovery) {
      await decoy(cfg.pepper, email)
      return ok
    }

    // At most MAX_PER_HOUR requests per account, counted whether or not the
    // address was right, so the fingerprint cannot be guessed at speed.
    const now = Date.now()
    const fresh = !recovery.window_start || now - new Date(recovery.window_start).getTime() > 3_600_000
    const count = fresh ? 1 : recovery.window_count + 1
    await admin.from('account_recovery').update({
      window_start: fresh ? new Date(now).toISOString() : recovery.window_start,
      window_count: count,
    }).eq('profile_id', profile.id)
    if (count > MAX_PER_HOUR) {
      await decoy(cfg.pepper, email)
      return ok
    }

    if (!await matches(cfg.pepper, email, recovery.email_hash)) return ok

    await admin.from('reset_tickets').delete().lt('expires_at', new Date().toISOString())
    const id = crypto.randomUUID()
    const code = sixDigitCode()
    const { error: insertError } = await admin.from('reset_tickets').insert({
      id,
      profile_id: profile.id,
      device_hash: deviceHash,
      code_tag: await mac(cfg.pepper, 'reset', `${id}:${code}`),
      expires_at: new Date(now + CODE_TTL_MIN * 60_000).toISOString(),
    })
    if (insertError) {
      console.error('auth-reset: could not store the reset ticket')
      return ok
    }

    const { text, html } = mailBody([
      `Your LGBTQ.UT password reset code is ${code}.`,
      `Enter it in the app, on the screen where you asked for it. It expires in ${CODE_TTL_MIN} minutes and works nowhere else.`,
      'If you did not ask for this, ignore it — your password has not changed, and the code is useless to anyone else.',
    ])
    await sendMail(cfg, email, `${code} is your LGBTQ.UT reset code`, text, html)
    return ok
  } catch {
    console.error('auth-reset: unexpected failure')
    return ok
  }
})
