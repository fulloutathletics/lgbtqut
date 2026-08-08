// Edge Function stub for transactional email (e.g. host application approvals,
// broadcast alerts). The app DB never stores raw emails — this function should
// be the only place a real address is handled, resolved just-in-time from
// whatever hashed/opaque identifier auth uses. See Auth Handoff Spec before
// filling this in.

Deno.serve(async (req) => {
  const { to, subject, body } = await req.json()

  if (!to || !subject || !body) {
    return new Response(JSON.stringify({ error: 'Missing to, subject, or body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // TODO: call an email provider (e.g. Resend) with a secret pulled from
  // Supabase Edge Function secrets — never hardcode provider keys here.

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
