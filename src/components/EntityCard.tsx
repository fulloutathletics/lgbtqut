import { useNavigate } from 'react-router-dom'
import type { EntityRef } from '../lib/types'
import { entityHref } from '../lib/data'
import { useStore } from '../lib/store'
import { C } from '../lib/theme'
import { Img, font } from './ui'
import { Verified } from './icons'

const LABEL: Record<EntityRef['kind'], string> = {
  resource: 'Resource',
  business: 'Business',
  host: 'Host',
}

/**
 * A compact card pointing at one face of an entity. An event uses it to name
 * its organiser; a resource or business uses it to point at its other faces.
 * The same profile, framed by wherever the reader came in from.
 */
export function EntityCard({ entity, eyebrow }: { entity: EntityRef; eyebrow?: string }) {
  const nav = useNavigate()
  const { accent } = useStore()

  return (
    <div>
      {eyebrow && (
        <div style={{ font: font(700, 11, 1.3), color: C.faint, textTransform: 'uppercase',
                      letterSpacing: '.09em', marginBottom: 9 }}>
          {eyebrow}
        </div>
      )}
      <div
        className="tap"
        role="button"
        onClick={() => nav(entityHref(entity))}
        style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 12,
                 border: `1px solid ${C.border}`, padding: '12px 14px' }}
      >
        <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', background: '#EFEDE9',
                      flex: 'none' }}>
          <Img src={entity.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ font: font(700, 14.5, 1.25), color: C.ink, minWidth: 0, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entity.name}
            </div>
            {entity.verified && <Verified color={accent} />}
          </div>
          <div style={{ font: font(400, 11.5, 1.3), color: C.muted, marginTop: 3 }}>
            {LABEL[entity.kind]} profile
          </div>
        </div>
      </div>
    </div>
  )
}
