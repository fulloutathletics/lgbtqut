// POST /auth-reset
//   in:  { login_username, email, redirect_to }
//   out: { ok: true }   — always, whatever happened
//
// The person proves they know the address the account was made with. It is
// hashed and checked against that account's fingerprint; on a match, a
// recovery link is minted for the account's alias and mailed to the address
// they just typed. Nothing on file could have told us where to send it.
//
// The answer never varies. A different reply for "no such username", "wrong
// address" or "slow down" would let anyone test whether a person has an
// account in a queer directory. An unknown username is checked against a
// decoy so it takes as long as a real one.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  cors, decoy, json, looksLikeEmail, mailBody, mailConfig, matches, normalizeEmail, sendMail,
} from '../_shared/recovery.ts'

const MAX_PER_HOUR = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors })

  const cfg = mailConfig()
  if (!cfg) return json({ error: 'email_unavailable' }, 503)

  const ok = json({ ok: true })

  try {
    const body = await req.json()
    const username = String(body.login_username ?? '').trim().toLowerCase()
    const email = normalizeEmail(String(body.email ?? ''))
    const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : undefined
    if (!username || !looksLikeEmail(email)) return ok

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: profile } = await admin.from('profiles').select('id').eq('login_username', username).maybeSingle()
    const { data: recovery } = profile
      ? await admin.from('account_recovery')
          .select('email_hash, window_start, window_count').eq('profile_id', profile.id).maybeSingle()
      : { data: null }

    if (!profile || !recovery) {
      await decoy(cfg.pepper, email)
      return ok
    }

    // At most MAX_PER_HOUR tries per account, counted whether or not the
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

    const { data: user } = await admin.auth.admin.getUserById(profile.id)
    const alias = user?.user?.email
    if (!alias) return ok

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery', email: alias, options: redirectTo ? { redirectTo } : undefined,
    })
    const href = link?.properties?.action_link
    if (linkError || !href) {
      console.error('auth-reset: could not mint a recovery link')
      return ok
    }

    const { text, html } = mailBody([
      'Someone asked to reset the password for an LGBTQ.UT account that was created with this email address.',
      'If it was you, use the button below within the hour. If it was not, ignore this — your password has not changed.',
    ], { label: 'Set a new password', href })
    await sendMail(cfg, email, 'Reset your LGBTQ.UT password', text, html)
    return ok
  } catch {
    console.error('auth-reset: unexpected failure')
    return ok
  }
})
