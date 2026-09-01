// Whether this account has been through /welcome on this device. Kept local
// on purpose: the flow is a one-time nudge, not account state, and the
// profiles row exposes no column a client may write for it.

const key = (profileId: string) => `lgbtqut.onboarded.${profileId}`

export function markOnboarded(profileId: string) {
  try { localStorage.setItem(key(profileId), '1') } catch { /* private mode */ }
}

export function isOnboarded(profileId: string): boolean {
  try { return localStorage.getItem(key(profileId)) === '1' } catch { return true }
}
