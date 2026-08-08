import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { Nav } from './icons'
import { font } from './ui'

const TABS = [
  { to: '/', label: 'Resources', key: 'resources', match: (p: string) => p === '/' || p.startsWith('/resource') || p.startsWith('/list') || p.startsWith('/crisis') },
  { to: '/events', label: 'Events', key: 'events', match: (p: string) => p.startsWith('/event') || p.startsWith('/host') },
  { to: '/shop', label: 'Shop Queer', key: 'shop', match: (p: string) => p.startsWith('/shop') || p.startsWith('/business') },
  { to: '/profile', label: 'Profile', key: 'profile', match: (p: string) => p.startsWith('/profile') || p.startsWith('/u/') || p.startsWith('/apply') },
] as const

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { accent } = useStore()

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff',
                  maxWidth: 480, margin: '0 auto', boxShadow: '0 0 60px rgba(0,0,0,.06)' }}>
      <div className="hs" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
        <div style={{ height: 28 }} />
      </div>

      <nav style={{ display: 'flex', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.96)',
                    backdropFilter: 'blur(12px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => {
          const active = t.match(pathname)
          const color = active ? accent : '#9A968F'
          return (
            <Link key={t.key} to={t.to}
                  style={{ flex: 1, minHeight: 44, padding: '9px 0 10px', display: 'flex', flexDirection: 'column',
                           alignItems: 'center', gap: 3, textDecoration: 'none' }}>
              {Nav[t.key](color)}
              <span style={{ font: font(600, 9.5, 1.2), color }}>{t.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
