import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { font } from './ui'

// The social half of the app — the feed and people's profiles — is not
// offered on a device where sign-up met someone under 13. Nothing is
// collected from them either way; this keeps the experience to the
// directory, which is what a younger visitor is here for.

export function SocialOnly({ children }: { children: ReactNode }) {
  const { under13, accent } = useStore()
  const nav = useNavigate()
  if (!under13) return <>{children}</>
  return (
    <div style={{ padding: '96px 28px 40px', textAlign: 'center' }}>
      <div style={{ font: font(800, 20, 1.3), color: C.ink, letterSpacing: '-.01em' }}>
        This part of LGBTQ.UT is for people 13 and older
      </div>
      <div style={{ font: font(400, 14, 1.6), color: C.muted, marginTop: 10, textWrap: 'pretty' }}>
        Resources, crisis lines, events and businesses are all open to you.
      </div>
      <div className="tap" role="button" onClick={() => nav('/')}
           style={{ display: 'inline-block', marginTop: 20, borderRadius: 999, padding: '11px 24px',
                    background: accent, font: font(700, 14, 1.2), color: '#fff' }}>
        Browse resources
      </div>
    </div>
  )
}
