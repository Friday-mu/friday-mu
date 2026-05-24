// @demo:data — Bookings — GET /api/reservations
// Tag: PROD-DATA-6 — see frontend/DEMO_CRUFT.md

/**
 * Canonical Reservations data. Consumed by Reservations module (primary key),
 * Tasks (`Task.reservationId`), Inbox (`InboxThread.reservationId`), Calendar,
 * and Reviews. Phase 1 fixtures; Phase 2 wires real Guesty pull.
 */

import { liveOnlyMode } from './demoMode';

export type ReservationStatus =
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'hold'
  | 'inquiry';

/** Reservations channel taxonomy — `owner` denotes an owner-stay block;
 *  distinct from Reviews taxonomy because owner stays don't generate reviews. */
export type ReservationChannel = 'airbnb' | 'booking' | 'direct' | 'vrbo' | 'email' | 'owner';

export type PayoutStatus = 'pending' | 'captured' | 'settled' | 'refunded';

/** Owner stay only. Drives task-template selection (see decisions log §7
 *  Operations redesign — wired when that lands). Phase 1: surfaces as a chip. */
export type CleaningArrangement = 'friday_cleans' | 'owner_cleans';

export type SpecialRequestCategory =
  | 'crib'
  | 'high_chair'
  | 'late_checkout'
  | 'dietary'
  | 'mobility'
  | 'transport'
  | 'other';

export interface SpecialRequests {
  categories: SpecialRequestCategory[];
  notes: string;
}

export interface Reservation {
  id: string;
  /** OTA-style 8-char identifier shown to staff and guest. Unique per tenant. */
  confirmationCode: string;
  propertyCode: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  /** ISO datetime — local Mauritius time */
  checkIn: string;
  /** ISO datetime — local Mauritius time */
  checkOut: string;
  nights: number;
  channel: ReservationChannel;
  partySize: { adults: number; children: number; infants?: number };
  status: ReservationStatus;
  /** Total booking amount, gross. */
  totalAmount: number;
  /** Guesty calendar cache for this stay window, when FAD has synced nightly availability/pricing. */
  calendarPricing?: {
    nightsCached: number;
    blockedNights: number;
    totalAmount?: number;
    nightlyAverage?: number;
    minNightly?: number;
    maxNightly?: number;
    currency?: 'MUR' | 'EUR' | 'USD';
    syncedAt?: string;
  };
  currency: 'MUR' | 'EUR' | 'USD';
  /** Tourist tax owed to MRA — included in totalAmount. */
  touristTax: number;
  payoutStatus: PayoutStatus;
  /** Outstanding balance owed by guest, same currency. 0 = paid in full. */
  balanceDue: number;
  /** Owner-stay only — null/undefined for guest stays. */
  cleaningArrangement?: CleaningArrangement;
  /** Hybrid schema: enum categories + freeform notes (per scoping pack §12). */
  specialRequests?: SpecialRequests;
  /** ISO datetime guest actually arrived (if recorded). */
  actualArrival?: string;
  actualDeparture?: string;
  /** Operational urgent-strip flags. */
  accessInfoSentAt?: string;
  driverAssigneeId?: string;
  reviewRequestedAt?: string;
  /** Refund issued (e.g. for service issue), gross. */
  refundAmount?: number;
  notes?: string;
  /** Reservation creation source (manual / guesty_pull / extension). Audit-only. */
  createdAt?: string;
  /** "Extension of [linked reservation]" — source reservation ID for BDC extensions per scoping pack §8. */
  extensionOf?: string;
  /**
   * Guesty money breakdown (from mig 085 + financials.js inference). All
   * values in major units, same currency as `currency`. Populated only when
   * sourced from the live API — fixture rows leave it undefined and the
   * tabs fall back to channel-fee heuristics.
   */
  moneyBreakdown?: {
    subTotal?: number;
    roomRevenue?: number;
    cleaningFee?: number;
    taxes?: number;
    hostPayout?: number;
    hostServiceFee?: number;
  };
}

