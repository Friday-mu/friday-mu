'use client';

// Live analytics from /api/analytics/* (FAD backend). Analytics
// Intelligence Core Phase 0 — deterministic tier-1 metrics. Phase 1
// (proactive AI agent + push digest) is gated on infrastructure work.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface PortfolioKPIs {
  revenue_minor: number;
  revenue_minor_prev: number;
  reservation_count: number;
  reservation_count_prev: number;
  /** Total occupied nights (paid + owner stays). */
  booked_nights: number;
  booked_nights_prev: number;
  /** Paying stays only — owner stays excluded. Industry-standard revenue mgmt view. */
  paid_booked_nights?: number;
  /** Subset of paid_booked_nights with pricing data — ADR denominator. */
  priced_booked_nights?: number;
  /** Subset that came from the clean Guesty money.subTotal breakdown
   *  (room revenue, no cleaning/taxes) vs the total_amount_minor fallback. */
  clean_revenue_nights?: number;
  /** Total room-nights that could have been sold (active_properties × window_days). */
  available_nights?: number;
  /** PAID occupancy — paying stays ÷ available. */
  occupancy_pct: number;
  occupancy_pct_prev: number;
  /** TOTAL occupancy including owner stays — useful for ops planning. */
  total_occupancy_pct?: number;
  total_occupancy_pct_prev?: number;
  adr_minor: number;
  adr_minor_prev: number;
  revpar_minor: number;
  active_properties: number;
  total_properties: number;
}

export interface ChannelMixRow {
  channel: string;
  reservation_count: number;
  revenue_minor: number;
  booked_nights: number;
  share_pct: number;
}

export interface TopPropertyRow {
  code: string | null;
  nickname: string | null;
  title: string | null;
  picture_url: string | null;
  reservation_count: number;
  revenue_minor: number;
  booked_nights: number;
  occupancy_pct: number;
}

export interface RevenueTrendPoint {
  day: string;
  /** Number of listings occupied on this day (correct hospitality metric). */
  occupied_count: number;
  /** Per-night pro-rated revenue summed across all stays in residence. */
  revenue_minor: number;
}

export interface TopPropertyRowExt extends TopPropertyRow {
  adr_minor?: number | null;
}

export interface PortfolioResponse {
  window: { from: string; to: string; days: number };
  currency: string;
  kpis: PortfolioKPIs;
  ops: { open_tasks: number | null; overdue_tasks: number | null };
  channel_mix: ChannelMixRow[];
  top_properties: TopPropertyRow[];
  revenue_trend: RevenueTrendPoint[];
  data_quality: {
    revenue_source: string;
    nights_method?: string;
    revenue_method?: string;
    occupancy_method?: string;
    adr_denominator?: string;
    breakdown_coverage?: string;
    unpriced_note?: string | null;
    owner_block_note?: string | null;
    /** Legacy single-field — fallback if older endpoint version returns it. */
    gap_note?: string;
  };
}

export async function loadPortfolio(windowDays = 30): Promise<PortfolioResponse> {
  return (await apiFetch(`/api/analytics/portfolio?windowDays=${windowDays}`)) as PortfolioResponse;
}

export function usePortfolio(windowDays = 30): {
  portfolio: PortfolioResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPortfolio(windowDays)
      .then(setPortfolio)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load portfolio'))
      .finally(() => setLoading(false));
  }, [windowDays]);
  useEffect(() => { refetch(); }, [refetch]);

  return { portfolio, loading, error, refetch };
}

export interface OccupancyHeatmap {
  months: string[]; // ISO month-start dates
  properties: Array<{ code: string | null; nickname: string | null; row: number[] }>;
}

export async function loadOccupancyHeatmap(months = 6): Promise<OccupancyHeatmap> {
  return (await apiFetch(`/api/analytics/occupancy-heatmap?months=${months}`)) as OccupancyHeatmap;
}

export function useOccupancyHeatmap(months = 6): {
  heatmap: OccupancyHeatmap | null;
  loading: boolean;
  error: string | null;
} {
  const [heatmap, setHeatmap] = useState<OccupancyHeatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    loadOccupancyHeatmap(months)
      .then(setHeatmap)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load heatmap'))
      .finally(() => setLoading(false));
  }, [months]);
  return { heatmap, loading, error };
}

/** Format a minor-units amount compact for KPI cards. */
export function formatKpiMinor(minor: number | null | undefined, currency: string): string {
  if (minor == null || minor === 0) return '—';
  const major = minor / 100;
  const symbol = currency === 'EUR' ? '€' : currency === 'MUR' ? 'Rs ' : currency === 'USD' ? '$' : '';
  if (Math.abs(major) >= 1_000_000) return `${symbol}${(major / 1_000_000).toFixed(1)}M`;
  if (Math.abs(major) >= 10_000) return `${symbol}${(major / 1000).toFixed(0)}k`;
  if (Math.abs(major) >= 1000) return `${symbol}${(major / 1000).toFixed(1)}k`;
  return `${symbol}${Math.round(major).toLocaleString('en-US')}`;
}

/** Compute period-over-period delta and direction. */
export function deltaPct(current: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0 && current === 0) return { pct: 0, dir: 'flat' };
  if (prev === 0) return { pct: 100, dir: 'up' };
  const diff = current - prev;
  const pct = Math.round((diff / Math.abs(prev)) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}
