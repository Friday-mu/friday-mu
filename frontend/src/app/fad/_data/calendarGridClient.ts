'use client';

// Live per-cell calendar pricing from /api/calendar/grid. Powers the
// Multi-calendar v0.2 €PRICE chips. v0.5 additions: block-dates +
// reload-after-mutation hook.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { BlockReason, CellPrice } from '../_components/modules/calendar/MultiCalendarGrid';

interface GridResponse {
  window: { from: string; to: string };
  properties: Array<{
    listing_guesty_id: string;
    prices_by_date: Record<string, CellPrice>;
  }>;
  cell_count: number;
  block_count?: number;
}

export async function loadCalendarGrid(from: string, to: string): Promise<GridResponse> {
  const qs = new URLSearchParams({ from, to });
  return (await apiFetch(`/api/calendar/grid?${qs.toString()}`)) as GridResponse;
}

export function useCalendarGrid(from: string | undefined, to: string | undefined): {
  pricesByListing: Map<string, Record<string, CellPrice>>;
  loading: boolean;
  error: string | null;
  /** Manually refetch (e.g. after a block/unblock mutation). */
  refetch: () => void;
} {
  const [pricesByListing, setPricesByListing] = useState<Map<string, Record<string, CellPrice>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!from || !to) {
      setPricesByListing(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    loadCalendarGrid(from, to)
      .then((res) => {
        const map = new Map<string, Record<string, CellPrice>>();
        for (const p of res.properties) map.set(p.listing_guesty_id, p.prices_by_date);
        setPricesByListing(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load calendar grid'))
      .finally(() => setLoading(false));
  }, [from, to, rev]);

  const refetch = useCallback(() => setRev((r) => r + 1), []);
  return { pricesByListing, loading, error, refetch };
}

// ───────────────── Block / unblock dates (Calendar v0.5) ─────────────────

export interface BlockDatesInput {
  listingGuestyId: string;
  dates: string[]; // YYYY-MM-DD
  reason?: BlockReason;
  notes?: string;
}

export async function blockDates(input: BlockDatesInput): Promise<{ ok: true; blocked_count: number }> {
  return (await apiFetch('/api/calendar/block', {
    method: 'POST',
    body: JSON.stringify({
      listing_guesty_id: input.listingGuestyId,
      dates: input.dates,
      reason: input.reason || null,
      notes: input.notes || null,
    }),
  })) as { ok: true; blocked_count: number };
}

export async function unblockDates(listingGuestyId: string, dates: string[]): Promise<{ ok: true; unblocked_count: number }> {
  return (await apiFetch('/api/calendar/block', {
    method: 'DELETE',
    body: JSON.stringify({
      listing_guesty_id: listingGuestyId,
      dates,
    }),
  })) as { ok: true; unblocked_count: number };
}
