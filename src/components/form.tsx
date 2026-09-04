import type { CSSProperties, ReactNode } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { font } from './ui'

// The small form kit the account flows share — sign-up, onboarding, page
// requests and page editing all read as one screen family because of it.

export const labelStyle: CSSProperties = {
  font: font(600, 10.5, 1.2), letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#9A968F',
}

export const fieldStyle: CSSProperties = {
  width: '100%', marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 11,
  padding: '12px 13px', outline: 'none', font: font(500, 14.5, 1.3),
  color: '#1A1A18', background: '#fff', boxSizing: 'border-box',
}

export function Field({ label, value, onChange, placeholder, hint, type = 'text', multiline, rows = 3, autoComplete }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: ReactNode
  type?: string
  multiline?: boolean
  rows?: number
  autoComplete?: string
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={labelStyle}>{label}</div>
      {multiline ? (
        <textarea value={value} rows={rows} placeholder={placeholder}
                  onChange={(e) => onChange(e.target.value)}
                  style={{ ...fieldStyle, font: font(400, 14, 1.55), resize: 'none' }} />
      ) : (
        <input value={value} type={type} placeholder={placeholder} autoComplete={autoComplete}
               onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
      )}
      {hint && (
        <div style={{ font: font(400, 11.5, 1.5), color: C.faint, marginTop: 6, textWrap: 'pretty' }}>{hint}</div>
      )}
    </div>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <div style={{ font: font(800, 24, 1.15), color: '#111', letterSpacing: '-.02em', textWrap: 'pretty' }}>
      {children}
    </div>
  )
}

export function Note({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ font: font(400, 14, 1.55), color: '#6E6A64', marginTop: 9, textWrap: 'pretty', ...style }}>
      {children}
    </div>
  )
}

/** Full-width primary action. `secondary` renders the outlined form. */
export function Button({ children, onClick, disabled, secondary, style }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean; style?: CSSProperties
}) {
  const { accent } = useStore()
  return (
    <div className="tap" role="button" aria-disabled={disabled}
         onClick={() => { if (!disabled) onClick?.() }}
         style={{ borderRadius: 12, padding: 14, textAlign: 'center', font: font(700, 14.5, 1.2),
                  background: disabled ? C.border : secondary ? '#fff' : accent,
                  border: secondary ? `1.5px solid ${C.border}` : 'none',
                  color: disabled ? C.faint : secondary ? C.body : '#fff',
                  cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
      {children}
    </div>
  )
}

/** A selectable card: title, optional tag, one-line description. Used for intents and sources. */
export function ChoiceCard({ label, sub, tag, on, onClick, multi }: {
  label: string; sub: string; tag?: string; on: boolean; onClick: () => void; multi?: boolean
}) {
  const { accent, tint } = useStore()
  return (
    <div className="tap" role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={onClick}
         style={{ border: `1.5px solid ${on ? accent : '#EAE7E2'}`, borderRadius: 14, padding: 15,
                  background: on ? tint : '#FCFBF9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 22, height: 22, borderRadius: multi ? 7 : 999, flex: 'none', marginTop: 1,
                    border: `2px solid ${on ? accent : C.border}`, background: on ? accent : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {on && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ font: font(700, 15, 1.2), color: '#161615', flex: 1, minWidth: 0 }}>{label}</div>
          {tag && (
            <span style={{ borderRadius: 4, padding: '2px 6px', background: tint, font: font(700, 9, 1.4),
                           color: accent, letterSpacing: '.05em', flex: 'none' }}>{tag}</span>
          )}
        </div>
        <div style={{ font: font(400, 12.5, 1.5), color: '#7C7871', marginTop: 5, textWrap: 'pretty' }}>{sub}</div>
      </div>
    </div>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 16, borderRadius: 12, background: C.dangerBg, border: '1px solid #F0E0E0',
                  padding: '12px 14px', font: font(500, 12.5, 1.5), color: C.danger, textWrap: 'pretty' }}>
      {children}
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>{children}</div>
}

/** Sticky flow header: back button, title, step line, progress bar. */
export function FlowHeader({ title, sub, progress, onBack }: {
  title: string; sub?: string; progress?: { at: number; of: number }; onBack: () => void
}) {
  const { accent } = useStore()
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(255,255,255,.96)',
                  backdropFilter: 'blur(12px)', borderBottom: `1px solid #EFECE8`,
                  padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="tap" role="button" onClick={onBack}
             style={{ width: 34, height: 34, borderRadius: 999, background: '#F1EFEB', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2A2A28" strokeWidth="2.4"
               strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: font(700, 16, 1.2), color: '#161615' }}>{title}</div>
          {sub && <div style={{ font: font(400, 11.5, 1.3), color: '#8A867F', marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {progress && (
        <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
          {Array.from({ length: progress.of }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 999,
                                  background: i <= progress.at ? accent : C.border }} />
          ))}
        </div>
      )}
    </div>
  )
}
