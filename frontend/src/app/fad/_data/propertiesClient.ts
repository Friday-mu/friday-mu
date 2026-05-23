// Hydrate the Properties module's PROPERTIES fixture from /api/properties
// (the operational Guesty listings cache). Mirrors the designClient
// pattern: fetch → transform → splice into the fixture array in place →
// rebuild derived maps/shims → bumpFixtureRev so consumers re-render.
//
// This replaces the static 24-row PROPERTIES fixture at runtime with the
// live 60-row Guesty listings, without per-file rewrites of the ~20
// consumers that already read PROPERTIES, PROPERTY_BY_CODE, etc.

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
} from './properties';
import type {
  Property,
  ListingType,
  PropertyZone,
  PropertyTier,
} from './properties';

// ───────────────── API shape ─────────────────

interface GuestyListing {
  id: string;
  guesty_id: string;
  nickname: string | null;
  title: string | null;
  address: { full: string | null; city: string | null; country: string | null } | null;
  cohort: string | null;
  picture_url: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  accommodates: number | null;
  base_price_minor: number | null;
  currency_code: string | null;
  is_active: boolean;
  synced_at: string | null;
  availability?: {
    blocked_30d?: number | null;
    min_price_minor_30d?: number | null;
    max_price_minor_30d?: number | null;
    calendar_synced_at?: string | null;
  };
}

interface GuestyListingsResponse {
  listings: GuestyListing[];
}

export async function loadGuestyListings(): Promise<GuestyListing[]> {
  const res = (await apiFetch('/api/properties')) as GuestyListingsResponse;
  return Array.isArray(res?.listings) ? res.listings : [];
}

// ───────────────── Transform helpers ─────────────────

const KNOWN_COHORTS: ReadonlyArray<Cohort> = ['flic_en_flac', 'grand_baie', 'west', 'pereybere', 'bel_ombre', 'other'];

function coerceCohort(raw: string | null | undefined): Cohort {
  if (!raw) return 'other';
  return (KNOWN_COHORTS as ReadonlyArray<string>).includes(raw) ? (raw as Cohort) : 'other';
}

function zoneFromCohort(c: Cohort): PropertyZone {
  if (c === 'grand_baie' || c === 'pereybere') return 'north';
  // flic_en_flac, west, bel_ombre, other → west bucket (PropertyZone has no south)
  return 'west';
}

function zoneLabel(z: PropertyZone): string {
  if (z === 'north') return 'North';
  if (z === 'west') return 'West';
  return 'Office';
}

function areaFromCohort(c: Cohort, z: PropertyZone): string {
  return `${COHORT_LABEL[c]} · ${zoneLabel(z)}`;
}

function tierFromAccommodates(n: number | null | undefined): PropertyTier {
  const v = typeof n === 'number' && n > 0 ? n : 2;
  if (v <= 2) return 'small';
  if (v <= 5) return 'medium';
  return 'big';
}

function listingTypeFromString(raw: string | null | undefined): ListingType {
  if (!raw) return 'apartment';
  const s = raw.toLowerCase();
  if (s.includes('villa')) return 'villa';
  if (s.includes('studio')) return 'studio';
  if (s.includes('town')) return 'townhouse';
  if (s.includes('bungalow')) return 'bungalow';
  if (s.includes('apart') || s.includes('flat') || s.includes('condo')) return 'apartment';
  return 'apartment';
}

/** Transform a /api/properties listing into the rich Property shape the
 *  Properties module consumes. Fields the API doesn't yet carry get
 *  sensible Phase-1 defaults so existing consumers keep rendering. */
export function guestyListingToProperty(l: GuestyListing): Property {
  const cohort = coerceCohort(l.cohort);
  const zone = zoneFromCohort(cohort);
  const accommodates = typeof l.accommodates === 'number' && l.accommodates > 0 ? l.accommodates : 2;
  const bedrooms = typeof l.bedrooms === 'number' && l.bedrooms >= 0 ? l.bedrooms : 0;
  const bathrooms = typeof l.bathrooms === 'number' && l.bathrooms >= 0 ? l.bathrooms : undefined;
  const code = (l.nickname && l.nickname.trim()) || l.guesty_id.slice(-8);
  const name = (l.title && l.title.trim()) || l.nickname || `Listing ${l.guesty_id.slice(-6)}`;
  const photoId = l.picture_url ? `ph-guesty-${l.guesty_id}` : undefined;

  return {
    id: l.guesty_id,
    code,
    name,
    address: l.address?.full || l.address?.city || '',
    region: cohort,
    area: areaFromCohort(cohort, zone),
    zone,
    tier: tierFromAccommodates(accommodates),
    lifecycleStatus: l.is_active ? 'live' : 'paused',
    onboardingChecklist: LIVE_COMPLETE(),
    listingType: listingTypeFromString(l.property_type),
    bedrooms,
    bathrooms,
    maxOccupancy: accommodates,
    primaryOwnerId: 'o-guesty-unknown',
    listings: [
      // Treat the Guesty record as a single direct listing for now —
      // per-channel listings (Airbnb / Booking / friday.mu) land when
      // the channel-listings sync ships.
      {
        channel: 'friday_mu',
        externalId: l.guesty_id,
        status: l.is_active ? 'active' : 'paused',
      },
    ],
    baseRateMUR: typeof l.base_price_minor === 'number' ? l.base_price_minor : 0,
    photoIds: photoId ? [photoId] : [],
    heroPhotoId: photoId,
    tags: [],
    occupancyYTD: 0,
    occupancy90d: 0,
    adr: typeof l.availability?.min_price_minor_30d === 'number'
      ? Math.round(l.availability.min_price_minor_30d / 100)
      : 0,
    rating: 0,
    ratingCount: 0,
    lastActivityAt: l.synced_at ?? '',
  };
}

// ───────────────── Hydration ─────────────────

/** Replace PROPERTIES with the live Guesty listings, then rebuild every
 *  derived map (PROPERTY_BY_CODE, PROPERTY_OWNERS, PROPERTY_PHOTOS,
 *  TASK_/FIN_/COHORT shims) so synchronous consumers see fresh data.
 *  Bumps fixtureRev so useFixtureRev() subscribers re-render. */
export async function hydratePropertiesFromGuesty(): Promise<void> {
  const listings = await loadGuestyListings();
  const next = listings.map(guestyListingToProperty);
  PROPERTIES.length = 0;
  PROPERTIES.push(...next);
  rebuildDerivedPropertyMaps();
  bumpFixtureRev();
}

/** Hook: hydrate PROPERTIES on mount. Returns the standard
 *  { hydrated, loading, error, refetch, rev } shape — `rev` increments
 *  each successful refetch so callers can include it in dep lists. */
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

  // Stale-while-revalidate. PROPERTIES is mutated in place via the loader, so
  // a silent refetch swaps the data under the live PROPERTIES array without
  // unmounting any consumer. Skeleton only shows on the very first mount.
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

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { hydrated, loading, isRevalidating, error, refetch, rev };
}
