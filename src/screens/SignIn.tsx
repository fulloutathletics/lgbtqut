import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { StickyBar, font } from '../components/ui'

// SignIn — route `/signin`.
//
// Auth answers "who owns this account?" — not "what do people see?"
// The login username is a private credential. The email is used by Supabase
// Auth for password recovery but is never shown socially. The social profile
// (display name, handle, pronouns, etc.) is a separate system the user can
// create, hide, or delete independently.

type Step = 'credentials' | 'dob' | 'review'
type Mode = 'signin' | 'signup'

const labelStyle = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase' as const, color: '#9A968F',
}

const inputStyle = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3),
  color: '#1A1A18', background: '#fff', boxSizing: 'border-box' as const,
}

interface SessionTokens {
  access_token: string
  refresh_token: string
}

export default function SignIn() {
  const nav = useNavigate()
  const { accent, tint } = useStore()

  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('credentials')

  const [loginUsername, setLoginUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const validate = (): string | null => {
    const username = loginUsername.trim()
    if (!username) return 'Pick a login username. You use it to sign in — nobody else sees it.'
    if (username.length < 3) return 'Username must be at least 3 characters.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (mode === 'signup' && !email.includes('@')) {
      return 'Enter an email address — it is used for password recovery only.'
    }
    return null
  }

  const submit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    if (mode === 'signup' && step === 'credentials') {
      setError('')
      setStep('dob')
      return
    }
    if (mode === 'signup' && step === 'dob') {
      if (!dob) {
        setError('A date of birth is required. It is what the 18+ and 21+ checks read.')
        return
      }
      setError('')
      setStep('review')
      return
    }

    setBusy(true)
    setError('')

    try {
      if (mode === 'signin') {
        // Sign in via the edge function that resolves username -> auth email
        const { data, error: fnError } = await supabase.functions.invoke<{
          session?: SessionTokens | null
          error?: string
        }>('auth-signin', {
          body: { login_username: loginUsername.trim(), password },
        })

        if (fnError || !data?.session) {
          setError('Wrong username or password. Check both and try again.')
          return
        }

        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) {
          setError('Signed in, but this device could not store the session. Try again.')
          return
        }
        nav('/profile')
      } else {
        // Sign up: create the auth account, then insert the profile row
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })

        if (signUpError) {
          setError(signUpError.message)
          return
        }
        if (!authData.user) {
          setError('Could not create your account. Try again.')
          return
        }

        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          login_username: loginUsername.trim().toLowerCase(),
          username: null,
          dob,
          recovery_email: email.trim(),
        })

        if (profileError) {
          setError('Account created, but we could not save your profile. Try signing in.')
          return
        }

        nav('/profile')
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const cta = busy ? 'Working…' : mode === 'signin'
    ? 'Sign in'
    : step === 'credentials'
      ? 'Continue'
      : step === 'dob'
        ? 'Continue'
        : 'Create my account'

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <StickyBar title={mode === 'signup' ? 'Create an account' : 'Sign in'}
                 onBack={() => {
                   if (step !== 'credentials') { setStep('credentials'); setError('') }
                   else nav(-1)
                 }} />

      <div style={{ padding: '20px 18px 32px' }}>
        <div style={{ background: tint, borderRadius: 12, padding: '14px 15px' }}>
          <div style={{ font: font(400, 13, 1.6), color: C.body, textWrap: 'pretty' }}>
            Your login username and email stay private. They are for account access only —
            nothing here shows up on a public profile unless you create one.
          </div>
        </div>

        {step === 'credentials' && (
          <>
            <div style={{ display: 'flex', gap: 7, background: C.fill, borderRadius: 999, padding: 4, marginTop: 20 }}>
              {([['signin', 'I have an account'], ['signup', 'Create an account']] as const).map(([key, label]) => {
                const on = mode === key
                return (
                  <div key={key} className="tap" role="button"
                       onClick={() => { setMode(key); setError('') }}
                       style={{ flex: 1, textAlign: 'center', borderRadius: 999, padding: '9px 10px',
                                background: on ? '#fff' : 'transparent',
                                boxShadow: on ? '0 1px 4px rgba(0,0,0,.10)' : 'none',
                                font: font(on ? 700 : 600, 12.5, 1.2), color: on ? accent : '#7C7871' }}>
                    {label}
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={labelStyle}>Login username</div>
              <input
                value={loginUsername}
                autoComplete="username"
                placeholder="winterfox482"
                onChange={(e) => setLoginUsername(e.target.value)}
                style={inputStyle} />
              <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
                Private. You use it to sign in. Nobody else sees it.
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={labelStyle}>Password</div>
              <input
                value={password}
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle} />
            </div>

            {mode === 'signup' && (
              <div style={{ marginTop: 16 }}>
                <div style={labelStyle}>Email — for recovery only</div>
                <input
                  value={email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle} />
                <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
                  Used only to recover your account if you forget your password. Never shown publicly.
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="tap" role="button"
                   onClick={() => { /* TODO: password reset flow */ }}
                   style={{ font: font(600, 12.5, 1.3), color: accent, marginTop: 14, display: 'inline-block' }}>
                Forgot your password?
              </div>
            )}
          </>
        )}

        {step === 'dob' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              Your date of birth stays private. It is stored as a date, never as an age, and used
              only to decide what the app can show you.
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={labelStyle}>Date of birth</div>
              <input
                value={dob}
                type="date"
                onChange={(e) => setDob(e.target.value)}
                style={inputStyle} />
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              Review your details. You can change your password and email later.
            </div>
            <div style={{ marginTop: 16, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ font: font(600, 13, 1.4), color: C.ink }}>{loginUsername}</div>
              <div style={{ font: font(400, 12, 1.4), color: C.muted, marginTop: 4 }}>{email}</div>
              <div style={{ font: font(400, 12, 1.4), color: C.muted, marginTop: 2 }}>DOB: {dob}</div>
            </div>
          </>
        )}

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
          {cta}
        </div>

        <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 16, textWrap: 'pretty',
                      textAlign: 'center' }}>
          Authentication and social identity are separate systems. Your account lets you
          participate. A public profile is optional and created separately.
        </div>
      </div>
    </div>
  )
}
