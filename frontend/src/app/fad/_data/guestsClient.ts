'use client';

// Live guests from /api/guests (FAD backend → fad_guests table, backfilled
// from guesty_reservations). Phase 1 wiring per T3.11 / overnight plan
// Phase 1 (2026-05-24).

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface GuestRecord {
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  language_pref: 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | null;
  country: string | null;
  vip_tier: 'none' | 'silver' | 'gold' | 'vip';
  notes: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  total_stays_count: number;
  total_revenue_minor: number;
  created_at: string;
  updated_at: string;
}

export interface GuestReservationRecord {
  guesty_id: string | null;
  confirmation_code: string | null;
  listing_guesty_id: string | null;
  listing_nickname: string | null;
  status: string | null;
  channel: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests_count: number | null;
  total_amount_minor: number | null;
  currency_code: string | null;
  synced_at: string | null;
}

export interface LoadGuestsInput {
  search?: string;
  vipTier?: GuestRecord['vip_tier'];
  limit?: number;
  offset?: number;
}

export interface GuestsListResponse {
  results: GuestRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function loadGuests(input: LoadGuestsInput = {}): Promise<GuestsListResponse> {
  const params = new URLSearchParams();
  if (input.search) params.set('search', input.search);
  if (input.vipTier) params.set('vip_tier', input.vipTier);
  if (typeof input.limit === 'number') params.set('limit', String(input.limit));
  if (typeof input.offset === 'number') params.set('offset', String(input.offset));
  const qs = params.toString();
  return (await apiFetch(`/api/guests${qs ? `?${qs}` : ''}`)) as GuestsListResponse;
}

export async function loadGuestById(id: string): Promise<GuestRecord | null> {
  try {
    const res = (await apiFetch(`/api/guests/${encodeURIComponent(id)}`)) as { guest: GuestRecord | null };
    return res.guest;
  } catch (e) {
    if ((e as Error).message?.startsWith('HTTP 404')) return null;
    throw e;
  }
}

export async function loadGuestReservations(id: string): Promise<GuestReservationRecord[]> {
  const res = (await apiFetch(`/api/guests/${encodeURIComponent(id)}/reservations`)) as {
    reservations: GuestReservationRecord[];
  };
  return res.reservations || [];
}

/** Lookup by email, phone, or name — used by ReservationDetail to resolve
 *  the reservation's guest to its centralised fad_guests record. Returns
 *  null if no match. Name is the lowest-priority key (OTA bookings often
 *  have redacted emails/phones; name is the only stable handle). */
export async function lookupGuest(input: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}): Promise<GuestRecord | null> {
  if (!input.email && !input.phone && !input.name) return null;
  try {
    const res = (await apiFetch('/api/guests/lookup', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email || undefined,
        phone: input.phone || undefined,
        name: input.name || undefined,
      }),
    })) as { guest: GuestRecord | null };
    return res.guest;
  } catch {
    return null;
  }
}

export async function createGuest(input: {
  display_name: string;
  primary_email?: string;
  primary_phone?: string;
  first_name?: string;
  last_name?: string;
  language_pref?: GuestRecord['language_pref'];
  country?: string;
  vip_tier?: GuestRecord['vip_tier'];
  notes?: string;
}): Promise<GuestRecord> {
  const res = (await apiFetch('/api/guests', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { guest: GuestRecord };
  return res.guest;
}

export async function patchGuest(id: string, input: Partial<{
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  language_pref: GuestRecord['language_pref'];
  country: string | null;
  vip_tier: GuestRecord['vip_tier'];
  notes: string | null;
}>): Promise<GuestRecord> {
  const res = (await apiFetch(`/api/guests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as { guest: GuestRecord };
  return res.guest;
}

/** Lookup hook for the ReservationDetail Guests tab. Returns the
 *  resolved guest + their prior stays. `null` while loading; an empty
 *  object once we've checked and found no match. */
export function useGuestLookup(input: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  enabled?: boolean;
}): {
  guest: GuestRecord | null;
  reservations: GuestReservationRecord[];
  loading: boolean;
  notFound: boolean;
  error: string | null;
  refetch: () => void;
} {
  const enabled = input.enabled !== false && !!(input.email || input.phone || input.name);
  const [guest, setGuest] = useState<GuestRecord | null>(null);
  const [reservations, setReservations] = useState<GuestReservationRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = input.email ?? null;
  const phone = input.phone ?? null;
  const name = input.name ?? null;

  const refetch = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      setGuest(null);
      setReservations([]);
      setNotFound(false);
      return;
    }
    setLoading(true);
    setError(null);
    lookupGuest({ email, phone, name })
      .then(async (g) => {
        if (!g) {
          setGuest(null);
          setReservations([]);
          setNotFound(true);
          return;
        }
        setGuest(g);
        setNotFound(false);
        try {
          const r = await loadGuestReservations(g.id);
          setReservations(r);
        } catch {
          setReservations([]);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'lookup failed'))
      .finally(() => setLoading(false));
  }, [email, phone, name, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  return { guest, reservations, loading, notFound, error, refetch };
}

/** Format the lifetime revenue as a display string (best-effort currency
 *  detection from synced reservations). */
export function formatLifetimeRevenue(guest: GuestRecord): string {
  const major = (guest.total_revenue_minor || 0) / 100;
  if (!major) return '€0';
  return `€${major.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
