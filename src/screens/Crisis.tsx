import { RichText } from '../components/RichText'
import { StickyBar, font } from '../components/ui'
import { telHref } from '../lib/data'
import { useStore } from '../lib/store'
import { C } from '../lib/theme'
import { useData } from '../lib/useData'

/**
 * Deliberately quiet: no imagery, no counts, no search. One card per line with
 * a single unambiguous action, so the screen reads at a glance under stress.
 */
export default function Crisis() {
  const data = useData()
  const { accent } = useStore()

  if (!data) return <div />

  return (
    <>
      <StickyBar title="Crisis Resources" />

      <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ font: font(400, 14, 1.55), color: C.body, textWrap: 'pretty', marginBottom: 2 }}>
          You are not alone. Help is available right now — free and confidential.
        </div>

        {data.crisis.map((line) => (
          <div
            key={line.name}
            style={{ borderRadius: 14, border: `1px solid ${C.border}`, background: '#fff',
                     padding: '16px 17px', boxShadow: '0 3px 14px rgba(0,0,0,.06)' }}
          >
            <div style={{ font: font(700, 15, 1.25), color: C.ink }}>{line.name}</div>
            <RichText text={line.desc}
                      style={{ font: font(400, 13, 1.5), color: '#6E6A64', marginTop: 5 }} />
            <a
              href={telHref(line.tel)}
              style={{ display: 'block', marginTop: 13, borderRadius: 10, padding: '11px 14px',
                       background: accent, color: '#fff', font: font(700, 13.5, 1.2),
                       textAlign: 'center', textDecoration: 'none' }}
            >
              {line.action}
            </a>
          </div>
        ))}

        <div style={{ font: font(400, 12.5, 1.5), color: C.muted, marginTop: 6, textAlign: 'center' }}>
          If you are in immediate danger, call 911.
        </div>
      </div>
    </>
  )
}
