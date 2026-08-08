import { useState } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import type { Channels } from '../lib/types'
import { ChevronDown } from './icons'
import { Toggle, font } from './ui'

/** "Events, offers and newsletters" → "Events and Newsletter" → "Not receiving updates". */
export function channelSummary(c: Channels, allowNewsletter = true): string {
  const on: string[] = []
  if (c.events) on.push('Events')
  if (c.offers) on.push('Offers')
  if (allowNewsletter && c.newsletter) on.push('Newsletter')
  if (!on.length) return 'Not receiving updates'
  if (on.length === 3) return 'Events, offers and newsletters'
  if (on.length === 1) return on[0]
  return `${on[0]} and ${on[1]}`
}

/**
 * Shown on a detail page only once the listing is saved. Hosts without a linked
 * listing do not offer the Newsletter channel.
 */
export function SubscriptionPanel({ entityId, allowNewsletter = true }: {
  entityId: string
  allowNewsletter?: boolean
}) {
  const { channels, toggleChannel, accent, tint } = useStore()
  const [open, setOpen] = useState(false)
  const c = channels(entityId)

  const rows: Array<[keyof Channels, string, string]> = [
    ['events', 'Events', 'New events and schedule changes'],
    ['offers', 'Offers', 'Coupons and member deals'],
    ['newsletter', 'Newsletter', 'Occasional updates by inbox'],
  ]

  return (
    <div style={{ background: tint, borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <div className="tap" onClick={() => setOpen(!open)}
           style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: font(700, 13.5, 1.25), color: accent }}>Subscribed</div>
          <div style={{ font: font(400, 12, 1.4), color: '#6E6A64', marginTop: 2 }}>
            {channelSummary(c, allowNewsletter)}
          </div>
        </div>
        <div style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease', display: 'flex' }}>
          <ChevronDown size={16} color={accent} />
        </div>
      </div>

      {open && (
        <div style={{ padding: '2px 14px 12px' }}>
          {rows.map(([key, label, note]) => {
            const disabled = key === 'newsletter' && !allowNewsletter
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                                      borderTop: `1px solid rgba(0,0,0,.05)` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 13.5, 1.25), color: C.ink }}>{label}</div>
                  <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 2 }}>
                    {disabled ? 'Only listings with a linked business or resource can send newsletters.' : note}
                  </div>
                </div>
                <Toggle on={!disabled && c[key]} disabled={disabled} onChange={() => toggleChannel(entityId, key)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
