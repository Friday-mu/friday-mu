// @demo:data — Properties + onboarding + insights — GET /api/properties
// Tag: PROD-DATA-4 — see frontend/DEMO_CRUFT.md

// Properties — canonical namespace per v0.2 LOCKED scoping pack.
//
// Replaces three legacy namespaces (legacy `Property` in fixtures.ts,
// `FinProperty` in finance.ts, `TaskProperty` in tasks.ts). Those files now
// re-export back-compat shims derived from this module so consumers don't break
// during the migration; full retirement happens in commit 4.

import type { Cohort } from './reviews';
import { liveOnlyMode } from './demoMode';

// ───────────────── Lifecycle ─────────────────

export type LifecycleStatus = 'onboarding' | 'live' | 'paused' | 'off_boarded';

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  onboarding: 'Onboarding',
  live: 'Live',
  paused: 'Paused',
  off_boarded: 'Off-boarded',
};

/** Required onboarding artifacts. `Photoshoot` is the only flexible item — pro-shoot
 *  can defer post-active. `ListingPushedToBooking` is deferred (fires after 3-5 reviews)
 *  and is excluded from the "is_onboarding_complete" check. */
export type OnboardingChecklistKey =
  | 'site_visit'
  | 'owner_agreement'
  | 'standards_book'
  | 'keys'
  | 'amenities_form'
  | 'gap_analysis'
  | 'home_build_out'
  | 'preventative_maintenance'
  | 'aesthetic_check'
  | 'photoshoot'
  | 'listing_airbnb'
  | 'listing_friday_mu'
  | 'base_price'
  | 'listing_booking_com';

export const ONBOARDING_REQUIRED: OnboardingChecklistKey[] = [
  'site_visit',
  'owner_agreement',
  'standards_book',
  'keys',
  'amenities_form',
  'gap_analysis',
  'home_build_out',
  'preventative_maintenance',
  'aesthetic_check',
  'photoshoot',
  'listing_airbnb',
  'listing_friday_mu',
  'base_price',
];

export const ONBOARDING_OPTIONAL: OnboardingChecklistKey[] = ['listing_booking_com'];

export const ONBOARDING_LABEL: Record<OnboardingChecklistKey, string> = {
  site_visit: 'Site visit completed',
  owner_agreement: 'Owner agreement signed',
  standards_book: 'Standards Book delivered',
  keys: 'Key duplicates received',
  amenities_form: 'Amenities Form completed',
  gap_analysis: 'Gap Analysis resolved',
  home_build_out: 'Home Build-Out registry',
  preventative_maintenance: 'Preventative Maintenance check',
  aesthetic_check: 'Aesthetic check',
  photoshoot: 'Photoshoot (preliminary or pro)',
  listing_airbnb: 'Listing pushed to Airbnb',
  listing_friday_mu: 'Listing pushed to friday.mu',
  base_price: 'Base price set',
  listing_booking_com: 'Listing pushed to Booking.com',
};

export type ChecklistItemStatus = 'not_started' | 'in_progress' | 'complete' | 'skipped';

export type OnboardingChecklist = Partial<Record<OnboardingChecklistKey, ChecklistItemStatus>>;

// ───────────────── Channels ─────────────────

export type ListingChannel = 'airbnb' | 'booking' | 'vrbo' | 'friday_mu';

export const LISTING_CHANNEL_LABEL: Record<ListingChannel, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  vrbo: 'VRBO',
  friday_mu: 'friday.mu',
};

export interface ListingRecord {
  channel: ListingChannel;
  externalId: string;
  status: 'active' | 'paused' | 'unavailable' | 'pending';
  /** Per-channel commission % override (read-only Phase 1). */
  commissionPct?: number;
  /** Per-channel description override. Empty = use property base description. */
  description?: string;
  /** Last successful push to this channel — Phase 2 write-through tracking. */
  lastPushedAt?: string;
}

// ───────────────── Amenities (Phase 2 — per-property matrix) ─────────────────

export type Amenity =
  | 'wifi' | 'ac' | 'pool' | 'pool_heated' | 'jacuzzi' | 'sauna'
  | 'kitchen' | 'dishwasher' | 'washer' | 'dryer' | 'oven' | 'microwave' | 'coffee_machine'
  | 'tv' | 'sound_system'
  | 'parking_free' | 'parking_paid' | 'ev_charger'
  | 'beachfront' | 'sea_view' | 'garden' | 'bbq' | 'outdoor_dining'
  | 'family_friendly' | 'baby_cot' | 'high_chair' | 'pet_friendly'
  | 'workspace' | 'gym' | 'concierge' | 'security' | 'elevator';

export const AMENITY_GROUPS: { label: string; items: { key: Amenity; label: string }[] }[] = [
  {
    label: 'Essentials',
    items: [
      { key: 'wifi', label: 'Wifi' },
      { key: 'ac', label: 'Air conditioning' },
      { key: 'kitchen', label: 'Kitchen' },
      { key: 'workspace', label: 'Workspace' },
    ],
  },
  {
    label: 'Pool & Outdoor',
    items: [
      { key: 'pool', label: 'Pool' },
      { key: 'pool_heated', label: 'Heated pool' },
      { key: 'jacuzzi', label: 'Jacuzzi' },
      { key: 'sauna', label: 'Sauna' },
      { key: 'beachfront', label: 'Beachfront' },
      { key: 'sea_view', label: 'Sea view' },
      { key: 'garden', label: 'Garden' },
      { key: 'bbq', label: 'BBQ' },
      { key: 'outdoor_dining', label: 'Outdoor dining' },
    ],
  },
  {
    label: 'Kitchen & Laundry',
    items: [
      { key: 'dishwasher', label: 'Dishwasher' },
      { key: 'washer', label: 'Washer' },
      { key: 'dryer', label: 'Dryer' },
      { key: 'oven', label: 'Oven' },
      { key: 'microwave', label: 'Microwave' },
      { key: 'coffee_machine', label: 'Coffee machine' },
    ],
  },
  {
    label: 'Entertainment',
    items: [
      { key: 'tv', label: 'TV' },
      { key: 'sound_system', label: 'Sound system' },
    ],
  },
  {
    label: 'Family & Pets',
    items: [
      { key: 'family_friendly', label: 'Family-friendly' },
      { key: 'baby_cot', label: 'Baby cot' },
      { key: 'high_chair', label: 'High chair' },
      { key: 'pet_friendly', label: 'Pet-friendly' },
    ],
  },
  {
    label: 'Building',
    items: [
      { key: 'parking_free', label: 'Free parking' },
      { key: 'parking_paid', label: 'Paid parking' },
      { key: 'ev_charger', label: 'EV charger' },
      { key: 'gym', label: 'Gym' },
      { key: 'concierge', label: 'Concierge' },
      { key: 'security', label: '24/7 security' },
      { key: 'elevator', label: 'Elevator' },
    ],
  },
];

// ───────────────── Property type ─────────────────

export type ListingType = 'villa' | 'apartment' | 'studio' | 'townhouse' | 'bungalow';

/** Property zone — back-compat with Operations roster. Office is a synthetic non-property entry. */
export type PropertyZone = 'north' | 'west' | 'office';

/** Coarse capacity tier — back-compat with TaskProperty. */
export type PropertyTier = 'small' | 'medium' | 'big';

export interface Property {
  /** Stable internal id (mock — same as code Phase 1). */
  id: string;
  /** Display SKU shown across the app. */
  code: string;
  name: string;
  /** Building / complex name — when relevant (e.g. "Grand Baie Heights"). */
  buildingName?: string;
  /** Free-form full address. */
  address: string;
  /** Cohort/region — lifted from reviews.PROPERTY_COHORT. */
  region: Cohort;
  /** Optional sub-region label for display ("Bel Ombre · South"). */
  area: string;
  /** Roster zone (mostly mirrors region but kept distinct for ops). */
  zone: PropertyZone;
  /** Capacity tier — small/medium/big. */
  tier: PropertyTier;
  geo?: { lat: number; lng: number };

  // Lifecycle
  lifecycleStatus: LifecycleStatus;
  onboardingChecklist: OnboardingChecklist;
  /** When the property went live (or is targeted to). */
  liveSince?: string;
  pausedReason?: string;
  pauseReturnBy?: string;

  // Layout
  listingType: ListingType;
  bedrooms: number;
  bathrooms?: number;
  maxOccupancy: number;
  sqm?: number;

  // Multi-unit
  parentPropertyId?: string;
  isCombo?: boolean;
  componentPropertyIds?: string[];

  /** mig 088 — per-locale overlay copy authored by the team. The
   *  website consumes via /api/public/listings. Empty object means
   *  nothing authored; consumer falls back to top-level name/description
   *  (which is Guesty-sourced). */
  translations?: {
    en?: { name?: string | null; description?: string | null };
    fr?: { name?: string | null; description?: string | null };
  };

  // Owners (link via PROPERTY_OWNERS; primaryOwnerId is the signing party)
  primaryOwnerId: string;
  /** Live primary-owner display name from fad_owners (T3.12). When set,
   *  prefer this over FIN_OWNERS fixture lookups. */
  primaryOwnerName?: string;
  /** Maintenance spend cap override in MUR minor. Undefined = inherit from contract.
   *  Per T&Cs: Rs 2,500 OR 10% of booking, whichever applies (Finance/Owner contract owns). */
  maintenanceCapOverrideMinor?: number;
  /** Friday-Owner contract block (signing party = primaryOwner). */
  contract?: {
    status: 'active' | 'pending' | 'renewal_due' | 'expired';
    commissionPct: number;
    paymentDay: number;
    /** Renewal date (display only). */
    endsAt?: string;
    /** Cross-link to Legal/Admin → Xodo Sign envelope. */
    xodoEnvelopeId?: string;
  };

