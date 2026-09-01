import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { Pencil } from './icons'

/** Admin console sections, keyed the way `/admin/:kind` expects them. */
export type AdminSection = 'events' | 'hosts' | 'businesses' | 'resources' | 'splash-tabs' | 'crisis-lines'

/**
 * Jumps a super-admin from a page straight to that row's editor in the admin
 * console. Rendered only for `isAdmin` — RLS refuses the writes for anyone
 * else, so for them the button would lead to a form that cannot save.
 *
 * Unlike EditImageButton this is not behind edit mode: it only navigates, and
 * having to switch a mode on to reach the editor is the friction it exists to
 * remove.
 */
export function AdminEditButton({ section, id, style }: {
  section: AdminSection
  id: string
  style?: CSSProperties
}) {
  const nav = useNavigate()
  const { isAdmin } = useStore()

  if (!isAdmin) return null

  // A plain div rather than <Tap>, which does not forward an aria-label — an
  // icon-only control needs one to be announced at all.
  return (
    <div
      className="tap"
      role="button"
      aria-label="Edit in admin console"
      onClick={(e) => { e.stopPropagation(); nav(`/admin/${section}/${encodeURIComponent(id)}`) }}
      style={{ width: 34, height: 34, borderRadius: 999, background: C.fill, display: 'flex',
               alignItems: 'center', justifyContent: 'center', flex: 'none', ...style }}
    >
      <Pencil />
    </div>
  )
}