export const RESERVATIONS: Reservation[] = [
  // ───── Referenced by tasks ─────
  {
    id: 'rsv-rc15-thomas',
    confirmationCode: 'HMTHK4P9R8',
    propertyCode: 'RC-15',
    guestName: 'Thomas Kanarski',
    checkIn: '2026-04-27T14:00:00',
    checkOut: '2026-05-04T11:00:00',
    nights: 7,
    channel: 'airbnb',
    partySize: { adults: 2, children: 2 },
    status: 'confirmed',
    totalAmount: 3290,
    currency: 'EUR',
    touristTax: 126,
    payoutStatus: 'captured',
    balanceDue: 0,
    specialRequests: { categories: ['transport', 'other'], notes: 'Returning guest · welcome basket with chocolates · driver pickup booked' },
    driverAssigneeId: 'u-bryan',
    notes: 'Returning guest · welcome basket requested · driver booked',
    createdAt: '2026-03-12T14:22:00',
  },
  {
    id: 'rsv-gbh-c8-out',
    confirmationCode: 'BDC-8842117',
    propertyCode: 'GBH-C8',
    guestName: 'Hannah Becker',
    checkIn: '2026-04-22T14:00:00',
    checkOut: '2026-04-27T11:00:00',
    nights: 5,
    channel: 'booking',
    partySize: { adults: 2, children: 0 },
    status: 'checked_in',
    totalAmount: 1925,
    currency: 'EUR',
    touristTax: 90,
    payoutStatus: 'captured',
    balanceDue: 0,
    actualArrival: '2026-04-22T15:18:00',
    accessInfoSentAt: '2026-04-22T09:00:00',
    notes: 'Departure today · turnover before 13:00 incoming guest',
    createdAt: '2026-03-30T11:05:00',
  },
  {
    id: 'rsv-pt3-out-apr30',
    confirmationCode: 'FR-DIR-1043',
    propertyCode: 'PT-3',
    guestName: 'Lucas Moreau',
    checkIn: '2026-04-24T14:00:00',
    checkOut: '2026-04-30T11:00:00',
    nights: 6,
    channel: 'direct',
    partySize: { adults: 2, children: 2 },
    status: 'checked_in',
    totalAmount: 2520,
    currency: 'EUR',
    touristTax: 108,
    payoutStatus: 'captured',
    balanceDue: 0,
    actualArrival: '2026-04-24T13:42:00',
    specialRequests: { categories: ['high_chair', 'crib'], notes: 'Two young kids, 18mo + 4yo' },
    accessInfoSentAt: '2026-04-23T18:00:00',
    createdAt: '2026-04-02T16:30:00',
  },
  {
    id: 'rsv-ks5-in-may2',
    confirmationCode: 'BDC-9015320',
    propertyCode: 'KS-5',
    guestName: 'Wei Chen',
    checkIn: '2026-05-02T14:00:00',
    checkOut: '2026-05-07T11:00:00',
    nights: 5,
    channel: 'booking',
    partySize: { adults: 2, children: 0 },
    status: 'confirmed',
    totalAmount: 1475,
    currency: 'EUR',
    touristTax: 90,
    payoutStatus: 'pending',
    balanceDue: 1475,
    notes: 'Property empty 4 days prior · pre-arrival inspection scheduled',
    createdAt: '2026-04-15T10:14:00',
  },

  // ───── Linked from Inbox guest threads ─────
  {
    id: 'rsv-vaz-marchand',
    confirmationCode: 'HMVAZM7K3X',
    propertyCode: 'VAZ',
    guestName: 'Thibault Marchand',
    checkIn: '2026-04-30T15:20:00',
    checkOut: '2026-05-07T11:00:00',
    nights: 7,
    channel: 'airbnb',
    partySize: { adults: 2, children: 2 },
    status: 'confirmed',
    totalAmount: 2940,
    currency: 'EUR',
    touristTax: 126,
    payoutStatus: 'captured',
    balanceDue: 0,
    specialRequests: { categories: ['late_checkout', 'transport'], notes: 'Early check-in 14:30 · MK 47 from Paris · driver Ravi confirmed' },
    driverAssigneeId: 'u-bryan',
    notes: 'MK 47 from Paris · early check-in 14:30 approved · driver Ravi',
    createdAt: '2026-02-14T09:30:00',
  },
  {
    id: 'rsv-bbh-linde',
    confirmationCode: 'FR-DIR-1041',
    propertyCode: 'BBH',
    guestName: 'Sophia Linde',
    checkIn: '2026-04-25T14:00:00',
    checkOut: '2026-05-02T11:00:00',
    nights: 7,
    channel: 'direct',
    partySize: { adults: 2, children: 0 },
    status: 'checked_in',
    totalAmount: 3570,
    currency: 'EUR',
    touristTax: 126,
    payoutStatus: 'captured',
    balanceDue: 0,
    actualArrival: '2026-04-25T15:00:00',
    specialRequests: { categories: ['dietary', 'other'], notes: 'No shellfish · Chef Aarav booked Saturday evening for 6' },
    accessInfoSentAt: '2026-04-24T16:00:00',
    notes: 'Chef booked Saturday · dietary: no shellfish',
    createdAt: '2026-03-08T20:15:00',
  },
  {
    id: 'rsv-sbn-okonkwo',
    confirmationCode: 'BDC-8801203',
    propertyCode: 'SBN',
    guestName: 'James Okonkwo',
    checkIn: '2026-04-23T14:00:00',
    checkOut: '2026-04-25T11:00:00',
    nights: 2,
    channel: 'booking',
    partySize: { adults: 4, children: 0 },
    status: 'checked_out',
    totalAmount: 770,
    currency: 'EUR',
    touristTax: 36,
    payoutStatus: 'settled',
    balanceDue: 0,
    actualArrival: '2026-04-23T14:35:00',
    actualDeparture: '2026-04-25T10:50:00',
    reviewRequestedAt: '2026-04-25T13:00:00',
    createdAt: '2026-04-04T08:50:00',
  },
  {
    id: 'rsv-vaz-beaumont',
    confirmationCode: 'FR-MAN-1051',
    propertyCode: 'VAZ',
    guestName: 'Marianne Beaumont',
    checkIn: '2026-04-28T14:00:00',
    checkOut: '2026-05-02T11:00:00',
    nights: 4,
    channel: 'email',
    partySize: { adults: 2, children: 2 },
    status: 'confirmed',
    totalAmount: 1680,
    currency: 'EUR',
    touristTax: 72,
    payoutStatus: 'pending',
    balanceDue: 840,
    specialRequests: { categories: ['other'], notes: 'Pre-arrival groceries via Plein Sud · €85 prepaid · receipt requested' },
    notes: 'Pre-arrival groceries via Plein Sud · receipt requested for reimbursement',
    createdAt: '2026-04-12T17:30:00',
  },
  {
    id: 'rsv-cor-solheim',
    confirmationCode: 'FR-DIR-1037',
    propertyCode: 'COR',
    guestName: 'Henrik Solheim',
    checkIn: '2026-04-24T14:00:00',
    checkOut: '2026-04-29T11:00:00',
    nights: 5,
    channel: 'direct',
    partySize: { adults: 2, children: 2 },
    status: 'checked_in',
    totalAmount: 1300,
    currency: 'EUR',
    touristTax: 90,
    payoutStatus: 'captured',
    balanceDue: 0,
    actualArrival: '2026-04-24T13:55:00',
    specialRequests: { categories: ['crib'], notes: 'Crib for second bedroom · two kids (1yr + 4yr)' },
    accessInfoSentAt: '2026-04-23T19:30:00',
    notes: 'AC complaint open · master bedroom unit',
    createdAt: '2026-03-21T11:10:00',
  },
  {
    id: 'rsv-sbn-sato-cancelled',
    confirmationCode: 'HMSATO9P2K',
    propertyCode: 'SBN',
    guestName: 'Yuki Sato',
    checkIn: '2026-06-14T14:00:00',
    checkOut: '2026-06-21T11:00:00',
    nights: 7,
    channel: 'airbnb',
    partySize: { adults: 2, children: 0 },
    status: 'cancelled',
    totalAmount: 2695,
    currency: 'EUR',
    touristTax: 126,
    payoutStatus: 'refunded',
    balanceDue: 0,
    refundAmount: 2695,
    notes: 'Cancelled · family emergency · refund per Airbnb moderate policy',
    createdAt: '2026-02-28T09:20:00',
  },

  // ───── Phase 1 fixture additions for Reservations module demo ─────
  {
    id: 'rsv-vaz-owner-may',
    confirmationCode: 'OWNER-VAZ-1',
    propertyCode: 'VAZ',
    guestName: 'Owner — Marie Lambert',
    checkIn: '2026-05-09T15:00:00',
    checkOut: '2026-05-12T11:00:00',
    nights: 3,
    channel: 'owner',
    partySize: { adults: 2, children: 0 },
    status: 'confirmed',
    totalAmount: 0,
    currency: 'EUR',
    touristTax: 0,
    payoutStatus: 'captured',
    balanceDue: 0,
    cleaningArrangement: 'friday_cleans',
    notes: 'Owner stay · Friday cleans (Rs 2,000 cleaning fee billable to owner)',
    createdAt: '2026-04-20T10:00:00',
  },
  {
    id: 'rsv-bbh-fischer-may',
    confirmationCode: 'HMFISCH4Q9',
    propertyCode: 'BBH',
    guestName: 'Anna Fischer',
    checkIn: '2026-05-04T14:00:00',
    checkOut: '2026-05-11T11:00:00',
    nights: 7,
    channel: 'airbnb',
    partySize: { adults: 4, children: 0 },
    status: 'confirmed',
    totalAmount: 4830,
    currency: 'EUR',
    touristTax: 126,
    payoutStatus: 'pending',
    balanceDue: 0,
    specialRequests: { categories: ['transport'], notes: 'Late arrival · MK 49 lands 22:15 · airport pickup booked' },
    createdAt: '2026-04-08T15:42:00',
  },
  {
    id: 'rsv-rc15-bdc-extension',
    confirmationCode: 'FR-DIR-1056',
    propertyCode: 'RC-15',
    guestName: 'Thomas Kanarski',
    checkIn: '2026-05-04T11:00:00',
    checkOut: '2026-05-06T11:00:00',
    nights: 2,
    channel: 'direct',
    partySize: { adults: 2, children: 2 },
    status: 'confirmed',
    totalAmount: 720,
    currency: 'EUR',
    touristTax: 36,
    payoutStatus: 'pending',
    balanceDue: 720,
    extensionOf: 'rsv-rc15-thomas',
    notes: 'Extension of HMTHK4P9R8 · BDC original guest extending direct · no cleaning fee',
    createdAt: '2026-04-25T16:14:00',
  },
  {
    id: 'rsv-pt3-walters-may',
    confirmationCode: 'BDC-9112847',
    propertyCode: 'PT-3',
    guestName: 'Catherine Walters',
    checkIn: '2026-05-15T14:00:00',
    checkOut: '2026-05-22T11:00:00',
    nights: 7,
    channel: 'booking',
    partySize: { adults: 2, children: 1, infants: 1 },
    status: 'confirmed',
    totalAmount: 2660,
    currency: 'EUR',
    touristTax: 90,
    payoutStatus: 'pending',
    balanceDue: 1330,
    specialRequests: { categories: ['crib', 'high_chair'], notes: '6mo infant + 3yo · crib + high chair · no nuts (severe allergy)' },
    notes: 'Balance due 7 days before check-in · allergy flag noted',
    createdAt: '2026-04-18T12:08:00',
  },
  {
    id: 'rsv-cor-owner-jun',
    confirmationCode: 'OWNER-COR-3',
    propertyCode: 'COR',
    guestName: 'Owner — David Patel',
    checkIn: '2026-06-02T15:00:00',
    checkOut: '2026-06-05T11:00:00',
    nights: 3,
    channel: 'owner',
    partySize: { adults: 2, children: 1 },
    status: 'confirmed',
    totalAmount: 0,
    currency: 'EUR',
    touristTax: 0,
    payoutStatus: 'captured',
    balanceDue: 0,
    cleaningArrangement: 'owner_cleans',
    notes: 'Owner stay · owner cleans · post-stay verification inspect required',
    createdAt: '2026-04-22T08:30:00',
  },
];