  // Listings
  listings: ListingRecord[];
  /** Display base rate per night MUR (read-only Phase 1; Guesty owns). */
  baseRateMUR: number;

  // Photos
  heroPhotoId?: string;
  /** Real Guesty CDN URL when the listing has a synced cover photo. Used by
   *  PropertyCardMini + the Identity tab hero. Falls back to gradient
   *  placeholder when null/absent. */
  heroPhotoUrl?: string | null;
  photoIds: string[];

  // Tags + filters
  tags: string[];
  /** Per-property amenity set. Phase 1 derived from common defaults; Phase 2 editable. */
  amenities?: Amenity[];
  /** Base property description (channel descriptions live on ListingRecord). */
  description?: string;

  // Syndic relationship
  /** True if Friday acts as the syndicate (e.g. Grand Beehive). */
  isSyndicManaged?: boolean;
  /** Cross-link to Syndic module record (Phase 1: just a flag/string). */
  syndicId?: string;

  // Mock metrics (Phase 2 sources from real Finance/Analytics)
  occupancyYTD: number;
  occupancy90d: number;
  adr: number;
  rating: number;
  ratingCount: number;
  lastActivityAt: string;
}

// ───────────────── PropertyOwner (N:M with %) ─────────────────

export interface PropertyOwner {
  propertyId: string;
  ownerId: string;
  ownershipPct: number;
  isPrimary: boolean;
}

// ───────────────── PropertyCard (AI-knowledge surface) ─────────────────

export type PropertyCardCategory =
  | 'access'
  | 'wifi_tech'
  | 'utilities'
  | 'waste'
  | 'pool_outdoor'
  | 'building_syndic'
  | 'local_context'
  | 'quirks';

export const PROPERTY_CARD_CATEGORY_LABEL: Record<PropertyCardCategory, string> = {
  access: 'Access',
  wifi_tech: 'Wifi & Tech',
  utilities: 'Utilities',
  waste: 'Waste',
  pool_outdoor: 'Pool / Outdoor',
  building_syndic: 'Building / Syndic',
  local_context: 'Local context',
  quirks: 'Quirks',
};

export type CardSurface = 'guest_facing' | 'internal_only' | 'both';
export type CardSource = 'manual' | 'ai_extracted' | 'onboarding_form' | 'breezeway_imported' | 'guesty_imported';

export interface PropertyCard {
  id: string;
  /** 'global' for cross-property cards. */
  propertyId: string | 'global';
  category: PropertyCardCategory;
  title: string;
  body: string;
  surface: CardSurface;
  source: CardSource;
  aiExtractionMetadata?: { threadId: string; confidence: number };
  lastUpdated: string;
  lastUpdatedByUserId: string;
}

// ───────────────── Onboarding artifacts (typed union) ─────────────────

export type OnboardingArtifactType =
  | 'site_visit'
  | 'owner_agreement'
  | 'standards_book'
  | 'keys'
  | 'amenities_form'
  | 'gap_analysis'
  | 'home_build_out'
  | 'preventative_maintenance'
  | 'aesthetic_check'
  | 'photoshoot'
  | 'listing_setup';

export interface OnboardingArtifactBase {
  id: string;
  propertyId: string;
  type: OnboardingArtifactType;
  status: ChecklistItemStatus;
  startedAt?: string;
  completedAt?: string;
  assignedToUserId?: string;
  notes?: string;
}

export interface SiteVisitArtifact extends OnboardingArtifactBase {
  type: 'site_visit';
  visitDate?: string;
  attendeesUserIds?: string[];
  photosCount?: number;
  approvedBy?: string;
}

export interface OwnerAgreementArtifact extends OnboardingArtifactBase {
  type: 'owner_agreement';
  xodoEnvelopeId?: string;
  xodoStatus?: 'draft' | 'sent' | 'signed' | 'declined';
  commissionPct?: number;
  paymentDay?: number;
  maintenanceCapMinor?: number;
}

export interface StandardsBookArtifact extends OnboardingArtifactBase {
  type: 'standards_book';
  versionDelivered?: string;
  deliveredAt?: string;
  ownerAcknowledgedAt?: string;
}

export interface KeysArtifact extends OnboardingArtifactBase {
  type: 'keys';
  setsReceived?: number;
  duplicatesMadeAt?: string;
  storageLocation?: string;
}

export interface AmenitiesFormArtifact extends OnboardingArtifactBase {
  type: 'amenities_form';
  /** Phase 1: free-form. Phase 2: structured question-set. */
  responsesSummary?: string;
}

export interface GapAnalysisItem {
  id: string;
  item: string;
  qtyNeeded: number;
  status: 'missing' | 'purchased' | 'owner_provided';
  costMinor?: number;
  paidBy?: 'friday' | 'owner';
  reimbursementStatus?: 'pending' | 'deducted_from_payout' | 'invoiced' | 'settled';
}

export interface GapAnalysisArtifact extends OnboardingArtifactBase {
  type: 'gap_analysis';
  items: GapAnalysisItem[];
}

export interface HomeBuildOutItem {
  id: string;
  item: string;
  brand?: string;
  model?: string;
  serial?: string;
  warrantyDocId?: string;
  purchaseDate?: string;
  locationInProperty?: string;
}

export interface HomeBuildOutArtifact extends OnboardingArtifactBase {
  type: 'home_build_out';
  items: HomeBuildOutItem[];
}

export interface PreventativeMaintenanceArtifact extends OnboardingArtifactBase {
  type: 'preventative_maintenance';
  checklistJson?: string;
  photosCount?: number;
}

export interface AestheticCheckArtifact extends OnboardingArtifactBase {
  type: 'aesthetic_check';
  checklistJson?: string;
  photosCount?: number;
}

export interface PhotoshootArtifact extends OnboardingArtifactBase {
  type: 'photoshoot';
  shootKind?: 'preliminary' | 'professional';
  photographer?: string;
  shootDate?: string;
  galleryCount?: number;
}

export interface ListingSetupArtifact extends OnboardingArtifactBase {
  type: 'listing_setup';
  listingsByChannel?: Partial<Record<ListingChannel, string>>;
  basePriceMUR?: number;
  basePriceRationale?: string;
}

export type OnboardingArtifact =
  | SiteVisitArtifact
  | OwnerAgreementArtifact
  | StandardsBookArtifact
  | KeysArtifact
  | AmenitiesFormArtifact
  | GapAnalysisArtifact
  | HomeBuildOutArtifact
  | PreventativeMaintenanceArtifact
  | AestheticCheckArtifact
  | PhotoshootArtifact
  | ListingSetupArtifact;

// ───────────────── Activity log ─────────────────

export type PropertyActivityKind =
  | 'lifecycle_changed'
  | 'onboarding_step_complete'
  | 'owner_changed'
  | 'photo_updated'
  | 'contract_event'
  | 'tag_added'
  | 'card_added'
  | 'note';

export interface PropertyActivity {
  id: string;
  propertyId: string;
  ts: string;
  kind: PropertyActivityKind;
  actorId: string;
  detail: string;
}

// ───────────────── Fixtures ─────────────────

const FULL_CHECKLIST: OnboardingChecklist = ONBOARDING_REQUIRED.reduce(
  (acc, k) => ({ ...acc, [k]: 'complete' as ChecklistItemStatus }),
  {},
);

/** Most properties are "live + complete checklist." */
export const LIVE_COMPLETE = (): OnboardingChecklist => ({ ...FULL_CHECKLIST });

