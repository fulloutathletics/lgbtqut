import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { StickyBar, font } from '../components/ui'

// SignIn — route `/signin`.
//
// Per the Auth Handoff Spec the client never touches supabase.auth.signInWithOtp.
// It calls two Edge Functions instead:
//
//   auth-start  { email, username?, dob? }  -> { status: 'code_sent' }
//   auth-verify { email, code }             -> { session }
//
// auth-start returns an identical response whether or not the account already
// exists. A distinguishable response would turn this screen into an oracle for
// whether a given person has an account in a queer directory, so the UI shows
// exactly one success message for every outcome and never branches on it.

type Step = 'email' | 'code'
type Mode = 'signin' | 'signup'

/** Shown after auth-start, always, for both new and existing accounts. */
const SENT_MESSAGE = 'If that address can receive mail, a six-digit code is on its way. Enter it below.'

interface SessionTokens {
  access_token: string
  refresh_token: string
}

interface VerifyPayload {
  session?: SessionTokens | null
  data?: { session?: SessionTokens | null } | null
  error?: { message?: string } | null
}

function readSession(payload: VerifyPayload | null): SessionTokens | null {
  if (!payload) return null
  return payload.session ?? payload.data?.session ?? null
}

const labelStyle = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase' as const, color: '#9A968F',
}

const inputStyle = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3),
  color: '#1A1A18', background: '#fff', boxSizing: 'border-box' as const,
}

export default function SignIn() {
  const nav = useNavigate()
  const { accent, tint } = useStore()

  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('email')

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [dob, setDob] = useState('')
  const [code, setCode] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const start = async () => {
    const address = email.trim()
    if (!address || !address.includes('@')) {
      setError('Enter the email address you want the code sent to.')
      return
    }
    if (mode === 'signup' && !username.trim()) {
      setError('Pick a username. It stays private unless you add a public profile.')
      return
    }
    if (mode === 'signup' && !dob) {
      setError('A date of birth is required. It is what the 18+ and 21+ checks read.')
      return
    }

    setBusy(true)
    setError('')
    try {
      // The body carries username and dob only on the create path; auth-start
      // uses them when it mints a new account and ignores them otherwise.
      const body = mode === 'signup'
        ? { email: address, username: username.trim(), dob }
        : { email: address }

      const { error: fnError } = await supabase.functions.invoke('auth-start', { body })

      if (fnError) {
        // Deliberately generic: this reports that the call failed, never
        // whether an account for this address exists.
        setError('We could not send a code right now. Please try again in a moment.')
        return
      }

      // Same message for a brand new account and an existing one.
      setNotice(SENT_MESSAGE)
      setStep('code')
    } catch {
      setError('We could not send a code right now. Please try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    const digits = code.trim()
    if (digits.length !== 6) {
      setError('The code is six digits.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await supabase.functions
        .invoke<VerifyPayload>('auth-verify', { body: { email: email.trim(), code: digits } })

      if (fnError) {
        setError('That code did not work. Check it, or ask for a new one.')
        return
      }

      const session = readSession(data ?? null)
      if (!session) {
        setError(data?.error?.message || 'That code did not work. Check it, or ask for a new one.')
        return
      }

      const { error: sessionError } = await supabase.auth.setSession(session)
      if (sessionError) {
        setError('Signed in, but this device could not store the session. Try again.')
        return
      }

      nav('/profile')
    } catch {
      setError('That code did not work. Check it, or ask for a new one.')
    } finally {
      setBusy(false)
    }
  }

  const submit = () => { void (step === 'email' ? start() : verify()) }

  const cta = busy ? 'Working…' : step === 'email'
    ? (mode === 'signup' ? 'Create my account' : 'Send me a code')
    : 'Verify and sign in'

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <StickyBar title={step === 'email' ? (mode === 'signup' ? 'Create an account' : 'Sign in') : 'Enter your code'}
                 onBack={() => { if (step === 'code') { setStep('email'); setNotice(''); setError('') } else nav(-1) }} />

      <div style={{ padding: '20px 18px 32px' }}>
        {/* Two sentences, no jargon — this is the whole reason the flow exists. */}
        <div style={{ background: tint, borderRadius: 12, padding: '14px 15px' }}>
          <div style={{ font: font(400, 13, 1.6), color: C.body, textWrap: 'pretty' }}>
            We never keep your email address. You get a code to sign in, and anything we send you afterwards travels
            through a stand-in address that forwards to your inbox.
          </div>
        </div>

        {step === 'email' && (
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
              <div style={labelStyle}>Email</div>
              <input
                value={email}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle} />
            </div>

            {mode === 'signup' && (
              <>
                <div style={{ marginTop: 16 }}>
                  <div style={labelStyle}>Username</div>
                  <input
                    value={username}
                    autoComplete="username"
                    placeholder="sagebrush_kid"
                    onChange={(e) => setUsername(e.target.value)}
                    style={inputStyle} />
                  <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
                    Private. Nobody sees it unless you add a public profile.
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={labelStyle}>Date of birth</div>
                  <input
                    value={dob}
                    type="date"
                    onChange={(e) => setDob(e.target.value)}
                    style={inputStyle} />
                  <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
                    Required. Stored as a date, never as an age, and used only to decide what the app can show you.
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {step === 'code' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              {notice || SENT_MESSAGE}
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={labelStyle}>Six-digit code</div>
              <input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, font: font(600, 20, 1.2), letterSpacing: '.3em', textAlign: 'center' }} />
            </div>

            <div className="tap" role="button"
                 onClick={() => { if (!busy) { setCode(''); setStep('email'); setError('') } }}
                 style={{ font: font(600, 12.5, 1.3), color: accent, marginTop: 14, display: 'inline-block' }}>
              Use a different address
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
             onClick={() => { if (!busy) submit() }}
             aria-disabled={busy}
             style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                      background: busy ? C.border : accent,
                      font: font(700, 14.5, 1.2), color: busy ? C.faint : '#fff',
                      cursor: busy ? 'not-allowed' : 'pointer' }}>
          {cta}
        </div>

        <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 16, textWrap: 'pretty',
                      textAlign: 'center' }}>
          There is no password to forget and no address on file to leak.
        </div>
      </div>
    </div>
  )
}