if (liveOnlyMode()) {
  RESERVATIONS.length = 0;
}

export const RESERVATION_BY_ID: Record<string, Reservation> = Object.fromEntries(
  RESERVATIONS.map((r) => [r.id, r]),
);

/** Internal note attached to a reservation. Only visible to the team —
 *  guests never see these. Mirrors the InternalNote shape used by Inbox.
 *  Append-only via `breezeway.ts:addReservationNote`. */
export interface ReservationNote {
  id: string;
  reservationId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** TaskUser ids @mentioned in the note. */
  mentions: string[];
  createdAt: string;
}

export const RESERVATION_NOTES: ReservationNote[] = [
  {
    id: 'rnote-001',
    reservationId: 'rsv-rc15-thomas',
    authorId: 'u-franny',
    authorName: 'Franny Henri',
    body: 'Welcome basket needs the chocolates Alex flagged — handed off to Catherine for tomorrow morning.',
    mentions: ['u-catherine'],
    createdAt: '2026-04-26T09:14:00',
  },
  {
    id: 'rnote-002',
    reservationId: 'rsv-cor-solheim',
    authorId: 'u-bryan',
    authorName: 'Bryan Henri',
    body: 'AC parts ETA 14:00 from Coolbreeze. Will swap during their pool break.',
    mentions: [],
    createdAt: '2026-04-26T08:30:00',
  },
];

