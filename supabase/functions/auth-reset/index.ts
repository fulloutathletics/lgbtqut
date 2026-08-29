// POST /auth-reset
//   in:  { login_username }
//   out: { ok: true } | { error }
//
// Resolves the login_username to the auth email, then triggers a
// Supabase password reset email. The user receives an email with a
// link that redirects to /reset?code=<otp> where they set a new password.
//
// We always return { ok: true } for valid usernames to avoid leaking
// which usernames exist. For unknown usernames, we silently succeed
// (the email simply never arrives).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const { login_username } = await req.json()
    if (typeof login_username !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Look up the profile by login_username to get the user id
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('login_username', login_username.trim().toLowerCase())
      .maybeSingle()

    if (profile) {
      // Look up the auth email from the user's record
      const { data: user } = await admin.auth.admin.getUserById(profile.id)
      if (user?.user?.email) {
        // Send the password reset email via the anon client (not admin)
        // so the email link uses the public site URL
        const anon = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        )
        await anon.auth.resetPasswordForEmail(user.user.email, {
          redirectTo: `${new URL(req.url).origin}/reset`,
        })
      }
    }

    // Always return ok to avoid username enumeration
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('auth-reset failed:', err instanceof Error ? err.message : 'unknown')
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
