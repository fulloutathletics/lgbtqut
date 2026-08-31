import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { replaceItemImage } from '../lib/imageEdit'
import type { ImageTable } from '../lib/imageEdit'
import { patchItemField } from '../lib/data'
import { useStore } from '../lib/store'
import { Camera } from './icons'

interface Props {
  table: ImageTable
  id: string
  column: string
  /** Overrides the default bottom-right placement — pass a size for a small target like an avatar. */
  style?: CSSProperties
}

const defaultStyle: CSSProperties = {
  position: 'absolute', bottom: 10, right: 10, width: 34, height: 34,
}

/**
 * Small camera button that swaps one row's image in place. Only rendered
 * while the viewer has edit mode on (toggled in the Image Manager) — it
 * writes straight to Supabase with no sign-in, so it should never render
 * unconditionally on a live, publicly-linked page. Must sit inside a
 * `position: relative` ancestor sized to the image it edits.
 */
export function EditImageButton({ table, id, column, style }: Props) {
  const { editMode } = useStore()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!editMode) return null

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const url = await replaceItemImage(table, id, column, file)
      patchItemField(table, id, column, url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onFile(file)
        }}
      />
      <button
        type="button"
        aria-label="Change image"
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); fileRef.current?.click() }}
        style={{
          ...defaultStyle, ...style,
          border: 0, borderRadius: 999, background: 'rgba(0,0,0,.6)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: busy ? 'default' : 'pointer', zIndex: 6,
        }}
      >
        {busy ? '…' : <Camera />}
      </button>
    </>
  )
}
