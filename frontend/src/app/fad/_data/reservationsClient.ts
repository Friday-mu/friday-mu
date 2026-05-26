'use client';

// Live reservations from /api/reservations (FAD backend → guesty_reservations
// cache). Adapter maps the API shape to the existing Reservation fixture
// shape so the modules don't need to change. Phase 1 wiring per the
// 2026-05-17 evening queue (item R).

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type {
  Reservation,
  ReservationStatus,
  ReservationChannel,
  CleaningArrangement,
  SpecialRequestCategory,
} from './reservations';

interface RawReservation {
  id: string;
  overlay_id?: string | null;
  guesty_id?: string | null;
  listing_guesty_id?: string | null;
  listing_nickname?: string | null;
  property_id?: string | null;
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
  // FAD-native overlay fields (mig 078 + extended /api/reservations route)
  cleaning_arrangement?: string | null;
  special_requests?: {
    categories?: string[] | null;
    notes?: string | null;
  };
  internal_notes?: string | null;
  access_info_sent_at?: string | null;
  driver_assignee_user_id?: string | null;
  review_requested_at?: string | null;
  actual_arrival?: string | null;
  actual_departure?: string | null;
  refund?: {
    amount_minor?: number | null;
    currency?: string | null;
    reason?: string | null;
  } | null;
  extension_of_reservation_id?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  source_kind?: string | null;
  calendar_pricing?: {
    nights_cached?: number | null;
    blocked_nights?: number | null;
    total_minor?: number | null;
    min_price_minor?: number | null;
    max_price_minor?: number | null;
    currency_code?: string | null;
    synced_at?: string | null;
  };
  // Guesty money breakdown (mig 085 + financials.js extraction). All
  // major-unit numbers; null when Guesty doesn't expose that path. Used
  // by FolioTab + AccountingTab to derive accurate per-reservation
  // numbers instead of channel-fee heuristics.
  money_breakdown?: {
    sub_total?: number | null;
    room_revenue?: number | null;
    cleaning_fee?: number | null;
    taxes?: number | null;
    host_payout?: number | null;
    host_service_fee?: number | null;
  };
  synced_at?: string | null;
}

const KNOWN_SPECIAL_REQUEST_CATEGORIES: ReadonlyArray<SpecialRequestCategory> =
  ['crib', 'high_chair', 'late_checkout', 'dietary', 'mobility', 'transport', 'other'];

function coerceSpecialRequestCategories(raw: string[] | null | undefined): SpecialRequestCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is SpecialRequestCategory =>
    (KNOWN_SPECIAL_REQUEST_CATEGORIES as ReadonlyArray<string>).includes(v));
}

function coerceCleaningArrangement(raw: string | null | undefined): CleaningArrangement | undefined {
  if (raw === 'friday_cleans' || raw === 'owner_cleans') return raw;
  return undefined;
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
  const v = String(s ?? '').trim().toLowerCase();
  // 2026-05-26: a null Guesty status is not enough evidence to render a
  // confirmed stay. Treat it as inquiry/unconfirmed so it is hidden by
  // default and visible only with the inquiries toggle.
  if (!v) return 'inquiry';
  if (v === 'confirmed' || v === 'reserved' || v === 'booked') return 'confirmed';
  if (v === 'checked_in') return 'checked_in';
  if (v === 'checked_out') return 'checked_out';
  if (v === 'canceled' || v === 'cancelled') return 'cancelled';
  // 2026-05-25 (Li Da bug): Guesty inquiry-flow placeholders carry
  // status='expired' or 'closed' or 'denied' / 'voided' when the
  // operator opts out / lets the auto-quote expire. These were
  // falling through to 'confirmed' and stacking on the multi-cal
  // grid (10 placeholder rows for one inquirer, overlapping across
  // 8 properties). Map them all to 'cancelled' so the existing
  // calendar filter (r.status === 'cancelled' → hide) suppresses
  // them. They stay in the DB for audit / Reservations list "all"
  // tabs where useful.
  if (v === 'expired' || v === 'closed' || v === 'denied' || v === 'voided') return 'cancelled';
  if (v === 'hold' || v === 'tentative' || v === 'pending' || v === 'awaiting_payment') return 'hold';
  if (v === 'inquiry' || v === 'pending_quote' || v === 'request' || v === 'requested' || v === 'quote' || v === 'preapproved' || v === 'pre_approved' || v === 'unconfirmed') return 'inquiry';
  return 'inquiry';
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
    // touristTax from the Guesty money.totalTaxes path (mig 085). For
    // Mauritius this is the MRA tourist tax that's pass-through to the
    // gov't — staff can override via custom folio lines if Guesty's
    // tax bucket lumps in something else.
    touristTax: r.money_breakdown?.taxes != null && Number.isFinite(r.money_breakdown.taxes)
      ? Math.round(r.money_breakdown.taxes)
      : 0,
    moneyBreakdown: {
      subTotal: r.money_breakdown?.sub_total ?? undefined,
      roomRevenue: r.money_breakdown?.room_revenue ?? undefined,
      cleaningFee: r.money_breakdown?.cleaning_fee ?? undefined,
      taxes: r.money_breakdown?.taxes ?? undefined,
      hostPayout: r.money_breakdown?.host_payout ?? undefined,
      hostServiceFee: r.money_breakdown?.host_service_fee ?? undefined,
    },
    balanceDue,
    payoutStatus: balanceDue > 0 ? 'pending' : 'captured',
    currency: (r.currency_code || 'EUR') as Reservation['currency'],
    // FAD-native overlay fields (mig 078). Populated from the merged
    // backend response; falls back to the previous defaults when overlay
    // is absent so existing UI keeps rendering.
    specialRequests: {
      categories: coerceSpecialRequestCategories(r.special_requests?.categories),
      notes: r.special_requests?.notes || '',
    },
    notes: r.internal_notes || '',
    cleaningArrangement: coerceCleaningArrangement(r.cleaning_arrangement),
    accessInfoSentAt: r.access_info_sent_at || undefined,
    driverAssigneeId: r.driver_assignee_user_id || undefined,
    reviewRequestedAt: r.review_requested_at || undefined,
    actualArrival: r.actual_arrival || undefined,
    actualDeparture: r.actual_departure || undefined,
    refundAmount: r.refund?.amount_minor != null ? r.refund.amount_minor / 100 : undefined,
    extensionOf: r.extension_of_reservation_id || undefined,
  } as Reservation;
}