export function notesForReservation(reservationId: string): ReservationNote[] {
  return RESERVATION_NOTES.filter((n) => n.reservationId === reservationId).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

export const CHANNEL_LABEL: Record<ReservationChannel, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  direct: 'Direct',
  vrbo: 'VRBO',
  email: 'Email',
  owner: 'Owner',
};

export const SPECIAL_REQUEST_LABEL: Record<SpecialRequestCategory, string> = {
  crib: 'Crib',
  high_chair: 'High chair',
  late_checkout: 'Late checkout',
  dietary: 'Dietary',
  mobility: 'Mobility',
  transport: 'Transport',
  other: 'Other',
};

export const CLEANING_ARRANGEMENT_LABEL: Record<CleaningArrangement, string> = {
  friday_cleans: 'Friday cleans',
  owner_cleans: 'Owner cleans',
};

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  hold: 'Hold',
  inquiry: 'Inquiry',
};

export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  pending: 'Pending',
  captured: 'Captured',
  settled: 'Settled',
  refunded: 'Refunded',
};

const CURRENCY_SYMBOL: Record<Reservation['currency'], string> = {
  EUR: '€',
  MUR: 'Rs',
  USD: '$',
};

export function formatMoney(amount: number, currency: Reservation['currency']): string {
  const sym = CURRENCY_SYMBOL[currency];
  const formatted = amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${sym} ${formatted}`;
}

/** Format a reservation's check-in/out window for display, e.g. "Apr 27, 14:00 → May 4, 11:00 · 7 nts". */
export function formatStayWindow(r: Reservation): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${month} ${day}, ${time}`;
  };
  return `${fmt(r.checkIn)} → ${fmt(r.checkOut)} · ${r.nights} nt${r.nights === 1 ? '' : 's'}`;
}

/* ───── Activity log (audit trail per reservation) ───── */

export type ReservationActivityKind =
  | 'created'
  | 'status_changed'
  | 'planned_arrival_updated'
  | 'planned_departure_updated'
  | 'money_updated'
  | 'note_added'
  | 'access_info_sent'
  | 'driver_assigned'
  | 'review_requested'
  | 'cancelled'
  | 'special_request_added';

export interface ReservationActivity {
  id: string;
  reservationId: string;
  ts: string;
  kind: ReservationActivityKind;
  /** Brief human-readable description shown verbatim in the Activity Log tab. */
  detail: string;
  /** TaskUser id when an action was performed by a teammate; absent for system events. */
  actorId?: string;
}

