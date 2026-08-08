// POST /auth-verify
//   in:  { email, code }
//   out: { session }
//
// Resolves the address to its alias by peppered hash, then verifies the OTP
// against the alias — the only identity Supabase Auth knows about.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, emailHash, json, normalize, toBytea } from '../_shared/identity.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { email, code } = await req.json()
    if (typeof email !== 'string' || typeof code !== 'string') {
      return json({ error: 'invalid_request' }, 400)
    }

    const { data: secret, error: vaultError } = await admin
      .schema('vault').from('decrypted_secrets')
      .select('decrypted_secret').eq('name', 'EMAIL_PEPPER').single()
    if (vaultError || !secret) throw new Error('pepper_unavailable')

    const hash = toBytea(await emailHash(normalize(email), secret.decrypted_secret))

    const { data: profile } = await admin
      .from('profiles').select('alias').eq('email_hash', hash).maybeSingle()

    // Same generic failure whether the account is absent or the code is wrong.
    if (!profile) return json({ error: 'invalid_code' }, 400)

    const { data, error } = await admin.auth.verifyOtp({
      email: profile.alias, token: code, type: 'email',
    })
    if (error || !data.session) return json({ error: 'invalid_code' }, 400)

    return json({ session: data.session })
  } catch (err) {
    console.error('auth-verify failed:', err instanceof Error ? err.message : 'unknown')
    return json({ error: 'invalid_code' }, 400)
  }
})