export interface LoadReservationsInput {
  from?: string;
  to?: string;
  dateMode?: 'check_in' | 'overlap';
  upcoming?: boolean;
  limit?: number;
}

function reservationsQuery(input: LoadReservationsInput = {}): string {
  const qs = new URLSearchParams();
  qs.set('limit', String(input.limit || 500));
  if (input.from) qs.set('from', input.from);
  if (input.to) qs.set('to', input.to);
  if (input.dateMode === 'overlap') qs.set('date_mode', 'overlap');
  if (input.upcoming) qs.set('upcoming', 'true');
  return qs.toString();
}

export async function loadReservations(input: LoadReservationsInput = {}): Promise<Reservation[]> {
  // Backend returns { reservations: [...] } (see backend/src/reservations/index.js
  // shapeReservation). Earlier wiring read `data.results` and silently fell back
  // to the empty array. Consumers now stay live-only by default instead of
  // falling back to the RESERVATIONS fixture.
  const data = await apiFetch(`/api/reservations?${reservationsQuery(input)}`) as { reservations?: RawReservation[] };
  return dedupeRawReservations(data?.reservations || [])
    .map(transformReservation)
    .filter((reservation) => reservation.checkIn && reservation.checkOut);
}

export interface UseLiveReservationsResult {
  reservations: Reservation[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiveReservations(input: LoadReservationsInput = {}): UseLiveReservationsResult {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = reservationsQuery(input);
  // Stale-while-revalidate. We no longer blank the list on refetch — the
  // operator keeps seeing the previous result-set while the new one loads.
  // Filter-change refetches behave the same: old data on screen briefly,
  // then new data swaps in silently.
  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadReservations(input)
      .then(setReservations)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reservations'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  useEffect(() => { refetch(); }, [refetch]);
  return { reservations, loading, isRevalidating, error, refetch };
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
  calendarPricing?: {
    nightsCached: number;
    blockedNights: number;
    totalMinor: number | null;
    minPriceMinor: number | null;
    maxPriceMinor: number | null;
    currencyCode: string | null;
    syncedAt: string | null;
  };
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
    status: mapStatus(reservation.status),
    channel: reservation.channel || reservation.source || 'reservation',
    checkInDate: dateOnly(reservation.check_in_date),
    checkOutDate: dateOnly(reservation.check_out_date),
    guestName: scheduleGuestName(reservation),
    calendarPricing: reservation.calendar_pricing ? {
      nightsCached: Number(reservation.calendar_pricing.nights_cached || 0),
      blockedNights: Number(reservation.calendar_pricing.blocked_nights || 0),
      totalMinor: reservation.calendar_pricing.total_minor == null ? null : Number(reservation.calendar_pricing.total_minor),
      minPriceMinor: reservation.calendar_pricing.min_price_minor == null ? null : Number(reservation.calendar_pricing.min_price_minor),
      maxPriceMinor: reservation.calendar_pricing.max_price_minor == null ? null : Number(reservation.calendar_pricing.max_price_minor),
      currencyCode: reservation.calendar_pricing.currency_code || null,
      syncedAt: reservation.calendar_pricing.synced_at || null,
    } : undefined,
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

// ───────────────── Write helpers ─────────────────

export interface CreateReservationInput {
  step?: 'draft' | 'confirm';
  status?: ReservationStatus;
  channel?: ReservationChannel;
  sourceKind?: 'manual' | 'bdc_extension' | 'inquiry_conversion';
  confirmationCode?: string;
  propertyId?: string;
  cleaningArrangement?: CleaningArrangement;
  specialRequests?: { categories: SpecialRequestCategory[]; notes: string };
  internalNotes?: string;
  driverAssigneeUserId?: string;
  actualArrival?: string;
  actualDeparture?: string;
  extensionOfReservationId?: string;
}

export async function createReservation(input: CreateReservationInput): Promise<RawReservation> {
  return await apiFetch('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as RawReservation;
}

export async function cancelReservation(idOrGuestyId: string, reason?: string): Promise<{ ok: true; reservation: RawReservation }> {
  return await apiFetch(`/api/reservations/${encodeURIComponent(idOrGuestyId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  }) as { ok: true; reservation: RawReservation };
}

export interface PatchReservationInput {
  cleaningArrangement?: CleaningArrangement | null;
  specialRequests?: { categories?: SpecialRequestCategory[]; notes?: string };
  internalNotes?: string;
  driverAssigneeUserId?: string | null;
  accessInfoSentAt?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
  reviewRequestedAt?: string | null;
  status?: ReservationStatus;
  propertyId?: string | null;
}

export async function patchReservation(idOrGuestyId: string, patch: PatchReservationInput): Promise<RawReservation> {
  return await apiFetch(`/api/reservations/${encodeURIComponent(idOrGuestyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }) as RawReservation;
}

// ───────────────── Activity log ─────────────────

export interface ReservationActivityRecord {
  id: string;
  kind: string;
  actor_id: string | null;
  detail: string;
  metadata: Record<string, unknown>;
  ts: string;
}

export async function loadReservationActivity(idOrGuestyId: string, limit = 100): Promise<ReservationActivityRecord[]> {
  const res = await apiFetch(`/api/reservations/${encodeURIComponent(idOrGuestyId)}/activity?limit=${limit}`) as { activity?: ReservationActivityRecord[] };
  return res.activity || [];
}

// ───────────────── Inquiries (Mathias quote workflow per v0.2 §9) ─────────────────

export interface InquiryRecord {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  source: 'email' | 'whatsapp' | 'website' | 'phone' | 'referral';
  property_codes: string[];
  check_in: string | null;
  check_out: string | null;
  party_adults: number;
  party_children: number;
  party_infants: number;
  status: 'pending_quote' | 'quote_sent' | 'guest_reviewing' | 'converted' | 'abandoned';
  quote_link: string | null;
  quote_amount_minor: number | null;
  currency: string;
  converted_to_reservation_id: string | null;
  abandon_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadInquiries(status?: string): Promise<InquiryRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch(`/api/reservations/inquiries${qs}`) as { inquiries?: InquiryRecord[] };
  return res.inquiries || [];
}

export interface CreateInquiryInput {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  source?: InquiryRecord['source'];
  propertyCodes?: string[];
  checkIn?: string;
  checkOut?: string;
  partySize?: { adults?: number; children?: number; infants?: number };
  status?: InquiryRecord['status'];
  quoteLink?: string;
  quoteAmount?: number;
  currency?: string;
  notes?: string;
}

export async function createInquiry(input: CreateInquiryInput): Promise<InquiryRecord> {
  return await apiFetch('/api/reservations/inquiries', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as InquiryRecord;
}

export async function patchInquiry(id: string, patch: Partial<{
  status: InquiryRecord['status'];
  quoteLink: string;
  quoteAmount: number;
  notes: string;
  abandonReason: string;
}>): Promise<InquiryRecord> {
  return await apiFetch(`/api/reservations/inquiries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }) as InquiryRecord;
}

export async function convertInquiry(id: string): Promise<{ ok: true; reservationId: string; inquiry: InquiryRecord }> {
  return await apiFetch(`/api/reservations/inquiries/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
    body: JSON.stringify({}),
  }) as { ok: true; reservationId: string; inquiry: InquiryRecord };
}

// ───────────────── Channel-aware resolution URLs ─────────────────
//
// Replaces the hardcoded Airbnb URL in ReservationDetail (PROD-CONFIG-8).
// Each channel has its own host-side dashboard URL; we deep-link to the
// reservation list and let the operator pick (per-reservation deep-link
// is Phase 3 once we capture channel-side IDs).

export function resolutionCenterUrl(channel: ReservationChannel): string | null {
  switch (channel) {
    case 'airbnb':
      return 'https://www.airbnb.com/hosting/reservations';
    case 'booking':
      return 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reservations.html';
    case 'vrbo':
      return 'https://www.vrbo.com/dashboard/reservations';
    case 'direct':
    case 'email':
    case 'owner':
      return null; // Direct channels handled in-FAD; no external dashboard
  }
}

export function resolutionCenterLabel(channel: ReservationChannel): string {
  switch (channel) {
    case 'airbnb':
      return 'Open Airbnb resolution center';
    case 'booking':
      return 'Open Booking.com extranet';
    case 'vrbo':
      return 'Open VRBO dashboard';
    case 'direct':
    case 'email':
    case 'owner':
      return 'No external channel';
  }
}

// ───────────────── Folio lines (T3.10 — mig 089) ─────────────────
//
// Custom guest-facing or internal line items overlaid on the
// Guesty-derived breakdown. Amounts in minor units (cents/centimes).

export type FolioLineKindApi =
  | 'accommodation'
  | 'cleaning_fee'
  | 'tourist_tax'
  | 'extra'
  | 'discount'
  | 'channel_fee'
  | 'manual_adjustment';

export interface FolioLineRecord {
  id: string;
  reservation_id: string;
  kind: FolioLineKindApi;
  label: string;
  amount_minor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  guest_facing: boolean;
  notes: string | null;
  added_by_user_id: string | null;
  added_at: string;
  updated_at: string;
}

export interface AddFolioLineInput {
  kind: FolioLineKindApi;
  label: string;
  amountMinor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  guestFacing?: boolean;
  notes?: string;
}

export interface UpdateFolioLineInput {
  label?: string;
  amountMinor?: number;
  notes?: string | null;
  guestFacing?: boolean;
}

export async function loadFolioLines(reservationIdOrGuestyId: string): Promise<FolioLineRecord[]> {
  const res = await apiFetch(`/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/folio`) as { lines?: FolioLineRecord[] };
  return res.lines || [];
}

export async function addFolioLineApi(
  reservationIdOrGuestyId: string,
  input: AddFolioLineInput,
): Promise<FolioLineRecord> {
  return await apiFetch(`/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/folio`, {
    method: 'POST',
    body: JSON.stringify({
      kind: input.kind,
      label: input.label,
      amount_minor: input.amountMinor,
      currency: input.currency,
      guest_facing: input.guestFacing !== false,
      notes: input.notes || null,
    }),
  }) as FolioLineRecord;
}

export async function updateFolioLineApi(
  reservationIdOrGuestyId: string,
  lineId: string,
  patch: UpdateFolioLineInput,
): Promise<FolioLineRecord> {
  const body: Record<string, unknown> = {};
  if (patch.label !== undefined) body.label = patch.label;
  if (patch.amountMinor !== undefined) body.amount_minor = patch.amountMinor;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.guestFacing !== undefined) body.guest_facing = patch.guestFacing;
  return await apiFetch(
    `/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/folio/${encodeURIComponent(lineId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  ) as FolioLineRecord;
}

export async function deleteFolioLineApi(
  reservationIdOrGuestyId: string,
  lineId: string,
): Promise<void> {
  await apiFetch(
    `/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/folio/${encodeURIComponent(lineId)}`,
    { method: 'DELETE' },
  );
}

// ───────────────── Payments (T3.10 — mig 089) ─────────────────

export type PaymentMethodApi =
  | 'channel_payout'
  | 'bank_transfer'
  | 'card'
  | 'cash'
  | 'manual_adjustment';

export type PaymentStatusApi = 'pending' | 'received' | 'refunded';

export interface PaymentRecord {
  id: string;
  reservation_id: string;
  ts: string;
  amount_minor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  method: PaymentMethodApi;
  status: PaymentStatusApi;
  reference: string | null;
  notes: string | null;
  source: 'manual' | 'guesty' | 'channel';
  external_id: string | null;
  recorded_by_user_id: string | null;
  created_at: string;
}

export interface RecordPaymentInput {
  amountMinor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  method: PaymentMethodApi;
  status?: PaymentStatusApi;
  reference?: string;
  notes?: string;
  ts?: string;
}

export async function loadPayments(reservationIdOrGuestyId: string): Promise<PaymentRecord[]> {
  const res = await apiFetch(`/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/payments`) as { payments?: PaymentRecord[] };
  return res.payments || [];
}

export async function recordPaymentApi(
  reservationIdOrGuestyId: string,
  input: RecordPaymentInput,
): Promise<PaymentRecord> {
  return await apiFetch(`/api/reservations/${encodeURIComponent(reservationIdOrGuestyId)}/payments`, {
    method: 'POST',
    body: JSON.stringify({
      amount_minor: input.amountMinor,
      currency: input.currency,
      method: input.method,
      status: input.status || 'received',
      reference: input.reference || null,
      notes: input.notes || null,
      ts: input.ts,
    }),
  }) as PaymentRecord;
}
