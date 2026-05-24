// Live Properties from /api/properties (FAD-native overlay merged with
// guesty_listings cache). Replaces the static PROPERTIES fixture at
// runtime; consumers don't change.
//
// 2026-05-24: extended to read the v0.2 LOCKED overlay fields
// (lifecycle_status, onboarding_checklist, tags, amenities, building_name,
// contract, etc.) directly from the backend instead of filling with
// safe defaults. Also exposes write helpers — createProperty, plus
// per-property nested resource fetchers (cards, owners, photos,
// onboarding artifacts, activity log).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import { bumpFixtureRev } from './fixtureRev';
import type { Cohort } from './reviews';
import { COHORT_LABEL } from './reviews';
import {
  PROPERTIES,
  LIVE_COMPLETE,
  rebuildDerivedPropertyMaps,
  ONBOARDING_REQUIRED,
} from './properties';
import type {
  Property,
  ListingType,
  PropertyZone,
  PropertyTier,
  LifecycleStatus,
  OnboardingChecklist,
  OnboardingChecklistKey,
  ChecklistItemStatus,
  ListingRecord,
  Amenity,
} from './properties';

// ───────────────── Backend response shape ─────────────────

interface MergedListing {
  id: string;
  overlay_id: string | null;
  guesty_id: string | null;
  code: string | null;
  nickname: string | null;
  name: string | null;
  building_name: string | null;
  title: string | null;
  address: { full: string | null; city: string | null; country: string | null } | null;
  region: string | null;
  area: string | null;
  zone: string | null;
  tier: string | null;
  geo: { lat: number; lng: number } | null;
  picture_url: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  accommodates: number | null;
  sqm: number | null;
  description: string | null;
  lifecycle_status: string | null;
  onboarding_checklist: Record<string, string> | null;
  live_since: string | null;
  paused_reason: string | null;
  pause_return_by: string | null;
  parent_property_id: string | null;
  is_combo: boolean;
  contract: {
    status: string | null;
    commission_pct: number | null;
    payment_day: number | null;
    ends_at: string | null;
    xodo_envelope_id: string | null;
  } | null;
  maintenance_cap_override_minor: number | null;
  listings: ListingRecord[] | null;
  base_price_minor: number | null;
  currency_code: string | null;
  is_active: boolean;
  hero_photo_id: string | null;
  tags: string[] | null;
  amenities: string[] | null;
  is_syndic_managed: boolean;
  syndic_id: string | null;
  last_activity_at: string | null;
  synced_at: string | null;
  primary_owner_id?: string | null;
  primary_owner_display_name?: string | null;
  availability?: {
    blocked_30d?: number | null;
    min_price_minor_30d?: number | null;
    max_price_minor_30d?: number | null;
    calendar_synced_at?: string | null;
  };
}

interface MergedListingsResponse {
  listings: MergedListing[];
}

export async function loadMergedListings(): Promise<MergedListing[]> {
  const res = (await apiFetch('/api/properties')) as MergedListingsResponse;
  return Array.isArray(res?.listings) ? res.listings : [];
}

// ───────────────── Transform helpers ─────────────────

const KNOWN_COHORTS: ReadonlyArray<Cohort> = ['flic_en_flac', 'grand_baie', 'west', 'pereybere', 'bel_ombre', 'other'];

function coerceCohort(raw: string | null | undefined): Cohort {
  if (!raw) return 'other';
  return (KNOWN_COHORTS as ReadonlyArray<string>).includes(raw) ? (raw as Cohort) : 'other';
}

function coerceZone(raw: string | null | undefined, cohort: Cohort): PropertyZone {
  if (raw === 'north' || raw === 'west' || raw === 'office') return raw;
  if (cohort === 'grand_baie' || cohort === 'pereybere') return 'north';
  return 'west';
}

function zoneLabel(z: PropertyZone): string {
  if (z === 'north') return 'North';
  if (z === 'west') return 'West';
  return 'Office';
}

function coerceTier(raw: string | null | undefined, accommodates: number | null): PropertyTier {
  if (raw === 'small' || raw === 'medium' || raw === 'big') return raw;
  const v = typeof accommodates === 'number' && accommodates > 0 ? accommodates : 2;
  if (v <= 2) return 'small';
  if (v <= 5) return 'medium';
  return 'big';
}

const KNOWN_LIFECYCLE: ReadonlyArray<LifecycleStatus> = ['onboarding', 'live', 'paused', 'off_boarded'];

