import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { StickyBar, font } from '../components/ui'
import { useTrail } from '../lib/trail'

// SignIn — route `/signin`.
//
// Auth answers "who owns this account?" — not "what do people see?"
// The login username is a private credential. The email address is never
// stored anywhere: sign-up proves the person can read that inbox with a
// 6-digit code, and the account keeps only a one-way fingerprint of it (see
// supabase/functions/_shared/recovery.ts). To reset a password, the person
// types the address again and the link goes to what they typed. The social
// profile is a separate system the user can create, hide, or delete.

type Step = 'credentials' | 'review' | 'code' | 'too-young' | 'forgot' | 'forgot-sent'
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

/** Whole years between a `YYYY-MM-DD` birthday and today, or null when the date is not usable. */
function yearsOld(dob: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return null
  const now = new Date()
  let age = now.getFullYear() - Number(m[1])
  const month = now.getMonth() + 1 - Number(m[2])
  if (month < 0 || (month === 0 && now.getDate() < Number(m[3]))) age--
  return age >= 0 && age < 125 ? age : null
}

/** The 1st of the month after someone's 13th birthday — when this device lets them sign up. */
function monthAfter13(dob: string): string {
  const [y, m] = dob.split('-').map(Number)
  return new Date(Date.UTC(y + 13, m, 1)).toISOString().slice(0, 10)
}

const AGE_LABEL = (age: number) => (age >= 21 ? '21+' : age >= 18 ? '18–20' : 'Under 18')

const SIGNUP_ERRORS: Record<string, string> = {
  username_taken: 'That login username is taken. Pick another.',
  invalid_username: 'Usernames are 3–32 characters: letters, numbers, dots, dashes and underscores.',
  invalid_email: 'That email address does not look right. Check it and try again.',
  too_many: 'Too many tries. Wait a few minutes, then ask for a new code.',
  send_failed: 'We could not send the code. Check the address and try again.',
  wrong_code: 'That code is not right. Check the email and try again.',
  code_expired: 'That code has expired. Ask for a new one.',
  weak_password: 'Choose a stronger password — at least 8 characters.',
  invalid_dob: 'Enter a real date of birth.',
  under_13: 'You need to be 13 or older to create an account.',
  email_unavailable: 'Creating accounts is paused while email is being set up. Try again soon.',
}

/** The error code a function returned, whether it came back as data or as an HTTP error. */
async function fnError(data: { error?: string } | null, error: unknown): Promise<string | null> {
  if (data?.error) return data.error
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try { return ((await ctx.json()) as { error?: string }).error ?? 'failed' } catch { return 'failed' }
  }
  return error ? 'failed' : null
}

function TooYoung() {
  const nav = useNavigate()
  const { accent, tint } = useStore()
  return (
    <div style={{ marginTop: 22, borderRadius: 14, background: tint, padding: '20px 18px' }}>
      <div style={{ font: font(800, 18, 1.3), color: C.ink, letterSpacing: '-.01em' }}>
        Accounts are for people 13 and older
      </div>
      <div style={{ font: font(400, 13.5, 1.6), color: C.body, marginTop: 8, textWrap: 'pretty' }}>
        You can still use LGBTQ.UT without one. Resources, crisis lines, events and businesses are all
        open to you, and anything you save stays on this device. We did not keep your birthday or send
        it anywhere.
      </div>
      <div className="tap" role="button" onClick={() => nav('/')}
           style={{ marginTop: 16, borderRadius: 12, padding: 13, textAlign: 'center', background: accent,
                    font: font(700, 14, 1.2), color: '#fff' }}>
        Browse resources
      </div>
      <div className="tap" role="button" onClick={() => nav('/crisis')}
           style={{ marginTop: 10, textAlign: 'center', font: font(600, 13, 1.3), color: accent }}>
        Need someone to talk to now?
      </div>
    </div>
  )
}

