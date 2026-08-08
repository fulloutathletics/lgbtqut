import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { StickyBar, font } from './ui'

/**
 * Interstitial for a listing the viewer may not see.
 *
 * Minors are never told content was filtered — no tag, no reason, no hidden
 * count. The explanatory version appears only for adults who deliberately
 * opted out via Profile → Account → Age settings.
 */
export function AgeGate({ reason }: { reason?: string | null }) {
  const { signedIn, age, hideAdult } = useStore()
  const optedOut = signedIn && age !== null && age >= 18 && hideAdult

  return (
    <>
      <StickyBar title="" />
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ font: font(800, 21, 1.25), color: C.ink, letterSpacing: '-.01em' }}>Not available</div>
        <div style={{ font: font(400, 14.5, 1.55), color: C.muted, marginTop: 9, textWrap: 'pretty' }}>
          {optedOut
            ? `This listing is hidden because you turned off age-restricted content.${reason ? ` Reason: ${reason.toLowerCase()}.` : ''} You can change that in Profile → Account.`
            : 'This listing is not available on your account.'}
        </div>
      </div>
    </>
  )
}
