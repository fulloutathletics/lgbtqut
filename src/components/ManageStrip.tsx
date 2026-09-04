import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import type { EntityKind } from '../lib/types'
import { font } from './ui'

/**
 * Shown at the top of a page's public face to the people who run it. It is
 * how an admin gets from the page everyone sees to the one they edit, without
 * a separate "my pages" mental model — you find your page the way anyone does.
 */
export function ManageStrip({ kind, id }: { kind: EntityKind; id: string }) {
  const nav = useNavigate()
  const { administers, accent, tint } = useStore()
  if (!administers(kind, id)) return null
  return (
    <div className="tap" role="button" onClick={() => nav(`/manage/${kind}/${id}`)}
         style={{ margin: '14px 16px', display: 'flex', alignItems: 'center', gap: 11, background: tint,
                  borderRadius: 12, padding: '11px 14px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: font(700, 13, 1.25), color: accent }}>You manage this page</div>
        <div style={{ font: font(400, 11.5, 1.4), color: '#6E6A64', marginTop: 2 }}>
          Edit details, post as it, and run its events.
        </div>
      </div>
      <div style={{ borderRadius: 999, background: accent, color: '#fff', padding: '7px 14px',
                    font: font(700, 12, 1.2), flex: 'none' }}>Manage</div>
    </div>
  )
}