export default function SignIn() {
  const nav = useNavigate()
  const { back } = useTrail()
  const { accent, tint, under13, setUnder13Until } = useStore()

  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('credentials')

  const [loginUsername, setLoginUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  /** The birthday has been checked for this sign-up: the rest of the form can show. */
  const [ageOk, setAgeOk] = useState(false)
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const validate = (): string | null => {
    const username = loginUsername.trim()
    if (!username) return 'Pick a login username. You use it to sign in — nobody else sees it.'
    if (username.length < 3) return 'Username must be at least 3 characters.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (mode === 'signup' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Enter an email address. It is only for resetting your password, and it is not stored.'
    }
    return null
  }

  const submit = async () => {
    if (step === 'forgot') {
      const username = loginUsername.trim()
      if (!username || !email.includes('@')) {
        setError('Enter your login username and the email address you signed up with.')
        return
      }
      setBusy(true)
      setError('')
      try {
        const { data, error: invokeError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('auth-reset', {
          body: { login_username: username, email: email.trim(), redirect_to: `${window.location.origin}/reset` },
        })
        if ((await fnError(data, invokeError)) === 'email_unavailable') {
          setError(SIGNUP_ERRORS.email_unavailable.replace('Creating accounts', 'Password reset'))
          return
        }
        setStep('forgot-sent')
      } catch {
        setError('Something went wrong. Try again.')
      } finally {
        setBusy(false)
      }
      return
    }

    // Sign-up asks for the birthday before anything else, so an under-13's
    // email address never leaves the device. The date is checked here and
    // sent once, at the end; the server keeps only the age group.
    if (mode === 'signup' && step === 'credentials' && !ageOk) {
      const age = yearsOld(dob)
      if (age === null || new Date(dob) > new Date()) {
        setError('Enter your date of birth.')
        return
      }
      setError('')
      if (age < 13) {
        setUnder13Until(monthAfter13(dob))
        setDob('')
        setStep('too-young')
        return
      }
      setAgeOk(true)
      return
    }

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    if (mode === 'signup' && step === 'credentials') {
      setError('')
      setStep('review')
      return
    }

    if (mode === 'signup' && (step === 'review' || step === 'code')) {
      if (step === 'code' && !/^\d{6}$/.test(code.trim())) {
        setError('Enter the 6-digit code from the email.')
        return
      }
      setBusy(true)
      setError('')
      try {
        if (step === 'review') await sendCode()
        else await finishSignUp()
      } catch {
        setError('Something went wrong. Try again.')
      } finally {
        setBusy(false)
      }
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
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Emails a 6-digit code to the address. Nothing is stored but a keyed tag of it. */
  const sendCode = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke<{ challenge_id?: string; error?: string }>(
      'auth-signup', { body: { stage: 'start', email: email.trim(), login_username: loginUsername.trim(), dob } })
    const problem = await fnError(data, invokeError)
    if (problem === 'under_13') {
      setUnder13Until(monthAfter13(dob))
      setStep('too-young')
      return
    }
    if (problem || !data?.challenge_id) {
      setError(SIGNUP_ERRORS[problem ?? ''] ?? 'Something went wrong. Try again.')
      if (problem === 'username_taken' || problem === 'invalid_username' || problem === 'invalid_email') {
        setStep('credentials')
      }
      return
    }
    setChallengeId(data.challenge_id)
    setCode('')
    setStep('code')
  }

  /** Creates the account. The server re-checks the code against the address sent with it. */
  const finishSignUp = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke<{ session?: SessionTokens; error?: string }>(
      'auth-signup', {
        body: {
          stage: 'finish', challenge_id: challengeId, email: email.trim(), code: code.trim(),
          login_username: loginUsername.trim(), password, dob,
        },
      })
    const problem = await fnError(data, invokeError)
    if (problem || !data?.session) {
      setError(SIGNUP_ERRORS[problem ?? ''] ?? 'Something went wrong. Try again.')
      if (problem === 'username_taken' || problem === 'weak_password') setStep('credentials')
      return
    }
    const { error: sessionError } = await supabase.auth.setSession(data.session)
    if (sessionError) {
      setError('Your account was created. Sign in with your username and password.')
      setMode('signin')
      setStep('credentials')
      return
    }
    // A new account goes through the welcome flow once: personal profile,
    // and any pages the person wants to run. Returning sign-ins skip it.
    nav('/welcome', { replace: true })
  }

  const cta = busy ? 'Working…'
    : step === 'forgot' ? 'Send reset link'
    : step === 'forgot-sent' ? 'Back to sign in'
    : mode === 'signin' ? 'Sign in'
    : step === 'credentials' ? 'Continue'
    : step === 'review' ? 'Email me a code'
    : 'Create my account'

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      <StickyBar title={step === 'forgot' || step === 'forgot-sent' ? 'Reset password' : mode === 'signup' ? 'Create an account' : 'Sign in'}
                 onBack={() => {
                   if (step === 'forgot' || step === 'forgot-sent') { setStep('credentials'); setError(''); setInfo('') }
                   else if (step === 'code') { setStep('review'); setError('') }
                   else if (step === 'too-young') back()
                   else if (step === 'credentials' && mode === 'signup' && ageOk) { setAgeOk(false); setError('') }
                   else if (step !== 'credentials') { setStep('credentials'); setError('') }
                   else back()
                 }} />

      <div style={{ padding: '20px 18px 32px' }}>
        <div style={{ background: tint, borderRadius: 12, padding: '14px 15px' }}>
          <div style={{ font: font(400, 13, 1.6), color: C.body, textWrap: 'pretty' }}>
            Your login username stays private, and your email address is never stored — not even
            where we could read it. Nothing here shows up on a public profile unless you create one.
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

            {mode === 'signup' && under13 ? (
              <TooYoung />
            ) : mode === 'signup' && !ageOk ? (
              <>
                <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 22, textWrap: 'pretty' }}>
                  First, your date of birth. We use your birthday once to work out your age group — it
                  decides whether 18+ and 21+ listings show. We don't keep it.
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={labelStyle}>Date of birth</div>
                  <input
                    value={dob}
                    type="date"
                    onChange={(e) => setDob(e.target.value)}
                    style={inputStyle} />
                </div>
              </>
            ) : (
            <>
            {mode === 'signup' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
                            font: font(500, 12.5, 1.3), color: C.muted }}>
                Age group: <b style={{ font: font(700, 12.5, 1.3), color: C.ink }}>{AGE_LABEL(yearsOld(dob) ?? 0)}</b>
                <span className="tap" role="button" onClick={() => setAgeOk(false)}
                      style={{ color: accent, font: font(600, 12.5, 1.3) }}>Change</span>
              </div>
            )}
            <div style={{ marginTop: mode === 'signup' ? 16 : 22 }}>
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
                <div style={labelStyle}>Email — for password resets only</div>
                <input
                  value={email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle} />
                <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>
                  We check it with a code, then keep only a one-way fingerprint. To reset your password
                  you type it again, and the link goes there. We never email you anything else.
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="tap" role="button"
                   onClick={() => { setStep('forgot'); setError(''); setInfo('') }}
                   style={{ font: font(600, 12.5, 1.3), color: accent, marginTop: 14, display: 'inline-block' }}>
                Forgot your password?
              </div>
            )}
            </>
            )}
          </>
        )}

        {step === 'forgot' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              We do not keep your email address, so we cannot look it up. Enter your login username
              and the address you signed up with; if they match, we send a reset link there. It
              expires in one hour.
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={labelStyle}>Login username</div>
              <input
                value={loginUsername}
                autoComplete="username"
                placeholder="winterfox482"
                onChange={(e) => setLoginUsername(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={labelStyle}>Email you signed up with</div>
              <input
                value={email}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle} />
            </div>
          </>
        )}

        {step === 'forgot-sent' && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ font: font(700, 18, 1.3), color: C.ink, letterSpacing: '-.01em' }}>
              Check your email
            </div>
            <div style={{ font: font(400, 14, 1.55), color: C.muted, marginTop: 10, textWrap: 'pretty',
                          maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
              If that username and email address belong together, a reset link is on its way. Open it
              on this device to set a new password. Nothing arriving? Check the address you typed
              is the one you signed up with.
            </div>
          </div>
        )}

        {step === 'too-young' && <TooYoung />}

        {step === 'review' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              Check your details. Next we email a 6-digit code to that address to make sure it is yours.
            </div>
            <div style={{ marginTop: 16, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ font: font(600, 13, 1.4), color: C.ink }}>{loginUsername}</div>
              <div style={{ font: font(400, 12, 1.4), color: C.muted, marginTop: 4 }}>{email}</div>
              <div style={{ font: font(400, 12, 1.4), color: C.muted, marginTop: 2 }}>
                Age group: {AGE_LABEL(yearsOld(dob) ?? 0)} — your birthday itself is not stored
              </div>
            </div>
          </>
        )}

        {step === 'code' && (
          <>
            <div style={{ font: font(400, 13, 1.55), color: C.body, marginTop: 20, textWrap: 'pretty' }}>
              We sent a 6-digit code to <b style={{ fontWeight: 700 }}>{email.trim()}</b>. It expires in
              15 minutes.
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={labelStyle}>Code</div>
              <input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, font: font(700, 22, 1.2), letterSpacing: '.3em', textAlign: 'center' }} />
            </div>
            <div className="tap" role="button"
                 onClick={() => { if (!busy) { setError(''); setBusy(true); void sendCode().finally(() => setBusy(false)) } }}
                 style={{ font: font(600, 12.5, 1.3), color: accent, marginTop: 14, display: 'inline-block' }}>
              Send a new code
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

        {info && (
          <div style={{ marginTop: 18, borderRadius: 12, background: '#F0F7F4',
                        border: `1px solid #D5E8E0`, padding: '12px 14px',
                        font: font(500, 12.5, 1.5), color: '#2E7D5B', textWrap: 'pretty' }}>
            {info}
          </div>
        )}

        {step !== 'forgot-sent' && step !== 'too-young' && !(step === 'credentials' && mode === 'signup' && under13) && (
          <div className="tap" role="button"
               onClick={() => { if (!busy) void submit() }}
               aria-disabled={busy}
               style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                        background: busy ? C.border : accent,
                        font: font(700, 14.5, 1.2), color: busy ? C.faint : '#fff',
                        cursor: busy ? 'not-allowed' : 'pointer' }}>
            {cta}
          </div>
        )}

        {step === 'forgot-sent' && (
          <div className="tap" role="button"
               onClick={() => { setStep('credentials'); setInfo('') }}
               style={{ marginTop: 22, borderRadius: 12, padding: 14, textAlign: 'center',
                        background: accent,
                        font: font(700, 14.5, 1.2), color: '#fff' }}>
            {cta}
          </div>
        )}

        <div style={{ font: font(400, 11.5, 1.55), color: C.faint, marginTop: 16, textWrap: 'pretty',
                      textAlign: 'center' }}>
          Authentication and social identity are separate systems. Your account lets you
          participate. A public profile is optional and created separately.
        </div>
      </div>
    </div>
  )
}
