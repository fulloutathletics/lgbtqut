// Client-side re-encode so images pushed through the Upload screen don't
// eat storage quota. Only JPEG/WebP are touched — PNG is usually flat-color
// UI art relying on lossless output, and GIF/SVG can't be canvas-compressed
// safely (animation, vector data). Filename and mime type are preserved so
// this is a safe drop-in for both "add" and "replace" uploads.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/webp'])
const MAX_DIMENSION = 2048
const QUALITY = 0.82

export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type)) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, QUALITY)
    )
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name, { type: file.type, lastModified: Date.now() })
  } catch {
    // Decoding failed (corrupt file, unsupported variant) — upload as-is
    // rather than blocking the manager on a compression bug.
    return file
  }
}
