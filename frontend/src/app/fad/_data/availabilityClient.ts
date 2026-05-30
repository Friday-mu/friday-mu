'use client';

// Live availability + quote endpoints. Phases 6 + 7 of the 2026-05-24
// overnight autonomous run.

import { apiFetch } from '../../../components/types';

export interface AvailabilityMatch {
  property_code: string;
  guesty_id: string | null;
  nickname: string | null;
  title: string | null;
  picture_url: string | null;
  accommodates: number | null;
  bedrooms: number | null;
  region: string | null;
  address_full: string | null;
  available_nights: number;
  total_nights: number;
  nightly_avg_minor: number;
  total_minor: number;
  currency_code: string;
  cached_nights: number;
  reason?: string;
}

export interface AvailabilityResponse {
  from: string;
  to: string;
  guests: number;
  total_nights: number;
  matches: AvailabilityMatch[];
  partial: AvailabilityMatch[];
  unavailable: AvailabilityMatch[];
  summary: { match_count: number; partial_count: number; unavailable_count: number };
}

export async function searchAvailability(input: {
  from: string;
  to: string;
  guests?: number;
}): Promise<AvailabilityResponse> {
  const params = new URLSearchParams();
  params.set('from', input.from);
  params.set('to', input.to);
  params.set('guests', String(input.guests ?? 1));
  return (await apiFetch(`/api/availability/search?${params.toString()}`)) as AvailabilityResponse;
}

export interface QuoteRecord {
  id: string;
  property_codes: string[];
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children: number;
  share_url: string;
  expires_at: string | null;
  status: 'draft' | 'sent' | 'opened' | 'converted' | 'expired';
  opened_at: string | null;
  converted_reservation_id: string | null;
  created_by_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function createQuote(input: {
  property_codes: string[];
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children?: number;
  expires_in_days?: number;
  metadata?: Record<string, unknown>;
}): Promise<QuoteRecord> {
  const res = (await apiFetch('/api/quotes', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { quote: QuoteRecord };
  return res.quote;
}

export async function loadQuotes(limit = 50): Promise<QuoteRecord[]> {
  const res = (await apiFetch(`/api/quotes?limit=${limit}`)) as { quotes: QuoteRecord[] };
  return res.quotes || [];
}
