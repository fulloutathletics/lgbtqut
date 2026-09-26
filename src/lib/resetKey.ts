// The device half of a password reset. The email carries a 6-digit code; the
// screen that asked keeps a random secret and sent only its hash. auth-reset
// completes a reset only with both, so the copy of the email a sending
// service keeps in its logs is useless on its own.
//
// Kept in localStorage too, so closing the app while waiting for the email
// does not strand the code: the person reopens the same app or browser, where
// this storage lives, and types it in.

const KEY = 'lgbtqut.resetKey'
const TTL_MS = 15 * 60 * 1000 // matches the code's lifetime in auth-reset

interface Stored { secret: string; at: number }

function read(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Stored | null
    return s && typeof s.secret === 'string' && Date.now() - s.at < TTL_MS ? s : null
  } catch {
    return null
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The secret for this reset and the hash to send with the request. Reuses a
 * live secret, so asking for a second code leaves the first one usable too.
 */
export async function resetDeviceKey(): Promise<{ secret: string; hash: string }> {
  let s = read()
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const secret = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    s = { secret, at: Date.now() }
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: held in memory by the caller */ }
  }
  return { secret: s.secret, hash: await sha256Hex(s.secret) }
}

/** This device's secret, if it asked for a reset within the last 15 minutes. */
export const resetDeviceSecret = (): string | null => read()?.secret ?? null

export function clearResetKey() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