function coerceLifecycle(raw: string | null | undefined, isActive: boolean): LifecycleStatus {
  // Backend may return 'prospect'; the Property type doesn't model it yet —
  // collapse to 'onboarding' until the frontend type adds it.
  if (raw === 'prospect') return 'onboarding';
  if (raw && (KNOWN_LIFECYCLE as ReadonlyArray<string>).includes(raw)) return raw as LifecycleStatus;
  return isActive ? 'live' : 'paused';
}

const KNOWN_LISTING_TYPES: ReadonlyArray<ListingType> = ['villa', 'apartment', 'studio', 'townhouse', 'bungalow'];

function coerceListingType(raw: string | null | undefined): ListingType {
  if (raw && (KNOWN_LISTING_TYPES as ReadonlyArray<string>).includes(raw.toLowerCase())) {
    return raw.toLowerCase() as ListingType;
  }
  if (!raw) return 'apartment';
  const s = raw.toLowerCase();
  if (s.includes('villa')) return 'villa';
  if (s.includes('studio')) return 'studio';
  if (s.includes('town')) return 'townhouse';
  if (s.includes('bungalow')) return 'bungalow';
  return 'apartment';
}

function coerceChecklist(raw: Record<string, string> | null): OnboardingChecklist {
  if (!raw || typeof raw !== 'object') return LIVE_COMPLETE();
  const out: OnboardingChecklist = {};
  for (const key of Object.keys(raw)) {
    const v = raw[key];
    if (v === 'not_started' || v === 'in_progress' || v === 'complete' || v === 'skipped') {
      out[key as OnboardingChecklistKey] = v as ChecklistItemStatus;
    }
  }
  return Object.keys(out).length > 0 ? out : LIVE_COMPLETE();
}

/** Merge a backend-shaped listing into the rich `Property` shape the FAD
 *  modules consume. Overlay fields take precedence over Guesty cache
 *  defaults; both are merged transparently. */
export function mergedListingToProperty(l: MergedListing): Property {
  const cohort = coerceCohort(l.region);
  const zone = coerceZone(l.zone, cohort);
  const accommodates = typeof l.accommodates === 'number' && l.accommodates > 0 ? l.accommodates : 2;
  const bedrooms = typeof l.bedrooms === 'number' && l.bedrooms >= 0 ? l.bedrooms : 0;
  const bathrooms = typeof l.bathrooms === 'number' && l.bathrooms >= 0 ? l.bathrooms : undefined;
  // id semantics: keep guesty_id when present (existing consumer behavior);
  // fall back to overlay UUID for prospects/manual-creates.
  const id = l.guesty_id || l.overlay_id || l.id;
  const code = (l.code && l.code.trim()) || (l.guesty_id ? l.guesty_id.slice(-8) : id);
  const name = (l.name && l.name.trim())
    || (l.title && l.title.trim())
    || l.nickname
    || `Listing ${(l.guesty_id || id).slice(-6)}`;
  const photoId = l.hero_photo_id
    ? `ph-overlay-${l.hero_photo_id}`
    : (l.picture_url ? `ph-guesty-${l.guesty_id || id}` : undefined);
  const area = l.area || `${COHORT_LABEL[cohort]} · ${zoneLabel(zone)}`;
  const listings: ListingRecord[] = Array.isArray(l.listings) && l.listings.length > 0
    ? (l.listings as ListingRecord[])
    : [{
        channel: 'friday_mu',
        externalId: l.guesty_id || id,
        status: l.is_active ? 'active' : 'paused',
      }];
  const tags = Array.isArray(l.tags) ? l.tags : [];
  const amenities = Array.isArray(l.amenities) ? (l.amenities as Amenity[]) : undefined;

  return {
    id,
    code,
    name,
    buildingName: l.building_name || undefined,
    address: l.address?.full || l.address?.city || '',
    region: cohort,
    area,
    zone,
    tier: coerceTier(l.tier, accommodates),
    geo: l.geo || undefined,
    lifecycleStatus: coerceLifecycle(l.lifecycle_status, l.is_active),
    onboardingChecklist: coerceChecklist(l.onboarding_checklist),
    liveSince: l.live_since || undefined,
    pausedReason: l.paused_reason || undefined,
    pauseReturnBy: l.pause_return_by || undefined,
    listingType: coerceListingType(l.property_type),
    bedrooms,
    bathrooms,
    maxOccupancy: accommodates,
    sqm: l.sqm || undefined,
    parentPropertyId: l.parent_property_id || undefined,
    isCombo: !!l.is_combo,
    // Prefer the live primary owner (mig 081). Falls back to the legacy
    // placeholder when no fad_property_owners row exists yet.
    primaryOwnerId: l.primary_owner_id || 'o-guesty-unknown',
    primaryOwnerName: l.primary_owner_display_name || undefined,
    maintenanceCapOverrideMinor: l.maintenance_cap_override_minor || undefined,
    contract: l.contract?.status ? {
      status: (l.contract.status as 'active' | 'pending' | 'renewal_due' | 'expired'),
      commissionPct: l.contract.commission_pct || 0,
      paymentDay: l.contract.payment_day || 1,
      endsAt: l.contract.ends_at || undefined,
      xodoEnvelopeId: l.contract.xodo_envelope_id || undefined,
    } : undefined,
    listings,
    baseRateMUR: typeof l.base_price_minor === 'number' ? l.base_price_minor : 0,
    heroPhotoId: photoId,
    heroPhotoUrl: l.picture_url || null,
    photoIds: photoId ? [photoId] : [],
    tags,
    amenities,
    description: l.description || undefined,
    isSyndicManaged: !!l.is_syndic_managed,
    syndicId: l.syndic_id || undefined,
    occupancyYTD: 0,
    occupancy90d: 0,
    adr: typeof l.availability?.min_price_minor_30d === 'number'
      ? Math.round(l.availability.min_price_minor_30d / 100)
      : 0,
    rating: 0,
    ratingCount: 0,
    lastActivityAt: l.last_activity_at || l.synced_at || '',
  };
}

