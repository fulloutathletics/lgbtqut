import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { compressImage } from '../lib/imageCompress'
import { C } from '../lib/theme'
import { font } from '../components/ui'
import { Back } from '../components/icons'
import type { CSSProperties } from 'react'

const BUCKET = 'app-images'

interface StorageItem {
  name: string
  id: string | null
  updated_at: string | null
  metadata: { size: number; mimetype: string }
  publicUrl: string
}

const FOLDERS = ['splash', 'menu-cards', 'resources', 'businesses', 'hosts', 'events']

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Upload() {
  const nav = useNavigate()
  const { accent, editMode, setEditMode } = useStore()
  const [folder, setFolder] = useState('splash')
  const [items, setItems] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<StorageItem | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
      limit: 200,
    })
    if (error) {
      setError(error.message)
      setItems([])
    } else {
      const mapped: StorageItem[] = (data ?? []).map((f) => ({
        name: f.name,
        id: f.id,
        updated_at: f.updated_at,
        metadata: f.metadata ?? { size: 0, mimetype: '' },
        publicUrl: supabase.storage.from(BUCKET).getPublicUrl(`${folder}/${f.name}`).data.publicUrl,
      }))
      setItems(mapped)
    }
    setLoading(false)
  }, [folder])

  useEffect(() => { void load() }, [load])

  const doUpload = useCallback(async (files: FileList | File[], path?: string) => {
    setUploading(true)
    setError(null)
    setNotice(null)
    const arr = Array.from(files)
    let beforeBytes = 0
    let afterBytes = 0
    let failed = false
    for (const file of arr) {
      const compressed = await compressImage(file)
      beforeBytes += file.size
      afterBytes += compressed.size
      const filePath = path ?? `${folder}/${compressed.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, compressed, {
        upsert: true,
        contentType: compressed.type,
      })
      if (upErr) {
        setError(upErr.message)
        failed = true
        break
      }
    }
    if (!failed) {
      const saved = Math.round((1 - afterBytes / beforeBytes) * 100)
      if (saved > 0) setNotice(`Compressed ${arr.length === 1 ? 'image' : 'images'} by ${saved}% (${fmtSize(beforeBytes)} → ${fmtSize(afterBytes)}).`)
    }
    setUploading(false)
    setReplaceTarget(null)
    if (fileRef.current) fileRef.current.value = ''
    void load()
  }, [folder, load])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void doUpload(e.target.files)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) void doUpload(e.dataTransfer.files)
  }

  const onReplace = (item: StorageItem) => {
    setReplaceTarget(item)
    fileRef.current?.click()
  }

  const onReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length && replaceTarget) {
      void doUpload(e.target.files, `${folder}/${replaceTarget.name}`)
    }
  }

  const onDelete = async (item: StorageItem) => {
    const { error: delErr } = await supabase.storage.from(BUCKET).remove([`${folder}/${item.name}`])
    if (delErr) {
      setError(delErr.message)
      return
    }
    void load()
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <>
      <div style={stickyBarStyle}>
        <button onClick={() => nav(-1)} style={backBtnStyle}><Back /></button>
        <span style={{ font: font(700, 16, 1.2), color: C.ink, flex: 1 }}>Image Manager</span>
      </div>

      <div style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 12, background: C.fill,
                    display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: font(600, 13.5, 1.3), color: C.ink }}>Edit images on pages</div>
          <div style={{ font: font(400, 11.5, 1.4), color: C.muted, marginTop: 2 }}>
            Shows a camera button on every resource, business, host, event, and splash image so you can
            replace it right where it appears — no need to come back here.
          </div>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          aria-pressed={editMode}
          style={{
            border: 0, borderRadius: 999, width: 46, height: 27, padding: 3, flex: 'none', cursor: 'pointer',
            background: editMode ? accent : C.border, transition: 'background .15s',
          }}
        >
          <div style={{
            width: 21, height: 21, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
            transform: editMode ? 'translateX(19px)' : 'translateX(0)', transition: 'transform .15s',
          }} />
        </button>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ font: font(700, 11, 1.3), color: C.muted, textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 8 }}>
          Folder
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {FOLDERS.map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              style={{
                ...folderBtnStyle,
                background: f === folder ? accent : C.fill,
                color: f === folder ? '#fff' : C.body,
                font: font(600, 13, 1.3),
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          margin: '14px 16px', borderRadius: 14, padding: '28px 20px', textAlign: 'center',
          border: `2px dashed ${dragOver ? accent : C.border}`, background: dragOver ? '#FAFAF8' : C.fill,
          cursor: 'pointer', transition: 'border-color .15s, background .15s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          onChange={replaceTarget ? onReplaceFile : onFileChange}
          style={{ display: 'none' }}
        />
        <div style={{ font: font(600, 15, 1.4), color: C.ink }}>
          {uploading ? 'Uploading…' : replaceTarget ? `Replace "${replaceTarget.name}"` : 'Drop images or tap to browse'}
        </div>
        <div style={{ font: font(400, 12, 1.4), color: C.muted, marginTop: 4 }}>
          PNG, JPEG, WebP, GIF, SVG — up to 10 MB each
        </div>
      </div>

      {error && (
        <div style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 10,
                      background: C.dangerBg, color: C.danger, font: font(500, 13, 1.4) }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 10,
                      background: C.fill, color: C.body, font: font(500, 13, 1.4) }}>
          {notice}
        </div>
      )}

      {/* Image grid */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', font: font(400, 14, 1.5), color: C.muted }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', font: font(400, 14, 1.5), color: C.muted }}>
          No images in <strong>{folder}</strong> yet. Upload some above.
        </div>
      ) : (
        <div style={{ padding: '0 16px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
              background: '#fff', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ width: '100%', aspectRatio: '1', background: C.fill, position: 'relative', overflow: 'hidden' }}>
                <img
                  src={item.publicUrl}
                  alt={item.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div style={{ padding: '8px 10px', flex: 1 }}>
                <div style={{ font: font(600, 12, 1.3), color: C.ink, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ font: font(400, 10.5, 1.3), color: C.muted, marginTop: 2 }}>
                  {fmtSize(item.metadata?.size ?? 0)} · {fmtDate(item.updated_at ?? '')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '0 10px 10px' }}>
                <button onClick={() => copyUrl(item.publicUrl)} style={actionBtnStyle(accent)}>
                  {copied === item.publicUrl ? 'Copied!' : 'Copy URL'}
                </button>
                <button onClick={() => onReplace(item)} style={actionBtnStyle(C.fill, C.body)}>
                  Replace
                </button>
                <button onClick={() => onDelete(item)} style={actionBtnStyle(C.dangerBg, C.danger)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

const stickyBarStyle: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,.94)',
  backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.hairline}`,
  padding: '56px 14px 11px', display: 'flex', alignItems: 'center', gap: 11,
}

const backBtnStyle: CSSProperties = {
  width: 34, height: 34, borderRadius: 999, border: 0, background: C.fill, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
}

const folderBtnStyle: CSSProperties = {
  border: 0, borderRadius: 999, padding: '7px 14px', cursor: 'pointer',
}

function actionBtnStyle(bg: string, color: string = '#fff'): CSSProperties {
  return {
    border: 0, borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
    background: bg, color, font: font(600, 11, 1.3), flex: 1,
    whiteSpace: 'nowrap',
  }
}
