'use client';

// Live per-cell calendar pricing from /api/calendar/grid. Powers the
// Multi-calendar v0.2 €PRICE chips.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { CellPrice } from '../_components/modules/calendar/MultiCalendarGrid';

interface GridResponse {
  window: { from: string; to: string };
  properties: Array<{
    listing_guesty_id: string;
    prices_by_date: Record<string, CellPrice>;
  }>;
  cell_count: number;
}

export async function loadCalendarGrid(from: string, to: string): Promise<GridResponse> {
  const qs = new URLSearchParams({ from, to });
  return (await apiFetch(`/api/calendar/grid?${qs.toString()}`)) as GridResponse;
}

export function useCalendarGrid(from: string | undefined, to: string | undefined): {
  pricesByListing: Map<string, Record<string, CellPrice>>;
  loading: boolean;
  error: string | null;
} {
  const [pricesByListing, setPricesByListing] = useState<Map<string, Record<string, CellPrice>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [from, to]);

  return { pricesByListing, loading, error };
}
