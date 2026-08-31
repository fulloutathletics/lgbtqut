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
}
