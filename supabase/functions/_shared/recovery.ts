// The email address is never stored. Not in auth.users, not in profiles, not
// in a log. What is stored is a fingerprint that can confirm an address a
// person types, and cannot be turned back into one.
//
//   fingerprint = PBKDF2-SHA256( HMAC(EMAIL_PEPPER, address), per-account salt )
//
// The pepper is an Edge Function secret, so a copy of the database alone
// cannot even test a guess. With the pepper, a guess can be tested against
// one account at a time, at PBKDF2's cost per try, because every account has
// its own salt. There is no column anyone can scan to ask "is this person a
// member?".
//
// Supabase Auth needs an email to hang a password on; it gets a random alias
// on the reserved `.invalid` TLD, which can never receive mail.
//
// NEVER log a request body in these functions, and never put an address in
// an error message. A logged body is exactly the copy this design refuses to
// keep.

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// ------------------------------------------------------------ configuration

export interface MailConfig {
  pepper: string
  resendKey: string
  from: string
}

// Resend's shared test sender. It only delivers to the Resend account
// owner's own address; set MAIL_FROM to an address on a verified domain
// before real people sign up.
const TEST_SENDER = 'LGBTQ.UT <onboarding@resend.dev>'

/** Everything the email half needs, or null when a secret is missing. */
export function mailConfig(): MailConfig | null {
  const pepper = Deno.env.get('EMAIL_PEPPER') ?? ''
  const resendKey = Deno.env.get('RESEND_JORJACK_KEY') ?? Deno.env.get('RESEND_API_KEY') ?? ''
  const from = Deno.env.get('MAIL_FROM') || TEST_SENDER
  if (pepper.length < 32 || !resendKey) {
    console.error('mail: EMAIL_PEPPER (32+ chars) or the Resend key is not set')
    return null
  }
  return { pepper, resendKey, from }
}

// ---------------------------------------------------------------- addresses

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

export const looksLikeEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export const ALIAS_DOMAIN = 'accounts.lgbtqut.invalid'

/** The address Supabase Auth holds instead of the real one. */
export function newAlias(): string {
  return `${hex(crypto.getRandomValues(new Uint8Array(12)))}@${ALIAS_DOMAIN}`
}

// ------------------------------------------------------------------ crypto

const enc = new TextEncoder()

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

/** Compares without leaking where the first difference is. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const sameText = (a: string, b: string) => sameBytes(enc.encode(a), enc.encode(b))

async function hmac(pepper: string, label: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${label}\u0000${value}`)))
}

/** A keyed, deterministic tag — for short-lived rows that must be matched, never read. */
export async function mac(pepper: string, label: string, value: string): Promise<string> {
  return hex(await hmac(pepper, label, value))
}

// OWASP's current floor for PBKDF2-HMAC-SHA256.
const ITERATIONS = 600_000

async function derive(pepper: string, email: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await hmac(pepper, 'recovery', email)
  const key = await crypto.subtle.importKey('raw', material as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** The stored fingerprint: `pbkdf2-sha256$<iterations>$<salt>$<hash>`. */
export async function fingerprint(pepper: string, email: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pepper, email, salt, ITERATIONS)
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

/** Whether `email` is the address a fingerprint was made from. */
export async function matches(pepper: string, email: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$')
  const iterations = Number(iter)
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || !salt || !hash) return false
  return sameBytes(await derive(pepper, email, unb64(salt), iterations), unb64(hash))
}

/**
 * Spends the same time as a real check, so an unknown username answers no
 * faster than a known one with the wrong address.
 */
export async function decoy(pepper: string, email: string): Promise<void> {
  await derive(pepper, email, new Uint8Array(16), ITERATIONS)
}

/** SHA-256 as hex — for high-entropy secrets (tokens, device keys), where a plain hash is enough. */
export async function sha256Hex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))))
}

/** Six digits, uniformly — rejection sampling, not a biased modulo. */
export function sixDigitCode(): string {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  do crypto.getRandomValues(buf); while (buf[0] >= limit)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

// ------------------------------------------------------------------- mail

/**
 * Hands one message to Resend. This is the only place an address leaves the
 * function, and it is dropped from memory when the request ends.
 */
export async function sendMail(cfg: MailConfig, to: string, subject: string, text: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }),
    })
    if (!res.ok) console.error('mail: provider refused the message, status', res.status)
    return res.ok
  } catch {
    console.error('mail: provider unreachable')
    return false
  }
}

/** A short, plain message that reads the same with images and styles off. */
export function mailBody(lines: string[], action?: { label: string; href: string }): { text: string; html: string } {
  const text = [...lines, ...(action ? ['', action.href] : [])].join('\n')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1A1A18;max-width:460px">`
    + lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join('')
    + (action
      ? `<p style="margin:22px 0"><a href="${esc(action.href)}" style="display:inline-block;background:#7A2FA6;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(action.label)}</a></p>`
      : '')
    + `<p style="margin:22px 0 0;font-size:12.5px;color:#8C887F">LGBTQ.UT does not store your email address. We used it once, because you typed it, and did not keep it.</p></div>`
  return { text, html }
}
