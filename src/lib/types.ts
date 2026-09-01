export type AgeRating = '18+' | '21+' | null

export interface SplashTab {
  id: string
  name: string
  subtitle: string
  image_url: string
  position: number
}

export interface Resource {
  id: string
  name: string
  category: string
  county: string
  counties: string[]
  communities: string[]
  image_url: string
  description: string
  website: string
  telephone: string
  email: string
  address: string
  facebook: string
  instagram: string
  verified: boolean
  age_rating: AgeRating
  age_reason: string | null
}

export type SectionType = 'carousel' | 'stack' | 'grid' | 'list'
export type SectionSize = 'large' | 'medium' | 'small'
export type SectionOrient = 'horizontal' | 'vertical' | 'full' | 'tile'

export interface SectionItem {
  img?: string
  title: string
  sub?: string
  value?: string
  link?: string
}

export interface BusinessSection {
  title: string
  sub?: string
  layout: { type: SectionType; size: SectionSize; orient: SectionOrient }
  items: SectionItem[]
}

export interface Coupon {
  title: string
  terms: string
  code: string
  expires: string
}

export interface Business {
  id: string
  name: string
  county: string
  image_url: string
  background_url: string
  color: string
  address: string
  website: string
  telephone: string
  email: string
  map_url: string
  tags: string[]
  rating: number
  review_count: number
  verified: boolean
  longitude: number | null
  latitude: number | null
  coupons: Coupon[]
  sections: BusinessSection[]
  age_rating: AgeRating
  age_reason: string | null
}

export interface Host {
  id: string
  name: string
  image_url: string
  header_url: string
  bio: string
  verified: boolean
  linked_business_id?: string | null
  linked_resource_id?: string | null
}

/**
 * Who put a listing here, and who stands behind it.
 *
 * - `directory` — LGBTQ.UT added it from public information. The organisation
 *   named on it does not manage the page and may not know it exists, so
 *   nothing on it should read as coming from them.
 * - `entity` — the organiser posted it from their own account and maintains
 *   it. Only someone who administers that entity can write a row this way.
 */
export type ContentSource = 'directory' | 'entity'

export interface AppEvent {
  id: string
  /** Legacy organiser link, kept until every read moves to entity_kind/entity_id. */
  host_id: string | null
  /** The organiser, addressed the same way posts and saves address entities. */
  entity_kind: EntityKind
  entity_id: string
  name: string
  date_label: string
  starts_on: string
  description: string
  image_url: string
  age_rating: AgeRating
  age_reason: string | null
  /** Who listed it. Absent (older rows, older bundles) reads as `directory`. */
  source: ContentSource
  /** Where a directory listing was taken from, for a reader to check against. */
  source_url: string
  /** Last date a person confirmed a directory listing still holds. */
  last_checked_on: string | null
}

/** Shared shape behind a resource, business or host — the parts every face has. */
export interface EntityRef {
  kind: EntityKind
  id: string
  name: string
  image_url: string
  verified: boolean
}

export interface CrisisLine {
  name: string
  desc: string
  action: string
  tel: string
}

export interface AppData {
  tabs: SplashTab[]
  resources: Resource[]
  businesses: Business[]
  hosts: Host[]
  events: AppEvent[]
  crisis: CrisisLine[]
  countyImages: Record<string, string>
  communityImages: Record<string, string>
  categoryImages: Record<string, string>
}

export type EntityKind = 'resource' | 'business' | 'host'

export interface Channels {
  events: boolean
  offers: boolean
  newsletter: boolean
}

export interface SavedEntry extends Channels {
  kind: EntityKind
  id: string
}

/** Anonymous users are cached on-device only and fail every age gate. */
export type AccountTier = 'anonymous' | 'account' | 'public'

/**
 * A page this account administers — a resource, business or host face it
 * can edit, post as, and run events for. One row of `entity_admins`.
 */
export interface ManagedPage {
  kind: EntityKind
  id: string
  role: 'admin' | 'editor'
}

export type PageRequestStatus = 'pending' | 'approved' | 'declined'

/** A request to manage a listing, or to add one. One row of `page_requests`. */
export interface PageRequest {
  id: number
  entity_kind: EntityKind
  /** Null while the request proposes a page that is not listed yet. */
  entity_id: string | null
  proposed_name: string
  status: PageRequestStatus
  created_at: string
}

/** Three privacy states for social profiles. */
export type ProfileVisibility = 'private' | 'visible' | 'discoverable'

/** The social/profile layer — completely separate from auth. */
export interface SocialProfile {
  id: string
  display_name: string
  public_handle: string | null
  avatar_url: string | null
  header_url: string | null
  bio: string | null
  pronouns: string | null
  identity_labels: string[]
  interests: string[]
  social_links: string[]
  website: string | null
  county: string | null
  visibility: ProfileVisibility
  search_visible: boolean
  recommendable: boolean
  indexable: boolean
  /** Owner's own say-so that the profile is for adults. */
  adult_content: boolean
  /** Computed by the database: '18+' when adult_content is set or a link points at an adult platform. */
  age_rating: AgeRating
  age_reason: string | null
}
