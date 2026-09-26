// POST /auth-signup
//
//   { stage: 'start', email, login_username, dob }
//     → { challenge_id }                 a 6-digit code was emailed
//     → { error: 'under_13' | 'invalid_dob' | 'username_taken' | 'invalid_email'
//                | 'invalid_username' | 'too_many' | 'send_failed' | 'email_unavailable' }
//
//   { stage: 'finish', challenge_id, email, code, login_username, password, dob }
//     → { session }                      account created and signed in
//     → { error: 'under_13' | 'wrong_code' | 'code_expired' | 'too_many' | 'username_taken'
//                | 'weak_password' | 'invalid_dob' | 'failed' | 'email_unavailable' }
//
// The code proves the person can read that inbox. Neither stage stores the
// address: the challenge row holds a keyed tag of it, deleted on use or
// expiry, and the account holds only a fingerprint (see _shared/recovery.ts).
// The client resends the address with the code rather than the server
// remembering it.
//
// The date of birth is read, never kept: it becomes an age group (see
// _shared/age.ts). Under-13s are turned away before a code is sent — the
// client checks first, so their address should never leave the device, and
// this is the backstop.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  cors, fingerprint, json, looksLikeEmail, mac, mailBody, mailConfig, newAlias,
  normalizeEmail, sameText, sendMail, sixDigitCode,
} from '../_shared/recovery.ts'
import { MIN_ACCOUNT_AGE, ageGroup, ageOn, parseBirthday } from '../_shared/age.ts'

const CODE_TTL_MIN = 15
const MAX_CODES_PER_WINDOW = 3
const MAX_TRIES = 5

const USERNAME = /^[a-z0-9._-]{3,32}$/

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

  const email = normalizeEmail(String(body.email ?? ''))
  const username = String(body.login_username ?? '').trim().toLowerCase()
  // Age first: an under-13's request stops here, before anything is sent.
  const birthday = parseBirthday(String(body.dob ?? ''))
  if (!birthday) return json({ error: 'invalid_dob' }, 400)
  if (ageOn(birthday) < MIN_ACCOUNT_AGE) return json({ error: 'under_13' }, 403)

  if (!looksLikeEmail(email)) return json({ error: 'invalid_email' }, 400)
  if (!USERNAME.test(username)) return json({ error: 'invalid_username' }, 400)

  const taken = async () => {
    const { data } = await admin.from('profiles').select('id').eq('login_username', username).maybeSingle()
    return !!data
  }

  try {
    // ------------------------------------------------------------ start
    if (body.stage === 'start') {
      if (await taken()) return json({ error: 'username_taken' }, 409)

      const emailTag = await mac(cfg.pepper, 'challenge', email)
      await admin.from('email_challenges').delete().lt('expires_at', new Date().toISOString())
      const since = new Date(Date.now() - CODE_TTL_MIN * 60_000).toISOString()
      const { count } = await admin.from('email_challenges')
        .select('id', { count: 'exact', head: true }).eq('email_tag', emailTag).gte('created_at', since)
      if ((count ?? 0) >= MAX_CODES_PER_WINDOW) return json({ error: 'too_many' }, 429)

      const id = crypto.randomUUID()
      const code = sixDigitCode()
      const { error: insertError } = await admin.from('email_challenges').insert({
        id,
        email_tag: emailTag,
        code_tag: await mac(cfg.pepper, 'code', `${id}:${code}`),
        expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
      })
      if (insertError) {
        console.error('auth-signup: could not store challenge')
        return json({ error: 'failed' }, 500)
      }

      const { text, html } = mailBody([
        `Your LGBTQ.UT code is ${code}.`,
        `Enter it in the app to finish creating your account. It expires in ${CODE_TTL_MIN} minutes.`,
        'If you did not ask for this, ignore this email — no account is created without the code.',
      ])
      if (!await sendMail(cfg, email, `${code} is your LGBTQ.UT code`, text, html)) {
        await admin.from('email_challenges').delete().eq('id', id)
        return json({ error: 'send_failed' }, 502)
      }
      return json({ challenge_id: id })
    }

    // ----------------------------------------------------------- finish
    if (body.stage === 'finish') {
      const id = String(body.challenge_id ?? '')
      const code = String(body.code ?? '').replace(/\D/g, '')
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'weak_password' }, 400)

      const { data: challenge } = await admin.from('email_challenges')
        .select('id, email_tag, code_tag, attempts, expires_at').eq('id', id).maybeSingle()
      if (!challenge || new Date(challenge.expires_at) < new Date()) return json({ error: 'code_expired' }, 410)
      if (challenge.attempts >= MAX_TRIES) {
        await admin.from('email_challenges').delete().eq('id', id)
        return json({ error: 'too_many' }, 429)
      }

      const right = sameText(challenge.email_tag, await mac(cfg.pepper, 'challenge', email))
        && sameText(challenge.code_tag, await mac(cfg.pepper, 'code', `${id}:${code}`))
      if (!right) {
        await admin.from('email_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', id)
        return json({ error: 'wrong_code' }, 400)
      }

      if (await taken()) return json({ error: 'username_taken' }, 409)

      const alias = newAlias()
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: alias, password, email_confirm: true,
      })
      if (createError || !created.user) {
        const weak = /password/i.test(createError?.message ?? '')
        if (!weak) console.error('auth-signup: createUser failed')
        return json({ error: weak ? 'weak_password' : 'failed' }, weak ? 400 : 500)
      }
      const userId = created.user.id

      // Either both rows land or the account is removed again: an account
      // without a profile cannot sign in, and one without a fingerprint
      // cannot recover.
      const { error: profileError } = await admin.from('profiles')
        .insert({ id: userId, login_username: username, username: null, ...ageGroup(birthday) })
      const { error: recoveryError } = profileError
        ? { error: profileError }
        : await admin.from('account_recovery')
            .insert({ profile_id: userId, email_hash: await fingerprint(cfg.pepper, email) })
      if (profileError || recoveryError) {
        await admin.auth.admin.deleteUser(userId)
        const clash = (profileError as { code?: string } | null)?.code === '23505'
        if (!clash) console.error('auth-signup: could not save the new account')
        return json({ error: clash ? 'username_taken' : 'failed' }, clash ? 409 : 500)
      }

      await admin.from('email_challenges').delete().eq('id', id)

      const { data: signedIn, error: signInError } = await admin.auth.signInWithPassword({ email: alias, password })
      if (signInError || !signedIn.session) return json({ error: 'failed' }, 500)
      return json({ session: signedIn.session })
    }

    return json({ error: 'invalid_request' }, 400)
  } catch {
    console.error('auth-signup: unexpected failure')
    return json({ error: 'failed' }, 500)
  }
})
