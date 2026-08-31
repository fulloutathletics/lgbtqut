import { supabase } from './supabase'
import { compressImage } from './imageCompress'

const BUCKET = 'app-images'

export type ImageTable = 'splash_tabs' | 'resources' | 'businesses' | 'hosts' | 'events' | 'county_images' | 'community_images' | 'category_images'

const FOLDER: Record<ImageTable, string> = {
  splash_tabs: 'splash',
  resources: 'resources',
  businesses: 'businesses',
  hosts: 'hosts',
  events: 'events',
  county_images: 'counties',
  community_images: 'communities',
  category_images: 'categories',
}

function extOf(file: File): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? file.type.split('/')[1] ?? 'jpg'
}

/**
 * Uploads a replacement image for one row's image column and writes the
 * resulting public URL straight to that row — no admin UI in between. Each
 * upload gets a unique filename rather than upserting the old one, so the
 * public URL (and every cache/CDN edge in front of it) changes immediately
 * instead of serving a stale cached copy of the old bytes at the same URL.
 * The previous object is left in the bucket rather than deleted; an orphaned
 * thumbnail costs far less than a delete racing a still-loading page.
 */
export async function replaceItemImage(
  table: ImageTable, id: string, column: string, file: File,
): Promise<string> {
  const compressed = await compressImage(file)
  const path = `${FOLDER[table]}/${id}-${column}-${Date.now()}.${extOf(compressed)}`
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, compressed, { contentType: compressed.type })
  if (upErr) throw upErr

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const { error: dbErr } = await supabase.from(table).update({ [column]: data.publicUrl }).eq('id', id)
  if (dbErr) throw dbErr

  return data.publicUrl
}
