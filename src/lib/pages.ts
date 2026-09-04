import { supabase } from './supabase'
import { entityRef } from './data'
import type { AppData, EntityKind, EntityRef, ManagedPage, PageRequest } from './types'

// One account, many faces.
//
// A person has at most one *personal* profile (social_profiles) and any
// number of *pages* — the resource, business and host listings they
// administer (entity_admins). The personal profile is theirs alone; a page
// belongs to the organisation and may have several admins. Nothing here
// creates a page or grants access: a request is filed and a reviewer acts
// on it. What this module does is make the two halves legible to the app.

export const PAGE_KIND: Record<EntityKind, {
  label: string
  plural: string
  /** What the page is for, in the reader's terms. */
  blurb: string
  /** Sentence used on the request flow when proposing a new one. */
  proposeHint: string
}> = {
  resource: {
    label: 'Organization',
    plural: 'Organizations',
    blurb: 'A support group, nonprofit, clinic or service. Listed under Resources.',
    proposeHint: 'The organization name as people search for it.',
  },
  business: {
    label: 'Business',
    plural: 'Businesses',
    blurb: 'Queer-owned or actively affirming. Listed on Shop Queer with a map pin.',
    proposeHint: 'The business name as it appears on the door.',
  },
  host: {
    label: 'Event host',
    plural: 'Event hosts',
    blurb: 'A person or collective that runs events without a listing of its own.',
    proposeHint: 'The name event-goers know you by. It can be your own.',
  },
}

/** Every page in the directory as a flat, searchable list. */
export function allPages(data: AppData): EntityRef[] {
  const out: EntityRef[] = []
  for (const r of data.resources) out.push({ kind: 'resource', id: r.id, name: r.name, image_url: r.image_url, verified: r.verified })
  for (const b of data.businesses) out.push({ kind: 'business', id: b.id, name: b.name, image_url: b.image_url, verified: b.verified })
  for (const h of data.hosts) out.push({ kind: 'host', id: h.id, name: h.name, image_url: h.image_url, verified: h.verified })
  return out
}

/** Case-insensitive name search, optionally within one kind. */
export function searchPages(data: AppData, query: string, kind?: EntityKind | null): EntityRef[] {
  const q = query.trim().toLowerCase()
  return allPages(data)
    .filter((p) => (!kind || p.kind === kind) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Resolves the account's managed pages against the directory, dropping any that no longer exist. */
export function resolveManaged(data: AppData | null, managed: ManagedPage[]): Array<EntityRef & { role: ManagedPage['role'] }> {
  const out: Array<EntityRef & { role: ManagedPage['role'] }> = []
  for (const m of managed) {
    const ref = entityRef(data, m.kind, m.id)
    if (ref) out.push({ ...ref, role: m.role })
  }
  return out
}

/** A one-line description of what a request is waiting on. */
export function describeRequest(data: AppData | null, r: PageRequest): { title: string; sub: string } {
  const kind = PAGE_KIND[r.entity_kind].label.toLowerCase()
  if (r.entity_id) {
    const ref = entityRef(data, r.entity_kind, r.entity_id)
    return {
      title: ref?.name ?? r.proposed_name ?? 'A listing',
      sub: r.status === 'pending' ? `Access to this ${kind} page is under review`
        : r.status === 'approved' ? 'Approved — you manage this page now'
        : 'Declined. Reply to the reviewer if you think this is wrong.',
    }
  }
  return {
    title: r.proposed_name || `New ${kind} page`,
    sub: r.status === 'pending' ? `New ${kind} page, under review`
      : r.status === 'approved' ? 'Approved and listed'
      : 'Declined. Reply to the reviewer if you think this is wrong.',
  }
}

export interface NewPageRequest {
  kind: EntityKind
  /** Claim this listing; omit to propose a new page. */
  entityId?: string | null
  proposedName?: string
  proposedBio?: string
  proof: string
  contact?: string
}

export async function submitPageRequest(profileId: string, req: NewPageRequest): Promise<string | null> {
  const { error } = await supabase.from('page_requests').insert({
    profile_id: profileId,
    entity_kind: req.kind,
    entity_id: req.entityId ?? null,
    proposed_name: (req.proposedName ?? '').trim(),
    proposed_bio: (req.proposedBio ?? '').trim(),
    proof: req.proof.trim(),
    contact: (req.contact ?? '').trim(),
  })
  return error ? error.message : null
}

export async function withdrawPageRequest(id: number): Promise<void> {
  await supabase.from('page_requests').delete().eq('id', id)
}

/** Whether a set of pages already includes this one — used to hide "request access" on pages you run. */
export const managesPage = (managed: ManagedPage[], kind: EntityKind, id: string) =>
  managed.some((m) => m.kind === kind && m.id === id)