export const PROPERTIES: Property[] = [
  // ── Flic en Flac / west · single-unit live ──
  {
    id: 'p-vv47', code: 'VV-47', name: 'Villa Verde 4-7', address: '4-7 Allée des Filaos, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(), liveSince: '2024-06-12',
    listingType: 'villa', bedrooms: 3, bathrooms: 2, maxOccupancy: 6, sqm: 180,
    primaryOwnerId: 'o1',
    listings: [
      { channel: 'airbnb', externalId: 'air-vv47-882', status: 'active', commissionPct: 17 },
      { channel: 'booking', externalId: 'bdc-vv47-44', status: 'active', commissionPct: 18 },
      { channel: 'friday_mu', externalId: 'fr-vv47', status: 'active' },
    ],
    baseRateMUR: 18_500_00,
    photoIds: ['ph-vv47-1', 'ph-vv47-2', 'ph-vv47-3'], heroPhotoId: 'ph-vv47-1',
    tags: ['Family-friendly', 'Pool'],
    occupancyYTD: 0.74, occupancy90d: 0.81, adr: 365, rating: 4.78, ratingCount: 41, lastActivityAt: '2026-04-26',
  },
  {
    id: 'p-lc9', code: 'LC-9', name: 'Le Caudan 9', address: '9 Le Caudan Drive, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(), liveSince: '2024-09-01',
    listingType: 'apartment', bedrooms: 2, bathrooms: 2, maxOccupancy: 4, sqm: 110,
    primaryOwnerId: 'o4',
    listings: [
      { channel: 'airbnb', externalId: 'air-lc9-431', status: 'active', commissionPct: 17 },
      { channel: 'friday_mu', externalId: 'fr-lc9', status: 'active' },
    ],
    baseRateMUR: 11_000_00,
    photoIds: ['ph-lc9-1', 'ph-lc9-2'], heroPhotoId: 'ph-lc9-1',
    tags: ['Couples'],
    occupancyYTD: 0.69, occupancy90d: 0.73, adr: 295, rating: 4.62, ratingCount: 28, lastActivityAt: '2026-04-25',
  },
  {
    id: 'p-rc15', code: 'RC-15', name: 'Residence Camélia 15', address: '15 Residence Camélia, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(), liveSince: '2025-01-10',
    listingType: 'apartment', bedrooms: 2, bathrooms: 1, maxOccupancy: 4, sqm: 95,
    primaryOwnerId: 'o2',
    listings: [
      { channel: 'airbnb', externalId: 'air-rc15-922', status: 'active' },
      { channel: 'friday_mu', externalId: 'fr-rc15', status: 'active' },
    ],
    baseRateMUR: 9_500_00,
    photoIds: ['ph-rc15-1'], heroPhotoId: 'ph-rc15-1',
    tags: ['Budget'],
    occupancyYTD: 0.64, occupancy90d: 0.71, adr: 245, rating: 4.55, ratingCount: 19, lastActivityAt: '2026-04-22',
  },
  {
    id: 'p-ks5', code: 'KS-5', name: 'Kestrel Sands 5', address: '5 Kestrel Sands, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 3, bathrooms: 3, maxOccupancy: 6,
    primaryOwnerId: 'o3',
    listings: [{ channel: 'airbnb', externalId: 'air-ks5-110', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-ks5', status: 'active' }],
    baseRateMUR: 14_200_00,
    photoIds: ['ph-ks5-1'], tags: ['Pool'],
    occupancyYTD: 0.71, occupancy90d: 0.78, adr: 320, rating: 4.69, ratingCount: 33, lastActivityAt: '2026-04-23',
  },
  {
    id: 'p-lv10', code: 'LV-10', name: 'La Verdure 10', address: '10 La Verdure, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 2, maxOccupancy: 4,
    primaryOwnerId: 'o2',
    listings: [{ channel: 'airbnb', externalId: 'air-lv10-44', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-lv10', status: 'active' }],
    baseRateMUR: 10_800_00,
    photoIds: ['ph-lv10-1'], tags: ['Couples', 'Pet-OK'],
    occupancyYTD: 0.62, occupancy90d: 0.68, adr: 270, rating: 4.51, ratingCount: 22, lastActivityAt: '2026-04-19',
  },
  {
    id: 'p-bs1', code: 'BS-1', name: 'Bay Studio 1', address: '1 Bay Studios, Flic en Flac',
    region: 'flic_en_flac', area: 'Flic en Flac · West', zone: 'west', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'studio', bedrooms: 0, bathrooms: 1, maxOccupancy: 2, sqm: 38,
    primaryOwnerId: 'o4',
    listings: [{ channel: 'airbnb', externalId: 'air-bs1-77', status: 'active' }],
    baseRateMUR: 5_200_00,
    photoIds: ['ph-bs1-1'], tags: ['Solo', 'Budget'],
    occupancyYTD: 0.81, occupancy90d: 0.86, adr: 145, rating: 4.41, ratingCount: 51, lastActivityAt: '2026-04-26',
  },

  // ── Grand Baie / north · single-unit + syndic ──
  {
    id: 'p-bl12', code: 'BL-12', name: 'Beachfront Loft 12', address: '12 Beach Lane, Grand Baie',
    region: 'grand_baie', area: 'Grand Baie · North', zone: 'north', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 4, bathrooms: 3, maxOccupancy: 8, sqm: 220,
    primaryOwnerId: 'o2',
    listings: [
      { channel: 'airbnb', externalId: 'air-bl12-001', status: 'active' },
      { channel: 'booking', externalId: 'bdc-bl12-09', status: 'active' },
      { channel: 'friday_mu', externalId: 'fr-bl12', status: 'active' },
    ],
    baseRateMUR: 28_000_00,
    photoIds: ['ph-bl12-1'], heroPhotoId: 'ph-bl12-1',
    tags: ['Luxury', 'Family-friendly', 'Beachfront'],
    occupancyYTD: 0.78, occupancy90d: 0.82, adr: 480, rating: 4.81, ratingCount: 62, lastActivityAt: '2026-04-26',
  },
  {
    id: 'p-gbhc8', code: 'GBH-C8', name: 'Grand Baie Heights C8', buildingName: 'Grand Beehive',
    address: 'Apt C8, Grand Beehive Tower, Grand Baie',
    region: 'grand_baie', area: 'Grand Baie · North', zone: 'north', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 1, bathrooms: 1, maxOccupancy: 2, sqm: 65,
    primaryOwnerId: 'o3',
    listings: [{ channel: 'airbnb', externalId: 'air-gbhc8-22', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-gbhc8', status: 'active' }],
    baseRateMUR: 6_800_00,
    photoIds: ['ph-gbhc8-1'], tags: ['Couples'],
    isSyndicManaged: true, syndicId: 'syn-gbh',
    occupancyYTD: 0.72, occupancy90d: 0.76, adr: 165, rating: 4.58, ratingCount: 27, lastActivityAt: '2026-04-21',
  },
  {
    id: 'p-gbhc3', code: 'GBH-C3', name: 'Grand Baie Heights C3', buildingName: 'Grand Beehive',
    address: 'Apt C3, Grand Beehive Tower, Grand Baie',
    region: 'grand_baie', area: 'Grand Baie · North', zone: 'north', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 1, bathrooms: 1, maxOccupancy: 2, sqm: 60,
    primaryOwnerId: 'o3',
    listings: [{ channel: 'airbnb', externalId: 'air-gbhc3-19', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-gbhc3', status: 'active' }],
    baseRateMUR: 6_500_00,
    photoIds: ['ph-gbhc3-1'], tags: ['Couples'],
    isSyndicManaged: true, syndicId: 'syn-gbh',
    occupancyYTD: 0.69, occupancy90d: 0.74, adr: 158, rating: 4.55, ratingCount: 24, lastActivityAt: '2026-04-20',
  },
  {
    id: 'p-oct', code: 'OCT', name: 'Ocean Terrace', address: '14 Ocean Terrace, Grand Baie',
    region: 'grand_baie', area: 'Grand Baie · North', zone: 'north', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 2, maxOccupancy: 4,
    primaryOwnerId: 'o5',
    listings: [{ channel: 'airbnb', externalId: 'air-oct-12', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-oct', status: 'active' }],
    baseRateMUR: 9_900_00,
    photoIds: ['ph-oct-1'], tags: ['Couples'],
    occupancyYTD: 0.72, occupancy90d: 0.78, adr: 330, rating: 4.61, ratingCount: 31, lastActivityAt: '2026-04-22',
  },
  {
    id: 'p-lca', code: 'LCA', name: 'La Casa Palm', address: '8 Palm Avenue, Grand Baie',
    region: 'grand_baie', area: 'Grand Baie · North', zone: 'north', tier: 'medium',
    lifecycleStatus: 'paused', onboardingChecklist: LIVE_COMPLETE(),
    pausedReason: 'Renovation — bathroom + kitchen',
    pauseReturnBy: '2026-06-15',
    listingType: 'villa', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o5',
    listings: [
      { channel: 'airbnb', externalId: 'air-lca-66', status: 'paused' },
      { channel: 'friday_mu', externalId: 'fr-lca', status: 'paused' },
    ],
    baseRateMUR: 12_500_00,
    photoIds: ['ph-lca-1'], tags: ['Family-friendly'],
    occupancyYTD: 0.41, occupancy90d: 0.0, adr: 295, rating: 4.55, ratingCount: 24, lastActivityAt: '2026-04-12',
  },

  // ── Pereybere / north ──
  {
    id: 'p-pt3', code: 'PT-3', name: 'Pereybere Townhouse 3', address: '3 Beach Road, Pereybere',
    region: 'pereybere', area: 'Pereybere · North', zone: 'north', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'townhouse', bedrooms: 2, bathrooms: 1, maxOccupancy: 4, sqm: 90,
    primaryOwnerId: 'o3',
    listings: [{ channel: 'airbnb', externalId: 'air-pt3-12', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-pt3', status: 'active' }],
    baseRateMUR: 7_200_00,
    photoIds: ['ph-pt3-1'], tags: ['Budget'],
    occupancyYTD: 0.74, occupancy90d: 0.79, adr: 198, rating: 4.49, ratingCount: 35, lastActivityAt: '2026-04-24',
  },
  {
    id: 'p-bcna', code: 'BCN-A', name: 'Beacon A', address: 'Apt A, Beacon Residence, Pereybere',
    region: 'pereybere', area: 'Pereybere · North', zone: 'north', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 1, bathrooms: 1, maxOccupancy: 2,
    primaryOwnerId: 'o4',
    listings: [{ channel: 'airbnb', externalId: 'air-bcna-08', status: 'active' }],
    baseRateMUR: 5_800_00,
    photoIds: ['ph-bcna-1'], tags: ['Solo'],
    occupancyYTD: 0.66, occupancy90d: 0.72, adr: 142, rating: 4.38, ratingCount: 17, lastActivityAt: '2026-04-19',
  },
  {
    id: 'p-cor', code: 'COR', name: 'Coral Reef Bungalow', address: 'Coral Reef Lane, Trou aux Biches',
    region: 'pereybere', area: 'Trou aux Biches · North', zone: 'north', tier: 'small',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'bungalow', bedrooms: 1, bathrooms: 1, maxOccupancy: 3,
    primaryOwnerId: 'o5',
    listings: [{ channel: 'airbnb', externalId: 'air-cor-04', status: 'active' }],
    baseRateMUR: 6_200_00,
    photoIds: ['ph-cor-1'], tags: ['Beachfront', 'Couples'],
    occupancyYTD: 0.86, occupancy90d: 0.91, adr: 260, rating: 4.72, ratingCount: 44, lastActivityAt: '2026-04-26',
  },

  // ── Bel Ombre / west — Nitzana onboarding (mid-flight) ──
  {
    id: 'p-nit', code: 'NIT', name: 'Nitzana Estate', address: 'Nitzana Estate, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'onboarding',
    onboardingChecklist: {
      site_visit: 'complete',
      owner_agreement: 'complete',
      standards_book: 'complete',
      keys: 'complete',
      amenities_form: 'in_progress',
      gap_analysis: 'in_progress',
      home_build_out: 'in_progress',
      preventative_maintenance: 'not_started',
      aesthetic_check: 'not_started',
      photoshoot: 'not_started',
      listing_airbnb: 'not_started',
      listing_friday_mu: 'not_started',
      base_price: 'not_started',
    },
    listingType: 'villa', bedrooms: 6, bathrooms: 5, maxOccupancy: 12, sqm: 540,
    primaryOwnerId: 'o1',
    listings: [],
    baseRateMUR: 0,
    photoIds: [], tags: ['Luxury', 'Onboarding'],
    occupancyYTD: 0, occupancy90d: 0, adr: 0, rating: 0, ratingCount: 0, lastActivityAt: '2026-04-27',
  },

  // ── Bel Ombre · single-unit ──
  {
    id: 'p-vaz', code: 'VAZ', name: 'Villa Azur', address: 'Coastal Drive, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 4, bathrooms: 3, maxOccupancy: 8, sqm: 240,
    primaryOwnerId: 'o2',
    listings: [
      { channel: 'airbnb', externalId: 'air-vaz-201', status: 'active' },
      { channel: 'booking', externalId: 'bdc-vaz-77', status: 'active' },
      { channel: 'friday_mu', externalId: 'fr-vaz', status: 'active' },
    ],
    baseRateMUR: 21_000_00,
    photoIds: ['ph-vaz-1'], heroPhotoId: 'ph-vaz-1',
    tags: ['Luxury', 'Pool'],
    occupancyYTD: 0.82, occupancy90d: 0.86, adr: 420, rating: 4.86, ratingCount: 58, lastActivityAt: '2026-04-26',
  },
  {
    id: 'p-dmt', code: 'DMT', name: 'Domaine Tamassa', address: 'Tamassa Road, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 5, bathrooms: 4, maxOccupancy: 10,
    primaryOwnerId: 'o5',
    listings: [
      { channel: 'airbnb', externalId: 'air-dmt-05', status: 'active' },
      { channel: 'friday_mu', externalId: 'fr-dmt', status: 'active' },
    ],
    baseRateMUR: 32_000_00,
    photoIds: ['ph-dmt-1'], tags: ['Luxury', 'Family-friendly'],
    occupancyYTD: 0.74, occupancy90d: 0.77, adr: 610, rating: 4.81, ratingCount: 39, lastActivityAt: '2026-04-22',
  },
  {
    id: 'p-sd10', code: 'SD-10', name: 'Sapphire Dunes 10', address: 'Sapphire Dunes, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 4, bathrooms: 3, maxOccupancy: 8,
    primaryOwnerId: 'o4',
    listings: [{ channel: 'airbnb', externalId: 'air-sd10-31', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-sd10', status: 'active' }],
    baseRateMUR: 19_800_00,
    photoIds: ['ph-sd10-1'], tags: ['Luxury'],
    occupancyYTD: 0.69, occupancy90d: 0.74, adr: 410, rating: 4.71, ratingCount: 26, lastActivityAt: '2026-04-21',
  },

  // ── Multi-unit · Lagon Bleu (LB-1, LB-2, LB-3 + LB-C combo) ──
  {
    id: 'p-lb1', code: 'LB-1', name: 'Lagon Bleu 1', buildingName: 'Lagon Bleu',
    address: 'Unit 1, Lagon Bleu, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 2, maxOccupancy: 4,
    primaryOwnerId: 'o6', parentPropertyId: 'p-lbc',
    listings: [{ channel: 'airbnb', externalId: 'air-lb1-110', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-lb1', status: 'active' }],
    baseRateMUR: 12_500_00, photoIds: ['ph-lb1-1'], tags: ['Family-friendly'],
    occupancyYTD: 0.71, occupancy90d: 0.75, adr: 285, rating: 4.66, ratingCount: 22, lastActivityAt: '2026-04-23',
  },
  {
    id: 'p-lb2', code: 'LB-2', name: 'Lagon Bleu 2', buildingName: 'Lagon Bleu',
    address: 'Unit 2, Lagon Bleu, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 2, maxOccupancy: 4,
    primaryOwnerId: 'o6', parentPropertyId: 'p-lbc',
    listings: [{ channel: 'airbnb', externalId: 'air-lb2-111', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-lb2', status: 'active' }],
    baseRateMUR: 12_500_00, photoIds: ['ph-lb2-1'], tags: ['Family-friendly'],
    occupancyYTD: 0.74, occupancy90d: 0.79, adr: 290, rating: 4.69, ratingCount: 25, lastActivityAt: '2026-04-26',
  },
  {
    id: 'p-lb3', code: 'LB-3', name: 'Lagon Bleu 3', buildingName: 'Lagon Bleu',
    address: 'Unit 3, Lagon Bleu, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o6', parentPropertyId: 'p-lbc',
    listings: [{ channel: 'airbnb', externalId: 'air-lb3-112', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-lb3', status: 'active' }],
    baseRateMUR: 14_800_00, photoIds: ['ph-lb3-1'], tags: ['Family-friendly'],
    occupancyYTD: 0.68, occupancy90d: 0.72, adr: 310, rating: 4.71, ratingCount: 19, lastActivityAt: '2026-04-22',
  },
  {
    id: 'p-lbc', code: 'LB-C', name: 'Lagon Bleu Combo (1+2+3)', buildingName: 'Lagon Bleu',
    address: 'Lagon Bleu (full block), Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 7, bathrooms: 6, maxOccupancy: 14,
    primaryOwnerId: 'o6', isCombo: true, componentPropertyIds: ['p-lb1', 'p-lb2', 'p-lb3'],
    listings: [{ channel: 'airbnb', externalId: 'air-lbc-300', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-lbc', status: 'active' }],
    baseRateMUR: 38_000_00, photoIds: ['ph-lbc-1'], tags: ['Multi-unit', 'Group'],
    occupancyYTD: 0.31, occupancy90d: 0.42, adr: 880, rating: 4.85, ratingCount: 11, lastActivityAt: '2026-04-18',
  },

  // ── Multi-unit · Villa Azur Apartments (VA-2, VA-3, VA-4 + VA-C combo) ──
  {
    id: 'p-va2', code: 'VA-2', name: 'Villa Azur Apt 2', buildingName: 'Villa Azur Apartments',
    address: 'Apt 2, Villa Azur Apartments, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
    primaryOwnerId: 'o2', parentPropertyId: 'p-vac',
    listings: [{ channel: 'airbnb', externalId: 'air-va2-22', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-va2', status: 'active' }],
    baseRateMUR: 9_500_00, photoIds: ['ph-va2-1'], tags: ['Couples'],
    occupancyYTD: 0.66, occupancy90d: 0.69, adr: 220, rating: 4.55, ratingCount: 17, lastActivityAt: '2026-04-21',
  },
  {
    id: 'p-va3', code: 'VA-3', name: 'Villa Azur Apt 3', buildingName: 'Villa Azur Apartments',
    address: 'Apt 3, Villa Azur Apartments, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
    primaryOwnerId: 'o2', parentPropertyId: 'p-vac',
    listings: [{ channel: 'airbnb', externalId: 'air-va3-23', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-va3', status: 'active' }],
    baseRateMUR: 9_500_00, photoIds: ['ph-va3-1'], tags: ['Couples'],
    occupancyYTD: 0.71, occupancy90d: 0.75, adr: 225, rating: 4.62, ratingCount: 19, lastActivityAt: '2026-04-23',
  },
  {
    id: 'p-va4', code: 'VA-4', name: 'Villa Azur Apt 4', buildingName: 'Villa Azur Apartments',
    address: 'Apt 4, Villa Azur Apartments, Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'apartment', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o2', parentPropertyId: 'p-vac',
    listings: [{ channel: 'airbnb', externalId: 'air-va4-24', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-va4', status: 'active' }],
    baseRateMUR: 12_000_00, photoIds: ['ph-va4-1'], tags: ['Family-friendly'],
    occupancyYTD: 0.69, occupancy90d: 0.72, adr: 260, rating: 4.66, ratingCount: 21, lastActivityAt: '2026-04-22',
  },
  {
    id: 'p-vac', code: 'VA-C', name: 'Villa Azur Apartments Combo (2+3+4)', buildingName: 'Villa Azur Apartments',
    address: 'Villa Azur Apartments (full block), Bel Ombre',
    region: 'bel_ombre', area: 'Bel Ombre · South', zone: 'west', tier: 'big',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 7, bathrooms: 4, maxOccupancy: 14,
    primaryOwnerId: 'o2', isCombo: true, componentPropertyIds: ['p-va2', 'p-va3', 'p-va4'],
    listings: [{ channel: 'airbnb', externalId: 'air-vac-220', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-vac', status: 'active' }],
    baseRateMUR: 28_000_00, photoIds: ['ph-vac-1'], tags: ['Multi-unit', 'Group'],
    occupancyYTD: 0.28, occupancy90d: 0.34, adr: 690, rating: 4.78, ratingCount: 8, lastActivityAt: '2026-04-15',
  },

  // ── Other ──
  {
    id: 'p-bbh', code: 'BBH', name: 'Blue Bay House', address: 'Blue Bay Beach, Mahebourg',
    region: 'flic_en_flac', area: 'Blue Bay · South-East', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o3',
    listings: [
      { channel: 'airbnb', externalId: 'air-bbh-09', status: 'active' },
      { channel: 'friday_mu', externalId: 'fr-bbh', status: 'active' },
    ],
    baseRateMUR: 17_800_00,
    photoIds: ['ph-bbh-1'], tags: ['Beachfront'],
    occupancyYTD: 0.91, occupancy90d: 0.94, adr: 510, rating: 4.92, ratingCount: 51, lastActivityAt: '2026-04-26',
  },
  {
    id: 'p-sbn', code: 'SBN', name: 'Sable Noir Retreat', address: 'Tamarin Bay, Tamarin',
    region: 'flic_en_flac', area: 'Tamarin · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o4',
    listings: [{ channel: 'airbnb', externalId: 'air-sbn-13', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-sbn', status: 'active' }],
    baseRateMUR: 13_500_00,
    photoIds: ['ph-sbn-1'], tags: ['Luxury'],
    occupancyYTD: 0.78, occupancy90d: 0.81, adr: 385, rating: 4.78, ratingCount: 38, lastActivityAt: '2026-04-25',
  },
  {
    id: 'p-srt', code: 'SRT', name: 'Serenity Point', address: 'Black River Bay, Black River',
    region: 'flic_en_flac', area: 'Black River · West', zone: 'west', tier: 'medium',
    lifecycleStatus: 'live', onboardingChecklist: LIVE_COMPLETE(),
    listingType: 'villa', bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
    primaryOwnerId: 'o5',
    listings: [{ channel: 'airbnb', externalId: 'air-srt-22', status: 'active' }, { channel: 'friday_mu', externalId: 'fr-srt', status: 'active' }],
    baseRateMUR: 15_200_00,
    photoIds: ['ph-srt-1'], tags: ['Couples'],
    occupancyYTD: 0.81, occupancy90d: 0.84, adr: 450, rating: 4.84, ratingCount: 33, lastActivityAt: '2026-04-26',
  },
];

if (liveOnlyMode()) {
  PROPERTIES.length = 0;
}

// ───────────────── Lookups + helpers ─────────────────

export const PROPERTY_BY_CODE: Record<string, Property> = PROPERTIES.reduce(
  (acc, p) => ({ ...acc, [p.code]: p }),
  {} as Record<string, Property>,
);

export const PROPERTY_BY_ID: Record<string, Property> = PROPERTIES.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {} as Record<string, Property>,
);

export function isOnboardingComplete(p: Property): boolean {
  return ONBOARDING_REQUIRED.every((k) => p.onboardingChecklist[k] === 'complete');
}

export function lifecycleBadge(p: Property): { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' } {
  if (p.lifecycleStatus === 'onboarding') return { label: 'Onboarding', tone: 'info' };
  if (p.lifecycleStatus === 'paused') return { label: 'Paused', tone: 'warning' };
  if (p.lifecycleStatus === 'off_boarded') return { label: 'Off-boarded', tone: 'neutral' };
  if (!isOnboardingComplete(p)) return { label: 'Active · Pending', tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

export function checklistProgress(p: Property): { done: number; total: number; pct: number } {
  const total = ONBOARDING_REQUIRED.length;
  const done = ONBOARDING_REQUIRED.filter((k) => p.onboardingChecklist[k] === 'complete').length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

// ───────────────── Contract helper ─────────────────

/** Returns the property's contract, falling back to a sensible default for
 *  Phase 1 fixtures that don't carry one. Real contract data lands when
 *  Owners module + Legal/Admin Xodo integration ships. */
export function getContract(p: Property): Required<NonNullable<Property['contract']>> | { status: 'pending'; commissionPct: 0; paymentDay: 0 } {
  if (p.contract) {
    return {
      status: p.contract.status,
      commissionPct: p.contract.commissionPct,
      paymentDay: p.contract.paymentDay,
      endsAt: p.contract.endsAt ?? '—',
      xodoEnvelopeId: p.contract.xodoEnvelopeId ?? '—',
    };
  }
  if (p.lifecycleStatus === 'onboarding') {
    return { status: 'pending', commissionPct: 0, paymentDay: 0 };
  }
  // Reasonable Phase 1 default for live properties without explicit contract data.
  return { status: 'active', commissionPct: 20, paymentDay: 3, endsAt: '2027-12-31', xodoEnvelopeId: 'xodo-default' };
}

// ───────────────── Owners (N:M) ─────────────────

export const PROPERTY_OWNERS: PropertyOwner[] = PROPERTIES.map((p) => ({
  propertyId: p.id,
  ownerId: p.primaryOwnerId,
  ownershipPct: 100,
  isPrimary: true,
}));

export function ownersOfProperty(propertyId: string): PropertyOwner[] {
  return PROPERTY_OWNERS.filter((po) => po.propertyId === propertyId);
}

export function propertiesOfOwner(ownerId: string): Property[] {
  const ids = new Set(PROPERTY_OWNERS.filter((po) => po.ownerId === ownerId).map((po) => po.propertyId));
  return PROPERTIES.filter((p) => ids.has(p.id));
}

// ───────────────── Property photos (Phase 2 — gallery editor) ─────────────────

export type PhotoRoomTag =
  | 'exterior'
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'pool'
  | 'view'
  | 'amenity'
  | 'lifestyle'
  | 'other';

export const PHOTO_ROOM_LABEL: Record<PhotoRoomTag, string> = {
  exterior: 'Exterior',
  living: 'Living',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  pool: 'Pool',
  view: 'View',
  amenity: 'Amenity',
  lifestyle: 'Lifestyle',
  other: 'Other',
};

export interface PropertyPhoto {
  id: string;
  propertyId: string;
  /** Mock URL — Phase 2 backend bridges to real storage. */
  url?: string;
  caption?: string;
  roomTag: PhotoRoomTag;
  /** Channels this photo is published to. Empty = published to all. */
  channelSubsets: ListingChannel[];
  /** Hex hue for the gradient placeholder so different photos look different. */
  hue?: number;
}

/** Build a minimal photo record from a photoId in `Property.photoIds`. Phase 2
 *  swaps to real storage; this lets the gallery editor work today over the
 *  existing photoIds array without breaking the schema. */
function makePhoto(propertyId: string, id: string, idx: number): PropertyPhoto {
  // Heuristic room tag rotation so the gallery shows variety.
  const tags: PhotoRoomTag[] = ['exterior', 'living', 'bedroom', 'kitchen', 'bathroom', 'pool', 'view', 'amenity'];
  return {
    id,
    propertyId,
    roomTag: tags[idx % tags.length],
    channelSubsets: [],
    hue: (idx * 47) % 360,
  };
}

export const PROPERTY_PHOTOS: PropertyPhoto[] = PROPERTIES.flatMap((p) =>
  p.photoIds.map((id, idx) => makePhoto(p.id, id, idx)),
);

const PHOTO_BY_ID: Record<string, PropertyPhoto> = PROPERTY_PHOTOS.reduce(
  (acc, ph) => ({ ...acc, [ph.id]: ph }),
  {} as Record<string, PropertyPhoto>,
);

export function photosForProperty(propertyId: string): PropertyPhoto[] {
  const property = PROPERTY_BY_ID[propertyId];
  if (!property) return [];
  // Order matches Property.photoIds[]
  return property.photoIds
    .map((id) => PHOTO_BY_ID[id])
    .filter((p): p is PropertyPhoto => Boolean(p));
}

/** Mutate-in-place reorder. Returns the new order. */
export function reorderPhotos(propertyId: string, newOrder: string[]): void {
  const property = PROPERTY_BY_ID[propertyId];
  if (!property) return;
  property.photoIds = newOrder;
}

export function setHeroPhoto(propertyId: string, photoId: string): void {
  const property = PROPERTY_BY_ID[propertyId];
  if (!property) return;
  property.heroPhotoId = photoId;
}

export function updatePhoto(photoId: string, patch: Partial<Pick<PropertyPhoto, 'caption' | 'roomTag' | 'channelSubsets'>>): void {
  const photo = PHOTO_BY_ID[photoId];
  if (!photo) return;
  Object.assign(photo, patch);
}

export function addPhoto(propertyId: string, opts?: { roomTag?: PhotoRoomTag; caption?: string }): PropertyPhoto | null {
  const property = PROPERTY_BY_ID[propertyId];
  if (!property) return null;
  const id = `ph-${propertyId.slice(2)}-${Date.now()}`;
  const photo: PropertyPhoto = {
    id,
    propertyId,
    roomTag: opts?.roomTag ?? 'other',
    caption: opts?.caption,
    channelSubsets: [],
    hue: Math.floor(Math.random() * 360),
  };
  PROPERTY_PHOTOS.push(photo);
  PHOTO_BY_ID[id] = photo;
  property.photoIds = [...property.photoIds, id];
  if (!property.heroPhotoId) property.heroPhotoId = id;
  return photo;
}

export function removePhoto(propertyId: string, photoId: string): void {
  const property = PROPERTY_BY_ID[propertyId];
  if (!property) return;
  property.photoIds = property.photoIds.filter((id) => id !== photoId);
  if (property.heroPhotoId === photoId) property.heroPhotoId = property.photoIds[0];
  const idx = PROPERTY_PHOTOS.findIndex((ph) => ph.id === photoId);
  if (idx >= 0) PROPERTY_PHOTOS.splice(idx, 1);
  delete PHOTO_BY_ID[photoId];
}

// ───────────────── AI Card suggestions (Training-bound) ─────────────────
//
// Queue of pending Property Card suggestions surfaced by the AI extraction
// loop. Originally surfaced as a Properties sub-page; reframed as a Training
// concern (knowledge-extraction loop = "teaching the system") — moves to
// Training module when it scopes. Stays in this fixture for now so the
// inline per-property AI banner in the Operational tab keeps working;
// Properties · Insights surfaces a separate concern (improvement opportunities,
// not new knowledge).

export interface AiCardSuggestion {
  id: string;
  propertyId: string;
  /** Source thread / task / comment that surfaced the suggestion. */
  sourceLabel: string;
  category: PropertyCardCategory;
  proposedTitle: string;
  proposedBody: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export const AI_CARD_SUGGESTIONS: AiCardSuggestion[] = [
  {
    id: 'ai-1', propertyId: 'p-bs1',
    sourceLabel: 'Inbox · thread #1234 (Mathias)',
    category: 'utilities', proposedTitle: 'Water shutoff valve',
    proposedBody: 'Main water shutoff is in the utility closet behind the kitchen, lower-right corner. Counter-clockwise to close. Mathias mentioned it after the Apr 12 leak incident.',
    confidence: 0.91, status: 'pending', createdAt: '2026-04-26T11:30:00Z',
  },
  {
    id: 'ai-2', propertyId: 'p-vv47',
    sourceLabel: 'Inbox · 2 guest threads (Marchand · Beaumont)',
    category: 'pool_outdoor', proposedTitle: 'Pool heating',
    proposedBody: 'Pool is heated to ~28°C April-October; off-season requires 24h notice to enable. Solar-only; no electric backup.',
    confidence: 0.86, status: 'pending', createdAt: '2026-04-25T14:00:00Z',
  },
  {
    id: 'ai-3', propertyId: 'p-bl12',
    sourceLabel: 'Operations · task t-006 comments',
    category: 'wifi_tech', proposedTitle: 'A/C compressor model',
    proposedBody: 'Master bedroom A/C: Daikin FTXM50 · serial DK-22-44188 · installed 2025-06. Refer to Mathias for service.',
    confidence: 0.78, status: 'pending', createdAt: '2026-04-24T09:00:00Z',
  },
  {
    id: 'ai-4', propertyId: 'p-pt3',
    sourceLabel: 'Inbox · thread #4502 (cleaner)',
    category: 'access', proposedTitle: 'Side gate code',
    proposedBody: 'Side gate code is 7421 (rotates quarterly). Used for cleaner + maintenance access — separate from main door lockbox.',
    confidence: 0.83, status: 'pending', createdAt: '2026-04-23T16:00:00Z',
  },
  {
    id: 'ai-5', propertyId: 'p-cor',
    sourceLabel: 'Reviews · 3 reviews mentioning',
    category: 'local_context', proposedTitle: 'Best snorkeling spots',
    proposedBody: 'Trou aux Biches reef · 200m offshore from main beach · best at high tide. Recommended in 3 recent guest reviews — adding to Local context.',
    confidence: 0.74, status: 'pending', createdAt: '2026-04-22T10:00:00Z',
  },
];

const AI_BY_ID: Record<string, AiCardSuggestion> = AI_CARD_SUGGESTIONS.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<string, AiCardSuggestion>,
);

export function pendingAiSuggestions(): AiCardSuggestion[] {
  return AI_CARD_SUGGESTIONS.filter((s) => s.status === 'pending');
}

export function pendingAiSuggestionsForProperty(propertyId: string): AiCardSuggestion[] {
  return AI_CARD_SUGGESTIONS.filter((s) => s.propertyId === propertyId && s.status === 'pending');
}

export function acceptAiSuggestion(id: string): PropertyCard | null {
  const s = AI_BY_ID[id];
  if (!s || s.status !== 'pending') return null;
  s.status = 'accepted';
  const card: PropertyCard = {
    id: `pc-${s.propertyId.slice(2)}-ai-${s.id.slice(3)}`,
    propertyId: s.propertyId,
    category: s.category,
    title: s.proposedTitle,
    body: s.proposedBody,
    surface: 'both',
    source: 'ai_extracted',
    aiExtractionMetadata: { threadId: s.sourceLabel, confidence: s.confidence },
    lastUpdated: new Date().toISOString(),
    lastUpdatedByUserId: 'ai',
  };
  PROPERTY_CARDS.push(card);
  return card;
}

export function rejectAiSuggestion(id: string): void {
  const s = AI_BY_ID[id];
  if (s) s.status = 'rejected';
}

// ───────────────── Listing-quality recommendations (Phase 2) ─────────────────
//
// Heuristic recommendations surfaced per-property. Phase 1 = computed from
// property state; Phase 2 = augmented by photo analysis + LLM description
// scoring + occupancy trend signals.

export interface ListingRecommendation {
  id: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  actionLabel?: string;
}

export function listingRecommendations(p: Property): ListingRecommendation[] {
  const recs: ListingRecommendation[] = [];

  if (p.lifecycleStatus === 'live') {
    if (p.photoIds.length < 6) {
      recs.push({
        id: 'photos_low',
        severity: p.photoIds.length === 0 ? 'high' : 'medium',
        message: `Photo count is low (${p.photoIds.length} / 10 recommended). Channels weight listings with rich galleries.`,
        actionLabel: 'Open gallery',
      });
    }
    if (!p.description || p.description.length < 60) {
      recs.push({
        id: 'desc_short',
        severity: 'medium',
        message: `Base description is ${p.description ? p.description.length + ' chars' : 'empty'} — channels expect 200+ chars for SEO weighting.`,
        actionLabel: 'Edit description',
      });
    }
    if ((p.amenities ?? []).length < 8) {
      recs.push({
        id: 'amenities_thin',
        severity: 'low',
        message: `Only ${(p.amenities ?? []).length} amenities tagged. Filling out the matrix improves channel filterability.`,
        actionLabel: 'Open amenity matrix',
      });
    }
    // Occupancy trend (mock signal — Phase 2 wires real Analytics)
    if (p.occupancy90d < p.occupancyYTD - 0.10 && p.occupancyYTD > 0.4) {
      recs.push({
        id: 'occ_dropping',
        severity: 'high',
        message: `Occupancy dropping — 90d ${Math.round(p.occupancy90d * 100)}% vs YTD ${Math.round(p.occupancyYTD * 100)}%. Consider campaign or pricing review.`,
        actionLabel: 'Review pricing',
      });
    }
    if (p.listings.length < 2) {
      recs.push({
        id: 'channels_thin',
        severity: 'medium',
        message: `Only listed on ${p.listings.length} channel${p.listings.length === 1 ? '' : 's'}. Multi-channel exposure typically lifts occupancy 12-18%.`,
        actionLabel: 'Push to more channels',
      });
    }
  }

  if (p.lifecycleStatus === 'paused' && p.pauseReturnBy) {
    const returnDate = new Date(p.pauseReturnBy);
    const daysUntil = Math.ceil((returnDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil < 14) {
      recs.push({
        id: 'unpause_due',
        severity: 'medium',
        message: `Pause return-by is in ${daysUntil} days. Confirm renovation completion + plan re-listing.`,
      });
    }
  }

  return recs;
}

// ───────────────── Portfolio-level insights (Phase 2) ─────────────────
//
// Cross-property pattern detection — feeds the Insights sub-page.
// Phase 1 = heuristic; Phase 2 augments with real Analytics data + LLM
// pattern extraction across reviews / occupancy / pricing.

export interface PortfolioInsight {
  id: string;
  severity: 'low' | 'medium' | 'high';
  /** Properties impacted — code list. */
  propertyCodes: string[];
  title: string;
  message: string;
  /** Suggested follow-up action — narrative for now. */
  actionLabel?: string;
  /** Group-by axis (region / cohort / type). */
  axis?: 'region' | 'type' | 'multi-unit' | 'syndic';
}

export function portfolioInsights(): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];

  // Group occupancy slumps by region
  const byRegion: Record<string, Property[]> = {};
  PROPERTIES.forEach((p) => {
    if (p.lifecycleStatus !== 'live') return;
    (byRegion[p.region] = byRegion[p.region] || []).push(p);
  });
  Object.entries(byRegion).forEach(([region, props]) => {
    if (props.length < 2) return;
    const ytdAvg = props.reduce((acc, p) => acc + p.occupancyYTD, 0) / props.length;
    const recent = props.reduce((acc, p) => acc + p.occupancy90d, 0) / props.length;
    if (ytdAvg > 0.4 && recent < ytdAvg - 0.05) {
      insights.push({
        id: `region_drop_${region}`,
        severity: ytdAvg - recent > 0.10 ? 'high' : 'medium',
        propertyCodes: props.map((p) => p.code),
        title: `${region.replace(/_/g, ' ')} occupancy slipping`,
        message: `${props.length} live properties in this region · 90-day avg ${Math.round(recent * 100)}% vs YTD ${Math.round(ytdAvg * 100)}%. Pattern across the cohort, not isolated.`,
        actionLabel: 'Review pricing + campaign options',
        axis: 'region',
      });
    }
  });

  // Photo-thin properties
  const photoLow = PROPERTIES.filter((p) => p.lifecycleStatus === 'live' && p.photoIds.length < 4);
  if (photoLow.length >= 3) {
    insights.push({
      id: 'photos_thin_portfolio',
      severity: 'medium',
      propertyCodes: photoLow.map((p) => p.code),
      title: 'Photo gallery sweep needed',
      message: `${photoLow.length} live properties have fewer than 4 photos. Channel algorithms penalise listings with thin galleries.`,
      actionLabel: 'Schedule photoshoot batch',
    });
  }

  // Description coverage
  const descMissing = PROPERTIES.filter((p) => p.lifecycleStatus === 'live' && (!p.description || p.description.length < 60));
  if (descMissing.length >= 3) {
    insights.push({
      id: 'desc_coverage',
      severity: 'medium',
      propertyCodes: descMissing.map((p) => p.code),
      title: 'Description coverage low',
      message: `${descMissing.length} live properties have empty or short base descriptions. Channels weight SEO based on description length + freshness.`,
      actionLabel: 'Generate descriptions with AI assistant',
    });
  }

  // Multi-unit combo under-utilization
  const combos = PROPERTIES.filter((p) => p.isCombo);
  combos.forEach((combo) => {
    if (combo.occupancy90d < 0.4 && combo.componentPropertyIds) {
      const components = combo.componentPropertyIds.map((id) => PROPERTY_BY_ID[id]).filter(Boolean) as Property[];
      const componentAvg = components.reduce((acc, p) => acc + p.occupancy90d, 0) / Math.max(components.length, 1);
      insights.push({
        id: `combo_under_${combo.code}`,
        severity: 'low',
        propertyCodes: [combo.code, ...components.map((p) => p.code)],
        title: `${combo.code} combo under-booked`,
        message: `Combo property ${combo.code} (${combo.name}) at ${Math.round(combo.occupancy90d * 100)}% 90d occ vs component avg ${Math.round(componentAvg * 100)}%. Consider Smart Calendar Rule tuning or pricing review.`,
        actionLabel: 'Review combo strategy',
        axis: 'multi-unit',
      });
    }
  });

  // Channel coverage thin
  const oneChannel = PROPERTIES.filter((p) => p.lifecycleStatus === 'live' && p.listings.length === 1);
  if (oneChannel.length >= 3) {
    insights.push({
      id: 'channel_coverage_thin',
      severity: 'low',
      propertyCodes: oneChannel.map((p) => p.code),
      title: 'Single-channel exposure',
      message: `${oneChannel.length} live properties are listed on only one channel. Multi-channel typically lifts occupancy 12-18%.`,
      actionLabel: 'Push to additional channels',
    });
  }

  // Onboarding stuck
  const onboardingStuck = PROPERTIES.filter((p) => {
    if (p.lifecycleStatus !== 'onboarding') return false;
    const lastDate = new Date(p.lastActivityAt);
    const days = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    return days > 7;
  });
  if (onboardingStuck.length >= 1) {
    insights.push({
      id: 'onboarding_stuck',
      severity: 'high',
      propertyCodes: onboardingStuck.map((p) => p.code),
      title: 'Onboarding stalled',
      message: `${onboardingStuck.length} ${onboardingStuck.length === 1 ? 'property' : 'properties'} stuck > 7 days without activity. Escalate to Mathias.`,
      actionLabel: 'Review onboarding queue',
    });
  }

  return insights;
}

// ───────────────── Bulk-operation helpers (Phase 2) ─────────────────

export function bulkSetLifecycle(propertyIds: string[], status: LifecycleStatus, reason?: string): number {
  let n = 0;
  propertyIds.forEach((id) => {
    const p = PROPERTY_BY_ID[id];
    if (!p) return;
    p.lifecycleStatus = status;
    if (status === 'paused' && reason) p.pausedReason = reason;
    if (status === 'live') { p.pausedReason = undefined; p.pauseReturnBy = undefined; }
    n++;
  });
  return n;
}

export function bulkAddTag(propertyIds: string[], tag: string): number {
  let n = 0;
  propertyIds.forEach((id) => {
    const p = PROPERTY_BY_ID[id];
    if (!p) return;
    if (!p.tags.includes(tag)) {
      p.tags = [...p.tags, tag];
      n++;
    }
  });
  return n;
}

export function bulkRemoveTag(propertyIds: string[], tag: string): number {
  let n = 0;
  propertyIds.forEach((id) => {
    const p = PROPERTY_BY_ID[id];
    if (!p) return;
    if (p.tags.includes(tag)) {
      p.tags = p.tags.filter((t) => t !== tag);
      n++;
    }
  });
  return n;
}

/** All distinct tags across the portfolio — for the bulk-edit autocomplete. */
export function allTags(): string[] {
  const set = new Set<string>();
  PROPERTIES.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

// ───────────────── Description + amenity + listing-push helpers (Phase 2) ─────────────────

export function setBaseDescription(propertyId: string, description: string): void {
  const p = PROPERTY_BY_ID[propertyId];
  if (!p) return;
  p.description = description;
}

export function setChannelDescription(propertyId: string, channel: ListingChannel, description: string): void {
  const p = PROPERTY_BY_ID[propertyId];
  if (!p) return;
  const listing = p.listings.find((l) => l.channel === channel);
  if (!listing) return;
  listing.description = description;
}

export function toggleAmenity(propertyId: string, amenity: Amenity): void {
  const p = PROPERTY_BY_ID[propertyId];
  if (!p) return;
  const set = new Set(p.amenities ?? []);
  if (set.has(amenity)) set.delete(amenity); else set.add(amenity);
  p.amenities = Array.from(set);
}

/** Mock listing push — simulates write-through to Guesty/channel. Phase 2
 *  swaps the toast for real Guesty API call. */
export function pushListingToChannel(propertyId: string, channel: ListingChannel): { ok: boolean; message: string } {
  const p = PROPERTY_BY_ID[propertyId];
  if (!p) return { ok: false, message: 'Property not found' };

  const existing = p.listings.find((l) => l.channel === channel);
  const ts = new Date().toISOString();

  if (existing) {
    existing.status = 'active';
    existing.lastPushedAt = ts;
    return { ok: true, message: `Updated ${LISTING_CHANNEL_LABEL[channel]} listing · ${existing.externalId}` };
  }

  // Create-new path (Phase 2 write-through · listing-create per pack §13)
  const newId = `${channel}-${p.code.toLowerCase()}-${Math.floor(Math.random() * 999)}`;
  p.listings.push({
    channel,
    externalId: newId,
    status: 'active',
    description: p.description,
    lastPushedAt: ts,
  });
  return { ok: true, message: `Created ${LISTING_CHANNEL_LABEL[channel]} listing · ${newId}` };
}

/** Returns preflight issues that would block a successful push. Empty = ready. */
export function preflightChannelPush(p: Property, channel: ListingChannel): string[] {
  const issues: string[] = [];
  if (p.lifecycleStatus === 'off_boarded') issues.push('Property is off-boarded.');
  if (p.lifecycleStatus === 'paused') issues.push('Property is paused — unpause before pushing.');
  if (p.photoIds.length === 0) issues.push('No photos uploaded — channels require ≥ 1 photo.');
  if (!p.heroPhotoId) issues.push('No hero photo selected.');
  if (p.baseRateMUR === 0) issues.push('Base price not set.');
  if (channel === 'booking' && !isOnboardingComplete(p)) issues.push('Booking.com pushes require complete onboarding (3-5 reviews strategy).');
  return issues;
}

// ───────────────── Property Cards (sample fixtures) ─────────────────

export const PROPERTY_CARDS: PropertyCard[] = [
  {
    id: 'pc-vv47-access', propertyId: 'p-vv47', category: 'access',
    title: 'Lockbox · main gate',
    body: 'Lockbox on the right pillar at the main gate. Code 4710 (rotates monthly — see internal note).',
    surface: 'both', source: 'manual',
    lastUpdated: '2026-04-12T09:30:00Z', lastUpdatedByUserId: 'u-mathias',
  },
  {
    id: 'pc-vv47-wifi', propertyId: 'p-vv47', category: 'wifi_tech',
    title: 'Wifi — Villa Verde',
    body: 'Network: VV-47 · Password: oceanview2026 · Router in upstairs hallway closet.',
    surface: 'both', source: 'breezeway_imported',
    lastUpdated: '2026-03-22T14:00:00Z', lastUpdatedByUserId: 'u-mathias',
  },
  {
    id: 'pc-bl12-pool', propertyId: 'p-bl12', category: 'pool_outdoor',
    title: 'Pool pump — service schedule',
    body: 'Hayward TriStar VS950. Service every 6 weeks (Stanley Garden Co · v10). Last serviced 2026-03-18.',
    surface: 'internal_only', source: 'manual',
    lastUpdated: '2026-03-18T10:00:00Z', lastUpdatedByUserId: 'u-bryan',
  },
  {
    id: 'pc-gbhc8-syndic', propertyId: 'p-gbhc8', category: 'building_syndic',
    title: 'Grand Beehive — syndic relationship',
    body: 'Friday Retreats acts as the syndicate. Façade maintenance + common-area cleaning routed via Syndic module.',
    surface: 'internal_only', source: 'manual',
    lastUpdated: '2026-04-02T11:00:00Z', lastUpdatedByUserId: 'u-franny',
  },
  {
    id: 'pc-global-greeting', propertyId: 'global', category: 'local_context',
    title: 'Standard arrival greeting (FR/EN)',
    body: 'Good evening / Bonsoir — welcome to Mauritius. Your driver will collect you in the marked Friday Retreats vehicle.',
    surface: 'both', source: 'guesty_imported',
    lastUpdated: '2026-02-10T08:00:00Z', lastUpdatedByUserId: 'u-franny',
  },
];

export function cardsForProperty(propertyId: string, opts?: { includeGlobal?: boolean }): PropertyCard[] {
  const own = PROPERTY_CARDS.filter((c) => c.propertyId === propertyId);
  if (opts?.includeGlobal) return [...own, ...PROPERTY_CARDS.filter((c) => c.propertyId === 'global')];
  return own;
}

// ───────────────── Onboarding artifacts (Nitzana mid-flight) ─────────────────

export const ONBOARDING_ARTIFACTS: OnboardingArtifact[] = [
  {
    id: 'ar-nit-sv', propertyId: 'p-nit', type: 'site_visit', status: 'complete',
    visitDate: '2026-03-15', attendeesUserIds: ['u-mathias', 'u-ishant'], photosCount: 24,
    completedAt: '2026-03-15T17:00:00Z',
  } as SiteVisitArtifact,
  {
    id: 'ar-nit-oa', propertyId: 'p-nit', type: 'owner_agreement', status: 'complete',
    xodoEnvelopeId: 'xodo-22441', xodoStatus: 'signed',
    commissionPct: 20, paymentDay: 3, completedAt: '2026-03-22T11:00:00Z',
  } as OwnerAgreementArtifact,
  {
    id: 'ar-nit-sb', propertyId: 'p-nit', type: 'standards_book', status: 'complete',
    versionDelivered: '2026.03', deliveredAt: '2026-03-25', completedAt: '2026-03-26T09:00:00Z',
  } as StandardsBookArtifact,
  {
    id: 'ar-nit-keys', propertyId: 'p-nit', type: 'keys', status: 'complete',
    setsReceived: 2, duplicatesMadeAt: '2026-04-02', storageLocation: 'Office key safe · Bel Ombre',
    completedAt: '2026-04-02T15:00:00Z',
  } as KeysArtifact,
  {
    id: 'ar-nit-am', propertyId: 'p-nit', type: 'amenities_form', status: 'in_progress',
    startedAt: '2026-04-15T10:00:00Z', assignedToUserId: 'u-mathias',
  } as AmenitiesFormArtifact,
  {
    id: 'ar-nit-gap', propertyId: 'p-nit', type: 'gap_analysis', status: 'in_progress',
    startedAt: '2026-04-18T09:00:00Z', assignedToUserId: 'u-mathias',
    items: [
      { id: 'g1', item: 'Bath towels (set of 12)', qtyNeeded: 12, status: 'purchased', costMinor: 24_000_00, paidBy: 'friday', reimbursementStatus: 'pending' },
      { id: 'g2', item: 'Pool towels (set of 8)', qtyNeeded: 8, status: 'missing', costMinor: 12_000_00, paidBy: 'friday', reimbursementStatus: 'pending' },
      { id: 'g3', item: 'Coffee machine (Nespresso pro)', qtyNeeded: 1, status: 'owner_provided' },
      { id: 'g4', item: 'BBQ utensils', qtyNeeded: 1, status: 'missing' },
    ],
  } as GapAnalysisArtifact,
  {
    id: 'ar-nit-hbo', propertyId: 'p-nit', type: 'home_build_out', status: 'in_progress',
    startedAt: '2026-04-20T11:00:00Z', assignedToUserId: 'u-mathias',
    items: [
      { id: 'h1', item: 'AC unit · master bedroom', brand: 'Daikin', model: 'FTXM50', serial: 'DK-22-44188', purchaseDate: '2025-06-12', locationInProperty: 'Master bedroom' },
      { id: 'h2', item: 'Pool pump', brand: 'Hayward', model: 'TriStar VS950', purchaseDate: '2024-11-04', locationInProperty: 'Pool plant room' },
    ],
  } as HomeBuildOutArtifact,
  {
    id: 'ar-nit-pm', propertyId: 'p-nit', type: 'preventative_maintenance', status: 'not_started',
  } as PreventativeMaintenanceArtifact,
  {
    id: 'ar-nit-ac', propertyId: 'p-nit', type: 'aesthetic_check', status: 'not_started',
  } as AestheticCheckArtifact,
  {
    id: 'ar-nit-ph', propertyId: 'p-nit', type: 'photoshoot', status: 'not_started',
  } as PhotoshootArtifact,
  {
    id: 'ar-nit-ls', propertyId: 'p-nit', type: 'listing_setup', status: 'not_started',
  } as ListingSetupArtifact,
];

export function artifactsForProperty(propertyId: string): OnboardingArtifact[] {
  return ONBOARDING_ARTIFACTS.filter((a) => a.propertyId === propertyId);
}

// ───────────────── Activity (light fixtures) ─────────────────

export const PROPERTY_ACTIVITY: PropertyActivity[] = [
  { id: 'pa-nit-1', propertyId: 'p-nit', ts: '2026-04-27T14:30:00Z', kind: 'note', actorId: 'u-mathias', detail: 'Photoshoot scheduled for 2026-05-04 (preliminary).' },
  { id: 'pa-nit-2', propertyId: 'p-nit', ts: '2026-04-25T09:00:00Z', kind: 'onboarding_step_complete', actorId: 'u-mathias', detail: 'Keys received (2 sets) + duplicates made.' },
  { id: 'pa-nit-3', propertyId: 'p-nit', ts: '2026-04-22T11:00:00Z', kind: 'onboarding_step_complete', actorId: 'u-ishant', detail: 'Owner agreement signed (Xodo · xodo-22441) · 20% commission · payment day 3.' },
  { id: 'pa-lca-1', propertyId: 'p-lca', ts: '2026-04-12T10:00:00Z', kind: 'lifecycle_changed', actorId: 'u-franny', detail: 'Live → Paused (renovation: bathroom + kitchen). Return-by 2026-06-15.' },
  { id: 'pa-bl12-1', propertyId: 'p-bl12', ts: '2026-04-26T08:00:00Z', kind: 'card_added', actorId: 'u-bryan', detail: 'Pool pump service schedule card added.' },
];

export function activityForProperty(propertyId: string): PropertyActivity[] {
  return PROPERTY_ACTIVITY.filter((a) => a.propertyId === propertyId).sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

// ───────────────── Back-compat shims ─────────────────
//
// These derive the legacy shapes from the canonical `PROPERTIES` array so old
// imports keep working. Commit 4 will retire the shims and update consumers.

/** Synthetic OFFICE meta-entry — not a real property, but Operations module needs it as a task-property option. */
export const OFFICE_META: { code: string; name: string; zone: PropertyZone; tier: PropertyTier } = {
  code: 'OFFICE', name: 'Office / Store / Admin', zone: 'office', tier: 'small',
};

/** Drop-in shim for the legacy `TaskProperty` shape. */
export const TASK_PROPERTIES_SHIM: { code: string; name: string; zone: PropertyZone; tier: PropertyTier }[] =
  [...PROPERTIES.map((p) => ({ code: p.code, name: p.name, zone: p.zone, tier: p.tier })), OFFICE_META];

/** Drop-in shim for the legacy `FinProperty` shape. */
export const FIN_PROPERTIES_SHIM: { code: string; name: string; ownerId: string }[] =
  PROPERTIES
    .filter((p) => p.lifecycleStatus !== 'onboarding') // onboarding properties have no Finance shape yet
    .map((p) => ({ code: p.code, name: p.name, ownerId: p.primaryOwnerId }));

/** Drop-in shim for legacy `PROPERTY_COHORT`. */
export const PROPERTY_COHORT_SHIM: Record<string, Cohort> = PROPERTIES.reduce(
  (acc, p) => ({ ...acc, [p.code]: p.region }),
  {} as Record<string, Cohort>,
);

// ───────────────── Hydration support ─────────────────

/** Re-derive every PROPERTIES-dependent map / shim in place. Call after
 *  any code that mutates `PROPERTIES` (e.g. propertiesClient hydrating
 *  from /api/properties) so consumers reading PROPERTY_BY_CODE,
 *  PROPERTY_OWNERS, the legacy shims, etc. see the new rows. Mutates
 *  in place so the existing `const` exports keep their references.
 */
export function rebuildDerivedPropertyMaps(): void {
  // PROPERTY_BY_CODE / PROPERTY_BY_ID — wipe keys, then refill from PROPERTIES.
  for (const k of Object.keys(PROPERTY_BY_CODE)) delete PROPERTY_BY_CODE[k];
  for (const k of Object.keys(PROPERTY_BY_ID)) delete PROPERTY_BY_ID[k];
  for (const p of PROPERTIES) {
    PROPERTY_BY_CODE[p.code] = p;
    PROPERTY_BY_ID[p.id] = p;
  }

  // PROPERTY_OWNERS — replace in place.
  PROPERTY_OWNERS.length = 0;
  for (const p of PROPERTIES) {
    PROPERTY_OWNERS.push({
      propertyId: p.id,
      ownerId: p.primaryOwnerId,
      ownershipPct: 100,
      isPrimary: true,
    });
  }

  // PROPERTY_PHOTOS + PHOTO_BY_ID — replace in place.
  PROPERTY_PHOTOS.length = 0;
  for (const k of Object.keys(PHOTO_BY_ID)) delete PHOTO_BY_ID[k];
  for (const p of PROPERTIES) {
    p.photoIds.forEach((id, idx) => {
      const photo = makePhoto(p.id, id, idx);
      PROPERTY_PHOTOS.push(photo);
      PHOTO_BY_ID[id] = photo;
    });
  }

  // Back-compat shims.
  TASK_PROPERTIES_SHIM.length = 0;
  PROPERTIES.forEach((p) =>
    TASK_PROPERTIES_SHIM.push({ code: p.code, name: p.name, zone: p.zone, tier: p.tier }),
  );
  TASK_PROPERTIES_SHIM.push(OFFICE_META);

  FIN_PROPERTIES_SHIM.length = 0;
  PROPERTIES
    .filter((p) => p.lifecycleStatus !== 'onboarding')
    .forEach((p) =>
      FIN_PROPERTIES_SHIM.push({ code: p.code, name: p.name, ownerId: p.primaryOwnerId }),
    );

  for (const k of Object.keys(PROPERTY_COHORT_SHIM)) delete PROPERTY_COHORT_SHIM[k];
  for (const p of PROPERTIES) {
    PROPERTY_COHORT_SHIM[p.code] = p.region;
  }
}