export const RESERVATION_ACTIVITY: ReservationActivity[] = [
  // rsv-rc15-thomas
  { id: 'rsva-001', reservationId: 'rsv-rc15-thomas', ts: '2026-03-12T14:22:00', kind: 'created', detail: 'Reservation created from Airbnb webhook', actorId: 'system' },
  { id: 'rsva-002', reservationId: 'rsv-rc15-thomas', ts: '2026-04-23T18:00:00', kind: 'special_request_added', detail: 'Welcome basket + chocolates flagged by Alex', actorId: 'u-alex' },
  { id: 'rsva-003', reservationId: 'rsv-rc15-thomas', ts: '2026-04-26T09:14:00', kind: 'note_added', detail: 'Note from Franny @Catherine — chocolates handoff', actorId: 'u-franny' },
  { id: 'rsva-004', reservationId: 'rsv-rc15-thomas', ts: '2026-04-26T11:00:00', kind: 'driver_assigned', detail: 'Bryan assigned for arrival pickup', actorId: 'u-franny' },

  // rsv-gbh-c8-out
  { id: 'rsva-010', reservationId: 'rsv-gbh-c8-out', ts: '2026-03-30T11:05:00', kind: 'created', detail: 'Reservation created from Booking.com webhook', actorId: 'system' },
  { id: 'rsva-011', reservationId: 'rsv-gbh-c8-out', ts: '2026-04-22T09:00:00', kind: 'access_info_sent', detail: 'Access codes + welcome message sent to guest', actorId: 'system' },
  { id: 'rsva-012', reservationId: 'rsv-gbh-c8-out', ts: '2026-04-22T15:18:00', kind: 'status_changed', detail: 'confirmed → checked_in (actual arrival 15:18)', actorId: 'system' },

  // rsv-pt3-out-apr30
  { id: 'rsva-020', reservationId: 'rsv-pt3-out-apr30', ts: '2026-04-02T16:30:00', kind: 'created', detail: 'Reservation created via direct booking flow', actorId: 'u-mathias' },
  { id: 'rsva-021', reservationId: 'rsv-pt3-out-apr30', ts: '2026-04-02T16:35:00', kind: 'special_request_added', detail: 'High chair + crib for two young kids (18mo + 4yo)', actorId: 'u-mathias' },
  { id: 'rsva-022', reservationId: 'rsv-pt3-out-apr30', ts: '2026-04-23T18:00:00', kind: 'access_info_sent', detail: 'Access codes + welcome message sent', actorId: 'system' },
  { id: 'rsva-023', reservationId: 'rsv-pt3-out-apr30', ts: '2026-04-24T13:42:00', kind: 'status_changed', detail: 'confirmed → checked_in (actual arrival 13:42)', actorId: 'system' },

  // rsv-vaz-marchand
  { id: 'rsva-030', reservationId: 'rsv-vaz-marchand', ts: '2026-02-14T09:30:00', kind: 'created', detail: 'Reservation created from Airbnb webhook', actorId: 'system' },
  { id: 'rsva-031', reservationId: 'rsv-vaz-marchand', ts: '2026-04-20T08:14:00', kind: 'planned_arrival_updated', detail: 'Early check-in 14:30 approved', actorId: 'u-franny' },
  { id: 'rsva-032', reservationId: 'rsv-vaz-marchand', ts: '2026-04-26T17:12:00', kind: 'driver_assigned', detail: 'Ravi confirmed for MK 47 pickup', actorId: 'u-bryan' },

  // rsv-bbh-linde
  { id: 'rsva-040', reservationId: 'rsv-bbh-linde', ts: '2026-03-08T20:15:00', kind: 'created', detail: 'Reservation created via direct booking', actorId: 'u-mathias' },
  { id: 'rsva-041', reservationId: 'rsv-bbh-linde', ts: '2026-04-23T11:00:00', kind: 'special_request_added', detail: 'Chef Aarav booked Saturday · no shellfish', actorId: 'u-mathias' },
  { id: 'rsva-042', reservationId: 'rsv-bbh-linde', ts: '2026-04-25T15:00:00', kind: 'status_changed', detail: 'confirmed → checked_in', actorId: 'system' },

  // rsv-sbn-okonkwo (closed cycle)
  { id: 'rsva-050', reservationId: 'rsv-sbn-okonkwo', ts: '2026-04-04T08:50:00', kind: 'created', detail: 'Reservation created from Booking.com webhook', actorId: 'system' },
  { id: 'rsva-051', reservationId: 'rsv-sbn-okonkwo', ts: '2026-04-23T14:35:00', kind: 'status_changed', detail: 'confirmed → checked_in', actorId: 'system' },
  { id: 'rsva-052', reservationId: 'rsv-sbn-okonkwo', ts: '2026-04-25T10:50:00', kind: 'status_changed', detail: 'checked_in → checked_out', actorId: 'system' },
  { id: 'rsva-053', reservationId: 'rsv-sbn-okonkwo', ts: '2026-04-25T13:00:00', kind: 'review_requested', detail: 'Review request triggered (post-checkout, T+2h)', actorId: 'system' },
  { id: 'rsva-054', reservationId: 'rsv-sbn-okonkwo', ts: '2026-04-27T08:15:00', kind: 'money_updated', detail: 'Owner payout settled · €603.90', actorId: 'system' },

  // rsv-vaz-beaumont
  { id: 'rsva-060', reservationId: 'rsv-vaz-beaumont', ts: '2026-04-12T17:30:00', kind: 'created', detail: 'Reservation created via Email channel (manual)', actorId: 'u-mary' },
  { id: 'rsva-061', reservationId: 'rsv-vaz-beaumont', ts: '2026-04-15T10:00:00', kind: 'money_updated', detail: 'Deposit recorded · €840 received', actorId: 'u-mary' },

  // rsv-cor-solheim
  { id: 'rsva-070', reservationId: 'rsv-cor-solheim', ts: '2026-03-21T11:10:00', kind: 'created', detail: 'Reservation created via direct booking', actorId: 'u-mathias' },
  { id: 'rsva-071', reservationId: 'rsv-cor-solheim', ts: '2026-04-23T19:30:00', kind: 'access_info_sent', detail: 'Access codes sent (T-19h before check-in)', actorId: 'system' },
  { id: 'rsva-072', reservationId: 'rsv-cor-solheim', ts: '2026-04-24T13:55:00', kind: 'status_changed', detail: 'confirmed → checked_in', actorId: 'system' },
  { id: 'rsva-073', reservationId: 'rsv-cor-solheim', ts: '2026-04-26T22:30:00', kind: 'note_added', detail: 'Bryan: AC parts ETA 14:00 from Coolbreeze', actorId: 'u-bryan' },

  // rsv-sbn-sato-cancelled
  { id: 'rsva-080', reservationId: 'rsv-sbn-sato-cancelled', ts: '2026-02-28T09:20:00', kind: 'created', detail: 'Reservation created from Airbnb webhook', actorId: 'system' },
  { id: 'rsva-081', reservationId: 'rsv-sbn-sato-cancelled', ts: '2026-03-15T14:00:00', kind: 'cancelled', detail: 'Cancelled by guest · family emergency · Airbnb moderate policy', actorId: 'system' },
  { id: 'rsva-082', reservationId: 'rsv-sbn-sato-cancelled', ts: '2026-03-15T14:15:00', kind: 'money_updated', detail: 'Refund issued · €2,695 · Airbnb resolution', actorId: 'system' },

  // rsv-vaz-owner-may
  { id: 'rsva-090', reservationId: 'rsv-vaz-owner-may', ts: '2026-04-20T10:00:00', kind: 'created', detail: 'Owner stay block created (Marie Lambert · Friday cleans)', actorId: 'u-franny' },

  // rsv-rc15-bdc-extension
  { id: 'rsva-100', reservationId: 'rsv-rc15-bdc-extension', ts: '2026-04-25T16:14:00', kind: 'created', detail: 'Direct extension of HMTHK4P9R8 · cleaning fee waived per BDC extension policy', actorId: 'u-mathias' },
];

