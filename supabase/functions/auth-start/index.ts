// POST /auth-start
//   in:  { email, username?, dob? }
//   out: { status: "code_sent" }   ← identical for new and existing accounts
//
// The response must not vary with whether the account exists. A distinguishable
// response turns this endpoint into an oracle for whether a given person has an
// account in a queer directory, which is precisely the disclosure the whole
// design exists to prevent.
//
// Deploy with request logging DISABLED: Supabase logs function payloads by
// default, and the address arrives in the request body.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, emailHash, json, mintAlias, normalize, registerWithForwarder, toBytea } from '../_shared/identity.ts'

const ALIAS_DOMAIN = Deno.env.get('ALIAS_DOMAIN') ?? 'anonymous.appuser.io'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { email, username, dob } = await req.json()
    if (typeof email !== 'string' || !email.includes('@')) {
      return json({ error: 'invalid_request' }, 400)
    }

    const normalized = normalize(email)

    // The pepper lives in Vault, not in an env var beside the hashes.
    const { data: secret, error: vaultError } = await admin
      .schema('vault').from('decrypted_secrets')
      .select('decrypted_secret').eq('name', 'EMAIL_PEPPER').single()
    if (vaultError || !secret) throw new Error('pepper_unavailable')

    const hash = toBytea(await emailHash(normalized, secret.decrypted_secret))

    let { data: profile } = await admin
      .from('profiles').select('id, alias').eq('email_hash', hash).maybeSingle()

    if (!profile) {
      // New account. Signup needs a username and a date of birth — the DOB is
      // what the 18+/21+ gates are evaluated against, so it is not optional.
      if (typeof username !== 'string' || !username.trim() || typeof dob !== 'string') {
        // Still an indistinguishable shape: a caller probing a stranger's
        // address without signup fields cannot tell this from success.
        return json({ status: 'code_sent' })
      }

      const alias = mintAlias(ALIAS_DOMAIN)
      await registerWithForwarder(alias, normalized) // leaves our infrastructure here

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: alias,
        email_confirm: true,
      })
      if (createError || !created.user) throw new Error('create_failed')

      const { error: insertError } = await admin.from('profiles').insert({
        id: created.user.id, email_hash: hash, alias, username: username.trim(), dob,
      })
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id)
        throw new Error('profile_insert_failed')
      }

      profile = { id: created.user.id, alias }
    }

    // Routes via the forwarder, so the OTP reaches a destination we do not hold.
    const { error: otpError } = await admin.auth.signInWithOtp({ email: profile.alias })
    if (otpError) throw new Error('otp_failed')

    return json({ status: 'code_sent' })
    // `normalized` goes out of scope here and was never persisted or logged.
  } catch (err) {
    // Never log the request body. Only the error's own name reaches the log.
    console.error('auth-start failed:', err instanceof Error ? err.message : 'unknown')
    return json({ status: 'code_sent' })
  }
})
