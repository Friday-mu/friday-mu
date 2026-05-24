'use client';

// Live finance data from /api/finance/* (FAD backend). Phase 3 (T1.11)
// kicks off with /property/:code/summary; remaining finance routes wire
// in subsequent phases.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface PropertySummary {
  property_code: string;
  revenue_minor: number;
  channel_fees_minor: number;
  expenses_minor: number;
  expense_count: number;
  net_to_owner_minor: number;
  friday_margin_minor: number;
  reservation_count: number;
  booked_nights: number;
  window_nights: number;
  occupancy_pct: number;
  adr_minor: number | null;
  revpar_minor: number | null;
  currency: string;
  window_from: string;
  window_to: string;
  data_quality: {
    revenue_source: string;
    expenses_source: string;
    channel_fees_source: string;
  };
}

export async function loadPropertySummary(code: string, windowDays = 90): Promise<PropertySummary> {
  return (await apiFetch(
    `/api/finance/property/${encodeURIComponent(code)}/summary?windowDays=${windowDays}`,
  )) as PropertySummary;
}

export function usePropertySummary(code: string | undefined, windowDays = 90): {
  summary: PropertySummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [summary, setSummary] = useState<PropertySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!code) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    loadPropertySummary(code, windowDays)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load summary'))
      .finally(() => setLoading(false));
  }, [code, windowDays]);
  useEffect(() => { refetch(); }, [refetch]);

  return { summary, loading, error, refetch };
}

/** Format a minor-units amount as a short display string. Currency-aware
 *  shorthand: 'EUR' → €, 'MUR' → Rs, others → ISO code. */
export function formatMinor(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null) return '—';
  const major = minor / 100;
  const sign = major < 0 ? '-' : '';
  const abs = Math.abs(major);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs.toFixed(2);
  const prefix = currency === 'EUR' ? '€'
    : currency === 'MUR' ? 'Rs '
    : currency === 'USD' ? '$'
    : `${currency || ''} `;
  return `${sign}${prefix}${formatted}`;
}