export function activityForReservation(reservationId: string): ReservationActivity[] {
  return RESERVATION_ACTIVITY.filter((a) => a.reservationId === reservationId).sort(
    (a, b) => b.ts.localeCompare(a.ts),
  );
}

// Removed 2026-05-24: the legacy Inquiry / InquiryStatus / INQUIRIES /
// INQUIRY_STATUS_LABEL exports were unused. The Mathias quote-builder
// workflow per v0.2 §9 is now backed by /api/reservations/inquiries
// (mig 078) with typed wrappers in `reservationsClient.ts`
// (`InquiryRecord`, `loadInquiries`, `createInquiry`, `patchInquiry`,
// `convertInquiry`). The current `InquiriesPage` reads
// `useWebsiteInquiryThreads()` from `websiteInboxClient.ts` — a
// separate concept (website-side inbox inquiries vs Mathias's quote
// records). Both shapes coexist; the unused legacy fixture was dead.

/* ───── Guest profiles (Phase 1: per-guest-name lookup; Phase 2 normalises into Guests module) ───── */

export interface GuestProfile {
  email?: string;
  phone?: string;
  language: 'EN' | 'FR' | 'PT' | 'IT' | 'NL';
  /** Primary channel we know this guest from. */
  primaryChannel: ReservationChannel;
  airbnbVerified?: boolean;
  bookingVerified?: boolean;
  /** Direct-comms marketing consent (GDPR-style). */
  marketingConsent: boolean;
  notes?: string;
}

