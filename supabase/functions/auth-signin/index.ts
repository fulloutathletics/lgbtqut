// POST /auth-signin
//   in:  { login_username, password }
//   out: { session } | { error }
//
// Resolves the login_username to the auth email, then signs in with
// password using the Supabase admin client. The login_username is a
// private credential — it never appears in any public-facing context.

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
    const { login_username, password } = await req.json()
    if (typeof login_username !== 'string' || typeof password !== 'string') {
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
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('login_username', login_username.trim().toLowerCase())
      .maybeSingle()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the auth email from the user's record
    const { data: user, error: userError } = await admin.auth.admin.getUserById(profile.id)
    if (userError || !user.user) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sign in with the real email and password
    const { data, error: signInError } = await admin.auth.signInWithPassword({
      email: user.user.email!,
      password,
    })

    if (signInError || !data.session) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ session: data.session }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('auth-signin failed:', err instanceof Error ? err.message : 'unknown')
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
