import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { StickyBar, font } from '../components/ui'

// Reset — route `/reset`.
//
// Supabase password reset emails link here with a recovery token in the
// URL hash (#access_token=... or ?code=...). The user sets a new password,
// which updates their auth account. After success, they go to sign-in.

const labelStyle = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase' as const, color: '#9A968F',
}

const inputStyle = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3),
  color: '#1A1A18', background: '#fff', boxSizing: 'border-box' as const,
}

export default function Reset() {
  const nav = useNavigate()
  const { accent, tint } = useStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  // Supabase puts the recovery token in the URL hash. Exchange it for a
  // session before we can update the password.
  useEffect(() => {
    const hash = window.location.hash || ''
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (type === 'recovery' && accessToken && refreshToken) {
      void supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(() => setReady(true))
    } else {
      // Try the code-based flow (PKCE)
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        void supabase.auth.exchangeCodeForSession(code).then(() => setReady(true))
      } else {
        setReady(true)
      }
    }
  }, [])

  const submit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <StickyBar title="Set a new password" onBack={() => nav('/signin')} />

      <div style={{ padding: '20px 18px 32px' }}>
        {!ready ? (
          <div style={{ padding: 30, textAlign: 'center', font: font(400, 14, 1.4), color: C.muted }}>
            Loading…
          </div>
        ) : done ? (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ font: font(700, 18, 1.3), color: C.ink, letterSpacing: '-.01em' }}>
              Password updated
            </div>
            <div style={{ font: font(400, 14, 1.55), color: C.muted, marginTop: 10, textWrap: 'pretty',
                          maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
              Your password has been changed. Sign in with your username and new password.
            </div>
            <div className="tap" role="button" onClick={() => nav('/signin')}
                 style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                          background: accent, font: font(700, 14.5, 1.2), color: '#fff' }}>
              Sign in
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: tint, borderRadius: 12, padding: '14px 15px' }}>
              <div style={{ font: font(400, 13, 1.6), color: C.body, textWrap: 'pretty' }}>
                Choose a new password for your account. This replaces your old one immediately.
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={labelStyle}>New password</div>
              <input
                value={password}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle} />
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={labelStyle}>Confirm password</div>
              <input
                value={confirm}
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle} />
            </div>

            {error && (
              <div style={{ marginTop: 18, borderRadius: 12, background: C.dangerBg,
                            border: `1px solid #F0E0E0`, padding: '12px 14px',
                            font: font(500, 12.5, 1.5), color: C.danger, textWrap: 'pretty' }}>
                {error}
              </div>
            )}

            <div className="tap" role="button"
                 onClick={() => { if (!busy) void submit() }}
                 aria-disabled={busy}
                 style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                          background: busy ? C.border : accent,
                          font: font(700, 14.5, 1.2), color: busy ? C.faint : '#fff',
                          cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Updating…' : 'Set new password'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