/** Keyed by guest display name. Phase 1 simplification — Phase 2 uses a stable guest ID. */
export const GUEST_PROFILES: Record<string, GuestProfile> = {
  'Thomas Kanarski': {
    email: 'thomas.kanarski@kanarski.io',
    phone: '+49 30 123456',
    language: 'EN',
    primaryChannel: 'airbnb',
    airbnbVerified: true,
    marketingConsent: true,
    notes: 'Returning guest · second stay · prefers RC-15 cluster',
  },
  'Hannah Becker': {
    email: 'h.becker@example.de',
    phone: '+49 89 7766554',
    language: 'EN',
    primaryChannel: 'booking',
    bookingVerified: true,
    marketingConsent: false,
  },
  'Lucas Moreau': {
    email: 'lucas.moreau@gmail.com',
    phone: '+33 6 12 34 56 78',
    language: 'FR',
    primaryChannel: 'direct',
    marketingConsent: true,
    notes: 'Family with two young kids · prefers French comms',
  },
  'Wei Chen': {
    email: 'wei.chen@booking-internal',
    language: 'EN',
    primaryChannel: 'booking',
    bookingVerified: true,
    marketingConsent: false,
  },
  'Thibault Marchand': {
    email: 'thibault.marchand@protonmail.com',
    phone: '+33 6 87 65 43 21',
    language: 'FR',
    primaryChannel: 'airbnb',
    airbnbVerified: true,
    marketingConsent: true,
    notes: 'Repeat guest · always books VAZ · driver service preferred',
  },
  'Sophia Linde': {
    email: 'sophia@lindefamily.se',
    phone: '+46 70 555 0199',
    language: 'EN',
    primaryChannel: 'direct',
    marketingConsent: true,
    notes: 'Direct booker · chef service often added · no shellfish',
  },
  'James Okonkwo': {
    email: 'james.o@booking-internal',
    language: 'EN',
    primaryChannel: 'booking',
    bookingVerified: true,
    marketingConsent: false,
  },
  'Marianne Beaumont': {
    email: 'marianne.beaumont@cabinet-bp.fr',
    phone: '+33 1 45 67 89 12',
    language: 'FR',
    primaryChannel: 'email',
    marketingConsent: true,
    notes: 'Email-channel inquiry · receipt + invoice always required',
  },
  'Henrik Solheim': {
    email: 'henrik@solheim.no',
    phone: '+47 900 12 345',
    language: 'EN',
    primaryChannel: 'direct',
    marketingConsent: true,
  },
  'Yuki Sato': {
    email: 'yuki.sato@example.jp',
    language: 'EN',
    primaryChannel: 'airbnb',
    airbnbVerified: true,
    marketingConsent: false,
    notes: 'Cancelled stay · family emergency · refund issued per moderate policy',
  },
  'Owner — Marie Lambert': {
    email: 'marie.lambert@vaz-owner',
    phone: '+230 5912 3456',
    language: 'FR',
    primaryChannel: 'owner',
    marketingConsent: false,
    notes: 'Owner of VAZ · uses property 2-3 times per year',
  },
  'Anna Fischer': {
    email: 'anna.fischer@gmx.de',
    phone: '+49 171 9988776',
    language: 'EN',
    primaryChannel: 'airbnb',
    airbnbVerified: true,
    marketingConsent: false,
    notes: 'Late arrival · transport pickup booked',
  },
  'Catherine Walters': {
    email: 'cwalters@example.co.uk',
    phone: '+44 7700 901234',
    language: 'EN',
    primaryChannel: 'booking',
    bookingVerified: true,
    marketingConsent: false,
    notes: 'Severe nut allergy · documented in special requests',
  },
  'Owner — David Patel': {
    email: 'david.patel@cor-owner',
    phone: '+230 5923 4567',
    language: 'EN',
    primaryChannel: 'owner',
    marketingConsent: false,
    notes: 'Owner of COR · cleans own stays',
  },
};

export function priorReservationsForGuest(guestName: string, currentReservationId: string): Reservation[] {
  return RESERVATIONS
    .filter((r) => r.guestName === guestName && r.id !== currentReservationId)
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
}

/* ───── Payment records ───── */

export type PaymentMethod = 'channel_payout' | 'bank_transfer' | 'card' | 'cash' | 'manual_adjustment';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  channel_payout: 'Channel payout',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  manual_adjustment: 'Manual adjustment',
};

export interface ReservationPayment {
  id: string;
  reservationId: string;
  ts: string;
  amount: number;
  currency: 'MUR' | 'EUR' | 'USD';
  method: PaymentMethod;
  status: 'pending' | 'received' | 'refunded';
  reference?: string;
  notes?: string;
}

export const RESERVATION_PAYMENTS: ReservationPayment[] = [
  // rsv-rc15-thomas — captured Airbnb payout
  {
    id: 'pay-001',
    reservationId: 'rsv-rc15-thomas',
    ts: '2026-04-25T03:00:00',
    amount: 3290,
    currency: 'EUR',
    method: 'channel_payout',
    status: 'received',
    reference: 'AB-PAYOUT-HMTHK4P9R8',
  },
  // rsv-gbh-c8-out — Booking payout
  {
    id: 'pay-002',
    reservationId: 'rsv-gbh-c8-out',
    ts: '2026-04-20T08:00:00',
    amount: 1925,
    currency: 'EUR',
    method: 'channel_payout',
    status: 'received',
    reference: 'BDC-PAYOUT-8842117',
  },
  // rsv-vaz-marchand — Airbnb captured
  {
    id: 'pay-003',
    reservationId: 'rsv-vaz-marchand',
    ts: '2026-04-28T03:00:00',
    amount: 2940,
    currency: 'EUR',
    method: 'channel_payout',
    status: 'received',
    reference: 'AB-PAYOUT-HMVAZM7K3X',
  },
  // rsv-bbh-linde — direct deposit + final
  {
    id: 'pay-004',
    reservationId: 'rsv-bbh-linde',
    ts: '2026-03-12T10:00:00',
    amount: 1500,
    currency: 'EUR',
    method: 'bank_transfer',
    status: 'received',
    reference: 'TRF-LINDE-DEP',
    notes: '50% deposit on booking',
  },
  {
    id: 'pay-005',
    reservationId: 'rsv-bbh-linde',
    ts: '2026-04-22T09:00:00',
    amount: 2070,
    currency: 'EUR',
    method: 'bank_transfer',
    status: 'received',
    reference: 'TRF-LINDE-FINAL',
    notes: 'Final balance pre-arrival',
  },
  // rsv-vaz-beaumont — partial deposit, balance due
  {
    id: 'pay-006',
    reservationId: 'rsv-vaz-beaumont',
    ts: '2026-04-15T10:00:00',
    amount: 840,
    currency: 'EUR',
    method: 'bank_transfer',
    status: 'received',
    reference: 'TRF-BEAUMONT-50',
    notes: '50% deposit · balance due 7 days before check-in',
  },
  // rsv-pt3-walters-may — partial deposit, balance due
  {
    id: 'pay-007',
    reservationId: 'rsv-pt3-walters-may',
    ts: '2026-04-19T11:00:00',
    amount: 1330,
    currency: 'EUR',
    method: 'bank_transfer',
    status: 'received',
    reference: 'TRF-WALTERS-50',
    notes: '50% deposit · balance due 7 days before check-in',
  },
  // rsv-sbn-okonkwo — settled
  {
    id: 'pay-008',
    reservationId: 'rsv-sbn-okonkwo',
    ts: '2026-04-21T08:00:00',
    amount: 770,
    currency: 'EUR',
    method: 'channel_payout',
    status: 'received',
    reference: 'BDC-PAYOUT-8801203',
  },
  // rsv-cor-solheim
  {
    id: 'pay-009',
    reservationId: 'rsv-cor-solheim',
    ts: '2026-03-25T09:00:00',
    amount: 1300,
    currency: 'EUR',
    method: 'bank_transfer',
    status: 'received',
    reference: 'TRF-SOLHEIM-FULL',
  },
  // rsv-sbn-sato-cancelled — refund
  {
    id: 'pay-010',
    reservationId: 'rsv-sbn-sato-cancelled',
    ts: '2026-03-15T14:30:00',
    amount: 2695,
    currency: 'EUR',
    method: 'channel_payout',
    status: 'refunded',
    reference: 'AB-REFUND-HMSATO9P2K',
    notes: 'Full refund per Airbnb moderate policy',
  },
];

