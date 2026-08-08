// Shared identity helpers for the two auth functions.
//
// The plaintext address exists only in local scope inside a request. It is
// never persisted, never returned, and never logged — see the operational
// rules in design-reference/Auth Handoff Spec.html. The most common leak is an
// exception handler that dumps its own input, so nothing here echoes `email`.

/** Trim and lowercase, nothing more. */
export function normalize(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * HMAC-SHA256 over the normalized address with a pepper from Vault.
 *
 * The pepper must NOT live in an env var beside the hashes it protects: email
 * space is enumerable and an unpeppered hash is reversible in minutes.
 */
export async function emailHash(normalized: string, pepper: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized))
  return new Uint8Array(sig)
}

/** Postgres bytea literal, the form PostgREST accepts for a bytea column. */
export function toBytea(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const ADJECTIVES = [
  'chosen', 'quiet', 'bright', 'wandering', 'steady', 'golden', 'candid', 'gentle',
  'amber', 'clever', 'humble', 'lucky', 'patient', 'rowdy', 'sunlit', 'tidal',
]
const NOUNS = [
  'twist', 'harbor', 'meadow', 'lantern', 'cedar', 'canyon', 'ember', 'thistle',
  'juniper', 'compass', 'willow', 'foxtail', 'pennant', 'garnet', 'basin', 'aspen',
]

/** adjective-noun-NNN@<ALIAS_DOMAIN> — the forwarder resolves it to the real inbox. */
export function mintAlias(domain: string): string {
  const pick = <T>(xs: T[]) => xs[crypto.getRandomValues(new Uint32Array(1))[0] % xs.length]
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}@${domain}`
}

/**
 * Registers alias → destination with the forwarder. This is the ONE call that
 * hands the real address to another system, and that system is deliberately a
 * separate AWS account (SES + Lambda) holding the only copy of the mapping.
 *
 * Set FORWARDER_URL and FORWARDER_TOKEN as function secrets. Until the
 * forwarder is stood up this throws, which fails signup loudly rather than
 * silently creating an account nobody can receive mail for.
 */
export async function registerWithForwarder(alias: string, destination: string): Promise<void> {
  const url = Deno.env.get('FORWARDER_URL')
  const token = Deno.env.get('FORWARDER_TOKEN')
  if (!url || !token) throw new Error('forwarder_not_configured')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ alias, destination }),
  })
  // Deliberately does not include the response body in the error — it may echo
  // the destination back.
  if (!res.ok) throw new Error(`forwarder_rejected_${res.status}`)
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
