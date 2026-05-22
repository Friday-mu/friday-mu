'use client';

// Live reservations from /api/reservations (FAD backend → guesty_reservations
// cache). Adapter maps the API shape to the existing Reservation fixture
// shape so the modules don't need to change. Phase 1 wiring per the
// 2026-05-17 evening queue (item R).

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { Reservation, ReservationStatus, ReservationChannel } from './reservations';

interface RawReservation {
  id: string;
  guesty_id?: string | null;
  listing_guesty_id?: string | null;
  listing_nickname?: string | null;
  confirmation_code?: string | null;
  status?: string | null;
  source?: string | null;
  channel?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  nights?: number | null;
  guests_count?: number | null;
  party?: {
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
  };
  guest?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  total_amount_minor?: number | null;
  amount_paid?: number | null;
  outstanding_balance?: number | null;
  payment_status?: string | null;
  currency_code?: string | null;
  calendar_pricing?: {
    nights_cached?: number | null;
    blocked_nights?: number | null;
    total_minor?: number | null;
    min_price_minor?: number | null;
    max_price_minor?: number | null;
    currency_code?: string | null;
    synced_at?: string | null;
  };
  synced_at?: string | null;
}

function compactIdentityPart(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function semanticStayIdentity(r: RawReservation): string {
  const listing = compactIdentityPart(r.listing_nickname || r.listing_guesty_id);
  const checkIn = compactIdentityPart(r.check_in_date?.slice(0, 10));
  const checkOut = compactIdentityPart(r.check_out_date?.slice(0, 10));
  const guest = compactIdentityPart(
    r.guest?.email
      || [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(' ')
      || r.guest?.phone,
  );
  if (!listing || !checkIn || !checkOut || !guest) return '';
  return `stay:${listing}:${checkIn}:${checkOut}:${guest}`;
}

function reservationIdentity(r: RawReservation): string {
  const semantic = semanticStayIdentity(r);
  if (semantic) return semantic;
  const confirmation = compactIdentityPart(r.confirmation_code);
  if (confirmation) return `confirmation:${confirmation}`;
  return r.guesty_id || r.id;
}

function reservationCompletenessScore(r: RawReservation): number {
  return [
    r.listing_nickname,
    r.listing_guesty_id,
    r.check_in_date,
    r.check_out_date,
    r.guest?.email,
    r.guest?.phone,
    r.total_amount_minor,
    r.calendar_pricing?.total_minor,
  ].filter((v) => v != null && v !== '').length;
}

function dedupeRawReservations(rows: RawReservation[]): RawReservation[] {
  const order: string[] = [];
  const byKey = new Map<string, RawReservation>();
  rows.forEach((row) => {
    const key = reservationIdentity(row);
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, row);
      return;
    }
    const current = byKey.get(key);
    if (!current) return;
    const currentScore = reservationCompletenessScore(current);
    const nextScore = reservationCompletenessScore(row);
    const currentSynced = new Date(current.synced_at || '').getTime() || 0;
    const nextSynced = new Date(row.synced_at || '').getTime() || 0;
    if (nextScore > currentScore || (nextScore === currentScore && nextSynced > currentSynced)) {
      byKey.set(key, row);
    }
  });
  return order.map((key) => byKey.get(key)).filter((row): row is RawReservation => Boolean(row));
}

function mapStatus(s?: string | null): ReservationStatus {
  const v = String(s ?? '').toLowerCase();
  if (v === 'confirmed' || v === 'reserved') return 'confirmed';
  if (v === 'checked_in' || v === 'inquiry') return 'checked_in';
  if (v === 'checked_out') return 'checked_out';
  if (v === 'canceled' || v === 'cancelled') return 'cancelled';
  if (v === 'hold' || v === 'tentative') return 'hold';
  return 'confirmed';
}

function mapChannel(c?: string | null, source?: string | null): ReservationChannel {
  const v = String(c ?? source ?? '').toLowerCase();
  if (v.includes('airbnb')) return 'airbnb';
  if (v.includes('booking') || v === 'bookingcom' || v === 'bdc') return 'booking';
  if (v.includes('vrbo')) return 'vrbo';
  if (v.includes('direct')) return 'direct';
  if (v.includes('owner')) return 'owner';
  if (v.includes('email')) return 'email';
  return 'direct';
}