export function paymentsForReservation(reservationId: string): ReservationPayment[] {
  return RESERVATION_PAYMENTS
    .filter((p) => p.reservationId === reservationId)
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

/* ───── Folio lines (Phase 1: editable line-item view of the reservation) ───── */

export type FolioLineKind =
  | 'accommodation'
  | 'cleaning_fee'
  | 'tourist_tax'
  | 'extra'
  | 'discount'
  | 'channel_fee'
  | 'manual_adjustment';

export const FOLIO_LINE_KIND_LABEL: Record<FolioLineKind, string> = {
  accommodation: 'Accommodation',
  cleaning_fee: 'Cleaning fee',
  tourist_tax: 'Tourist tax',
  extra: 'Extra',
  discount: 'Discount',
  channel_fee: 'Channel fee',
  manual_adjustment: 'Manual adjustment',
};

export interface FolioLine {
  id: string;
  reservationId: string;
  kind: FolioLineKind;
  label: string;
  /** Positive for charges, negative for discounts/refunds. */
  amount: number;
  currency: 'MUR' | 'EUR' | 'USD';
  /** Whether this line is part of guest-facing total (vs. internal split / channel fee). */
  guestFacing: boolean;
  addedAt: string;
  addedByUserId?: string;
  notes?: string;
}

/**
 * Per-reservation custom folio lines override the default derived view.
 * Empty by default — populated when staff edit / add lines.
 */
export const RESERVATION_FOLIO_LINES: FolioLine[] = [];

export function folioLinesForReservation(reservationId: string): FolioLine[] {
  return RESERVATION_FOLIO_LINES
    .filter((l) => l.reservationId === reservationId)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export function addFolioLine(input: {
  reservationId: string;
  kind: FolioLineKind;
  label: string;
  amount: number;
  currency: 'MUR' | 'EUR' | 'USD';
  guestFacing: boolean;
  addedByUserId?: string;
  notes?: string;
}): FolioLine {
  const line: FolioLine = {
    id: `fol-${Math.random().toString(36).slice(2, 8)}`,
    reservationId: input.reservationId,
    kind: input.kind,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    guestFacing: input.guestFacing,
    addedAt: new Date().toISOString(),
    addedByUserId: input.addedByUserId,
    notes: input.notes,
  };
  RESERVATION_FOLIO_LINES.push(line);
  return line;
}

export function updateFolioLine(id: string, patch: Partial<Pick<FolioLine, 'label' | 'amount' | 'notes'>>): void {
  const line = RESERVATION_FOLIO_LINES.find((l) => l.id === id);
  if (line) Object.assign(line, patch);
}

export function removeFolioLine(id: string): void {
  const idx = RESERVATION_FOLIO_LINES.findIndex((l) => l.id === id);
  if (idx >= 0) RESERVATION_FOLIO_LINES.splice(idx, 1);
}

export function recordManualPayment(input: {
  reservationId: string;
  amount: number;
  currency: 'MUR' | 'EUR' | 'USD';
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}): ReservationPayment {
  const payment: ReservationPayment = {
    id: `pay-${Math.random().toString(36).slice(2, 8)}`,
    reservationId: input.reservationId,
    ts: new Date().toISOString(),
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    status: 'received',
    reference: input.reference,
    notes: input.notes,
  };
  RESERVATION_PAYMENTS.push(payment);
  // Reduce balanceDue on the reservation.
  const rsv = RESERVATION_BY_ID[input.reservationId];
  if (rsv) {
    rsv.balanceDue = Math.max(0, rsv.balanceDue - input.amount);
    if (rsv.balanceDue === 0 && rsv.payoutStatus === 'pending') {
      rsv.payoutStatus = 'captured';
    }
  }
  return payment;
}
