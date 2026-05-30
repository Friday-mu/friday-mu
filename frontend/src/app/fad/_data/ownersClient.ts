'use client';

// Live owners from /api/owners (FAD backend → fad_owners table, seeded
// from Guesty's listing owner IDs). Phase 2 wiring per T3.12 / overnight
// plan (2026-05-24).

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface OwnerRecord {
  id: string;
  guesty_owner_id: string | null;
  display_name: string;
  legal_entity_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  payment_pref: 'bank_transfer' | 'mcb_juice' | 'cheque' | 'cash' | null;
  language: 'en' | 'fr' | 'es' | null;
  statement_day: number | null;
  commission_pct_default: number | null;
  notes: string | null;
  archived_at: string | null;
  property_count: number | null;
  has_bank_details: boolean;
  created_at: string;
  updated_at: string;
}

export interface OwnerPropertyRecord {
  property_id: string;
  code: string | null;
  nickname: string | null;
  address_full: string | null;
  picture_url: string | null;
  ownership_pct: number;
  is_primary: boolean;
}

export interface OwnersListResponse {
  results: OwnerRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function loadOwners(input: {
  search?: string;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
} = {}): Promise<OwnersListResponse> {
  const params = new URLSearchParams();
  if (input.search) params.set('search', input.search);
  if (input.archived) params.set('archived', input.archived);
  if (typeof input.limit === 'number') params.set('limit', String(input.limit));
  if (typeof input.offset === 'number') params.set('offset', String(input.offset));
  const qs = params.toString();
  return (await apiFetch(`/api/owners${qs ? `?${qs}` : ''}`)) as OwnersListResponse;
}

export async function loadOwnerById(id: string): Promise<OwnerRecord | null> {
  try {
    const res = (await apiFetch(`/api/owners/${encodeURIComponent(id)}`)) as { owner: OwnerRecord | null };
    return res.owner;
  } catch (e) {
    if ((e as Error).message?.startsWith('HTTP 404')) return null;
    throw e;
  }
}

export async function loadOwnerProperties(id: string): Promise<OwnerPropertyRecord[]> {
  const res = (await apiFetch(`/api/owners/${encodeURIComponent(id)}/properties`)) as {
    properties: OwnerPropertyRecord[];
  };
  return res.properties || [];
}

export async function createOwner(input: Partial<Pick<OwnerRecord,
  'display_name' | 'legal_entity_name' | 'contact_email' | 'contact_phone' |
  'address' | 'country' | 'payment_pref' | 'language' | 'statement_day' |
  'commission_pct_default' | 'notes'
>> & { display_name: string }): Promise<OwnerRecord> {
  const res = (await apiFetch('/api/owners', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { owner: OwnerRecord };
  return res.owner;
}

export async function patchOwner(id: string, input: Partial<Pick<OwnerRecord,
  'display_name' | 'legal_entity_name' | 'contact_email' | 'contact_phone' |
  'address' | 'country' | 'payment_pref' | 'language' | 'statement_day' |
  'commission_pct_default' | 'notes'
>>): Promise<OwnerRecord> {
  const res = (await apiFetch(`/api/owners/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as { owner: OwnerRecord };
  return res.owner;
}

export async function archiveOwner(id: string): Promise<OwnerRecord> {
  const res = (await apiFetch(`/api/owners/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: '{}',
  })) as { owner: OwnerRecord };
  return res.owner;
}

export async function unarchiveOwner(id: string): Promise<OwnerRecord> {
  const res = (await apiFetch(`/api/owners/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    body: '{}',
  })) as { owner: OwnerRecord };
  return res.owner;
}

/** SWR-style hook for the owners list. Returns [] until the fetch
 *  resolves so callers can fall back to empty/loading UI gracefully. */
export function useOwners(input: { search?: string; archived?: 'true' | 'false' | 'all' } = {}): {
  owners: OwnerRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [owners, setOwners] = useState<OwnerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryKey = JSON.stringify(input);
  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadOwners(input)
      .then((r) => { setOwners(r.results); setTotal(r.total); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load owners'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  useEffect(() => { refetch(); }, [refetch]);

  return { owners, total, loading, error, refetch };
}

/** Build a quick lookup: Guesty owner_id → fad_owners record. Useful
 *  for resolving the primary owner stored on a property to the live
 *  owner record without per-property fetches. */
export function useOwnersByGuestyId(): {
  byGuestyId: Map<string, OwnerRecord>;
  loading: boolean;
  error: string | null;
} {
  const { owners, loading, error } = useOwners();
  const byGuestyId = new Map<string, OwnerRecord>();
  for (const o of owners) {
    if (o.guesty_owner_id) byGuestyId.set(o.guesty_owner_id, o);
  }
  return { byGuestyId, loading, error };
}