export function transformReservation(r: RawReservation): Reservation {
  const guestName = [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(' ').trim()
    || (r.guest?.email ? r.guest.email.split('@')[0] : 'Guest');
  const total = r.total_amount_minor != null ? r.total_amount_minor / 100 : 0;
  const balanceDue = typeof r.outstanding_balance === 'number' && Number.isFinite(r.outstanding_balance)
    ? r.outstanding_balance
    : 0;
  const calendarTotal = r.calendar_pricing?.total_minor != null ? r.calendar_pricing.total_minor / 100 : undefined;
  const nightsCached = r.calendar_pricing?.nights_cached ?? 0;
  const adults = r.party?.adults ?? 0;
  const children = r.party?.children ?? 0;
  const infants = r.party?.infants ?? 0;
  return {
    id: r.id,
    confirmationCode: r.confirmation_code || r.guesty_id?.slice(-8).toUpperCase() || r.id.slice(0, 8).toUpperCase(),
    propertyCode: r.listing_nickname || r.listing_guesty_id || '—',
    guestName,
    checkIn: r.check_in_date || '',
    checkOut: r.check_out_date || '',
    nights: r.nights ?? 0,
    numberOfNights: r.nights ?? 0,
    status: mapStatus(r.status),
    channel: mapChannel(r.channel, r.source),
    partySize: {
      adults,
      children,
      infants,
    },
    guests: {
      adults,
      children,
      infants,
      total: r.guests_count ?? adults + children + infants,
    },
    guestEmail: r.guest?.email || undefined,
    guestPhone: r.guest?.phone || undefined,
    totalAmount: total,
    calendarPricing: {
      nightsCached,
      blockedNights: r.calendar_pricing?.blocked_nights ?? 0,
      totalAmount: calendarTotal,
      nightlyAverage: calendarTotal != null && nightsCached > 0 ? Math.round(calendarTotal / nightsCached) : undefined,
      minNightly: r.calendar_pricing?.min_price_minor != null ? r.calendar_pricing.min_price_minor / 100 : undefined,
      maxNightly: r.calendar_pricing?.max_price_minor != null ? r.calendar_pricing.max_price_minor / 100 : undefined,
      currency: (r.calendar_pricing?.currency_code || r.currency_code || 'EUR') as Reservation['currency'],
      syncedAt: r.calendar_pricing?.synced_at || undefined,
    },
    touristTax: 0,
    balanceDue,
    payoutStatus: balanceDue > 0 ? 'pending' : 'captured',
    currency: r.currency_code || 'EUR',
    // Optional / fixture-only fields — set defaults so the existing UI
    // doesn't blow up when they're missing on live rows.
    specialRequests: { categories: [], notes: '' },
    notes: '',
    cleaningArrangement: undefined,
  } as Reservation;
}

export async function loadReservations(): Promise<Reservation[]> {
  // Backend returns { reservations: [...] } (see backend/src/reservations/index.js
  // shapeReservation). Earlier wiring read `data.results` and silently fell back
  // to the empty array. Consumers now stay live-only by default instead of
  // falling back to the RESERVATIONS fixture.
  const data = await apiFetch('/api/reservations?limit=500') as { reservations?: RawReservation[] };
  return dedupeRawReservations(data?.reservations || []).map(transformReservation);
}

export interface UseLiveReservationsResult {
  reservations: Reservation[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiveReservations(): UseLiveReservationsResult {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadReservations()
      .then(setReservations)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reservations'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { refetch(); }, [refetch]);
  return { reservations, loading, error, refetch };
}

export interface ScheduleReservation {
  id: string;
  guestyId: string;
  listingGuestyId: string;
  listingNickname: string;
  propertyCode: string;
  confirmationCode: string;
  status: string;
  channel: string;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
}

export interface FetchScheduleReservationsInput {
  from: string;
  to: string;
  limit?: number;
}

const PROPERTY_CODE_RE = /^([A-Z]{1,5}(?:-[A-Z0-9]{1,5}){0,3})(?=\b|\s|$)/;

function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function propertyCodeFromReservation(reservation: RawReservation): string {
  const nickname = (reservation.listing_nickname || '').trim();
  const match = nickname.match(PROPERTY_CODE_RE);
  if (match) return match[1];
  return nickname || reservation.listing_guesty_id || 'No property';
}

function scheduleGuestName(reservation: RawReservation): string {
  const first = reservation.guest?.first_name?.trim();
  const last = reservation.guest?.last_name?.trim();
  return [first, last].filter(Boolean).join(' ') || 'Guest';
}

function transformScheduleReservation(reservation: RawReservation): ScheduleReservation {
  const guestyId = reservation.guesty_id || reservation.id;
  return {
    id: reservation.id,
    guestyId,
    listingGuestyId: reservation.listing_guesty_id || '',
    listingNickname: reservation.listing_nickname || reservation.listing_guesty_id || 'No listing',
    propertyCode: propertyCodeFromReservation(reservation),
    confirmationCode: reservation.confirmation_code || guestyId,
    status: reservation.status || 'unknown',
    channel: reservation.channel || reservation.source || 'reservation',
    checkInDate: dateOnly(reservation.check_in_date),
    checkOutDate: dateOnly(reservation.check_out_date),
    guestName: scheduleGuestName(reservation),
  };
}

export async function fetchScheduleReservations(input: FetchScheduleReservationsInput): Promise<ScheduleReservation[]> {
  const qs = new URLSearchParams();
  qs.set('from', input.from);
  qs.set('to', input.to);
  qs.set('date_mode', 'overlap');
  qs.set('limit', String(input.limit || 500));

  const data = await apiFetch(`/api/reservations?${qs.toString()}`) as { reservations?: RawReservation[] };
  return dedupeRawReservations(data?.reservations || [])
    .map(transformScheduleReservation)
    .filter((reservation) => reservation.checkInDate && reservation.checkOutDate);
}