// Back-compat alias — earlier transform was named guestyListingToProperty
// when the backend only returned Guesty cache fields. New code should use
// mergedListingToProperty; the alias keeps existing imports working.
export const guestyListingToProperty = mergedListingToProperty;

// Back-compat alias — earlier surface name.
export const loadGuestyListings = loadMergedListings;

// ───────────────── Hydration ─────────────────

export async function hydratePropertiesFromGuesty(): Promise<void> {
  const listings = await loadMergedListings();
  const next = listings.map(mergedListingToProperty);
  PROPERTIES.length = 0;
  PROPERTIES.push(...next);
  rebuildDerivedPropertyMaps();
  bumpFixtureRev();
}

export function useHydratePropertiesFromGuesty(): {
  hydrated: boolean;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
  rev: number;
} {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    hydratePropertiesFromGuesty()
      .then(() => {
        setHydrated(true);
        setRev((r) => r + 1);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
  }, []);
  useEffect(() => { refetch(); }, [refetch]);
  return { hydrated, loading, isRevalidating, error, refetch, rev };
}

// ───────────────── Write helpers ─────────────────

export interface CreatePropertyInput {
  code: string;
  name: string;
  buildingName?: string;
  address?: string;
  region?: string;
  area?: string;
  zone?: string;
  tier?: string;
  geo?: { lat: number; lng: number };
  listingType?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxOccupancy?: number;
  sqm?: number;
  description?: string;
  lifecycleStatus?: string;
  onboardingChecklist?: Record<string, string>;
  liveSince?: string;
  primaryOwnerId?: string;
  baseRateMUR?: number;
  tags?: string[];
  amenities?: string[];
  listings?: ListingRecord[];
  contract?: {
    status?: string;
    commissionPct?: number;
    paymentDay?: number;
    endsAt?: string;
    xodoEnvelopeId?: string;
  };
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const res = (await apiFetch('/api/properties', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as MergedListing;
  return mergedListingToProperty(res);
}

// ───────────────── Cards ─────────────────

export interface PropertyCardRecord {
  id: string;
  property_id: string | null;
  category: string;
  title: string;
  body: string;
  surface: 'guest_facing' | 'internal_only' | 'both';
  source: 'manual' | 'ai_extracted' | 'onboarding_form' | 'breezeway_imported' | 'guesty_imported';
  ai_thread_id: string | null;
  ai_confidence: number | null;
  last_updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadPropertyCards(propertyIdOrGuestyId: string): Promise<PropertyCardRecord[]> {
  const res = await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/cards`) as { cards?: PropertyCardRecord[] };
  return res.cards || [];
}

/** SWR-style hook for a property's Cards. Returns [] until the fetch returns
 *  so the caller can fall back to fixture defaults during the initial render.
 *  Errors surface on `error` but don't throw — the OperationalTab degrades to
 *  fixtures gracefully when the backend is unavailable. */
export function usePropertyCards(propertyIdOrGuestyId: string | undefined): {
  cards: PropertyCardRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [cards, setCards] = useState<PropertyCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    if (!propertyIdOrGuestyId) { setLoading(false); return; }
    setLoading(true);
    loadPropertyCards(propertyIdOrGuestyId)
      .then((r) => { setCards(r); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cards'))
      .finally(() => setLoading(false));
  }, [propertyIdOrGuestyId]);
  useEffect(() => { refetch(); }, [refetch]);
  return { cards, loading, error, refetch };
}

export async function createPropertyCard(propertyIdOrGuestyId: string, input: {
  category: string;
  title: string;
  body?: string;
  surface?: string;
  source?: string;
  scope?: 'property' | 'global';
}): Promise<PropertyCardRecord> {
  return await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/cards`, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as PropertyCardRecord;
}

export async function updatePropertyCard(propertyIdOrGuestyId: string, cardId: string, input: Partial<{
  category: string;
  title: string;
  body: string;
  surface: string;
}>): Promise<PropertyCardRecord> {
  return await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/cards/${encodeURIComponent(cardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }) as PropertyCardRecord;
}

export async function deletePropertyCard(propertyIdOrGuestyId: string, cardId: string): Promise<void> {
  await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/cards/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });
}

// ───────────────── Owners ─────────────────

export interface PropertyOwnerRecord {
  id: string;
  property_id: string;
  owner_id: string;
  ownership_pct: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export async function loadPropertyOwners(propertyIdOrGuestyId: string): Promise<PropertyOwnerRecord[]> {
  const res = await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/owners`) as { owners?: PropertyOwnerRecord[] };
  return res.owners || [];
}

export async function upsertPropertyOwner(propertyIdOrGuestyId: string, input: {
  ownerId: string;
  ownershipPct?: number;
  isPrimary?: boolean;
}): Promise<PropertyOwnerRecord> {
  return await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/owners`, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as PropertyOwnerRecord;
}

export async function removePropertyOwner(propertyIdOrGuestyId: string, ownerRowId: string): Promise<void> {
  await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/owners/${encodeURIComponent(ownerRowId)}`, {
    method: 'DELETE',
  });
}

// ───────────────── Photos ─────────────────

export interface PropertyPhotoRecord {
  id: string;
  property_id: string;
  storage_key: string;
  url: string | null;
  alt_text: string | null;
  is_hero: boolean;
  display_order: number;
  tags: string[];
  channels: string[];
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

export async function loadPropertyPhotos(propertyIdOrGuestyId: string): Promise<PropertyPhotoRecord[]> {
  const res = await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/photos`) as { photos?: PropertyPhotoRecord[] };
  return res.photos || [];
}

// ───────────────── Onboarding artifacts ─────────────────

export interface OnboardingArtifactRecord {
  id: string;
  property_id: string;
  artifact_type: string;
  status: ChecklistItemStatus;
  started_at: string | null;
  completed_at: string | null;
  assigned_to_user_id: string | null;
  notes: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function loadOnboardingArtifacts(propertyIdOrGuestyId: string): Promise<OnboardingArtifactRecord[]> {
  const res = await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/onboarding-artifacts`) as { artifacts?: OnboardingArtifactRecord[] };
  return res.artifacts || [];
}

export async function upsertOnboardingArtifact(propertyIdOrGuestyId: string, input: {
  artifactType: string;
  status?: ChecklistItemStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  assignedToUserId?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
}): Promise<OnboardingArtifactRecord> {
  return await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/onboarding-artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as OnboardingArtifactRecord;
}

// ───────────────── Activity log ─────────────────

export interface PropertyActivityRecord {
  id: string;
  kind: string;
  actor_id: string | null;
  detail: string;
  metadata: Record<string, unknown>;
  ts: string;
}

export async function loadPropertyActivity(propertyIdOrGuestyId: string, limit = 100): Promise<PropertyActivityRecord[]> {
  const res = await apiFetch(`/api/properties/${encodeURIComponent(propertyIdOrGuestyId)}/activity?limit=${limit}`) as { activity?: PropertyActivityRecord[] };
  return res.activity || [];
}

// ───────────────── Helpers ─────────────────

/** Build an "all artifacts at not_started" checklist for new onboardings. */
export function emptyOnboardingChecklist(): OnboardingChecklist {
  return ONBOARDING_REQUIRED.reduce(
    (acc, k) => ({ ...acc, [k]: 'not_started' as ChecklistItemStatus }),
    {} as OnboardingChecklist,
  );
}
