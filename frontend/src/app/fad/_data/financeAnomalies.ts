/**
 * Finance reconciliation engine — Mathias additions (Items A + B).
 *
 * Surfaces auto-detected per-reservation discrepancies that need a
 * corrective Owner Charge or fare-line split. Phase 1 = fixture; Phase 2
 * the detector calls real Airbnb host-report + Guesty channel-actual
 * payout endpoints (Wave 1 dependency).
 *
 * Where this is used:
 *  - PCStage4 of period close — Mathias's monthly recon surface
 *  - FinanceOverview "Open recon items" card — continuous visibility
 *  - FinanceTransactions row chip — one-glance flag per linked expense
 *
 * Brief: ~/Desktop/FAD Modules Scoping/finance_mathias_additions_brief.md
 */

import { TASK_USER_BY_ID } from './tasks';
import { FIN_EXPENSES, type Currency, type FinExpense } from './finance';

export type DiscrepancyKind =
  /** Airbnb resolution-centre refund silently pulled from a settled payout —
   *  Guesty still shows full payment. Owner Charge needed. */
  | 'resolution_centre'
  /** Airbnb special-offer collapsed cleaning fee into accommodation fare.
   *  cleaning_fee = 0 with anomalous accom_fare. Line-split fix. */
  | 'special_offer_collapse'
  /** Reservation change refund (same Guesty string as resolution-centre but
   *  via the booking-change mechanism). Disambiguated by Airbnb host-report
   *  in Phase 2; Phase 1 we surface as best-effort. */
  | 'reservation_change'
  /** Length-of-stay / coupon discount applied at platform level — Guesty
   *  doesn't reflect the absorbed amount. */
  | 'platform_discount';

export type DiscrepancySeverity = 'info' | 'warn' | 'high';

export interface PayoutDiscrepancy {
  id: string;
  reservationId: string;
  /** Property the reservation belongs to — for surfacing + Owner Charge. */
  propertyCode: string;
  guestName: string;
  /** Channel the reservation came through. */
  channel: 'airbnb' | 'booking' | 'vrbo' | 'direct';
  kind: DiscrepancyKind;
  /** What Guesty reported was paid. */
  guestyAmountMinor: number;
  /** What the channel actually settled (Airbnb host report). */
  actualAmountMinor: number;
  /** Currency for both numbers (always same). */
  currency: Currency;
  /** Diff = guestyAmount - actualAmount. Positive = Guesty over-reports
   *  (typical for resolution-centre refund pulls). */
  diffMinor: number;
  /** Suggested corrective amount in MUR (for Owner Charge). */
  suggestedOwnerChargeMinor: number;
  /** Short human-readable summary of the issue. */
  summary: string;
  /** Why the engine flagged it — diagnostic detail Mathias can reason about. */
  detectorReason: string;
  severity: DiscrepancySeverity;
  /** ISO timestamp the engine first detected this. */
  detectedAt: string;
  /** ISO timestamp the underlying payout settled, if known. */
  settledAt?: string;
  /** Reservation-period id this rolls into. */
  periodId: string;
  /** Once Mathias hits Apply, this links to the corrective FinExpense. */
  resolvedExpenseId?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ───────────────── Fixture ─────────────────
// 6 seeded discrepancies across the typical pattern set. Mix of channels,
// severities, and resolution states so the surfaces have real-looking data.

// @demo:data — Tag: PROD-DATA-33 — see frontend/DEMO_CRUFT.md
export const FIN_PAYOUT_DISCREPANCIES: PayoutDiscrepancy[] = [
  {
    id: 'fpd-001',
    reservationId: 'r-2026-1188',
    propertyCode: 'VV-47',
    guestName: 'Eleanor Dray',
    channel: 'airbnb',
    kind: 'resolution_centre',
    guestyAmountMinor: 142_000_00, // Rs 142,000
    actualAmountMinor: 134_000_00, // Rs 134,000 — Airbnb pulled Rs 8,000
    currency: 'MUR',
    diffMinor: 8_000_00,
    suggestedOwnerChargeMinor: 8_000_00,
    summary: 'Airbnb resolution-centre refund silently pulled from payout',
    detectorReason: 'Airbnb host report shows settled total Rs 134,000; Guesty shows Rs 142,000 received. Difference matches a Rs 8,000 resolution-centre adjustment posted Apr 19. Guesty does not sync resolution-centre refunds — needs Owner Charge to reconcile.',
    severity: 'high',
    detectedAt: '2026-04-22T08:14:00',
    settledAt: '2026-04-19T00:00:00',
    periodId: 'p-2026-04',
  },
  {
    id: 'fpd-002',
    reservationId: 'r-2026-1175',
    propertyCode: 'BL-12',
    guestName: 'Sasa Topic',
    channel: 'airbnb',
    kind: 'special_offer_collapse',
    guestyAmountMinor: 96_000_00,
    actualAmountMinor: 96_000_00, // amount matches but fare-mix is wrong
    currency: 'MUR',
    diffMinor: 0,
    suggestedOwnerChargeMinor: 0, // not a money diff — line split only
    summary: 'Special-offer collapsed cleaning fee into accommodation fare',
    detectorReason: 'Reservation has cleaning_fee = 0 + special_offer flag + accom_fare 5,000 above the seasonal baseline for BL-12. Standard pattern — Airbnb special offers nuke the cleaning_fee line. Manual fix: subtract Rs 5,000 from accom_fare and re-add as cleaning_fee.',
    severity: 'warn',
    detectedAt: '2026-04-21T11:02:00',
    periodId: 'p-2026-04',
  },
  {
    id: 'fpd-003',
    reservationId: 'r-2026-1192',
    propertyCode: 'PT-3',
    guestName: 'Hugo Meunier',
    channel: 'booking',
    kind: 'platform_discount',
    guestyAmountMinor: 78_000_00,
    actualAmountMinor: 76_750_00,
    currency: 'MUR',
    diffMinor: 1_250_00,
    suggestedOwnerChargeMinor: 1_250_00,
    summary: 'Length-of-stay discount absorbed by Booking.com',
    detectorReason: 'Booking.com payout report shows Rs 1,250 less than Guesty-recorded total. Reservation has 7+ nights and cohort-typical 1.5% LOS discount — matches the diff. Guesty doesn\'t mirror LOS absorbed amounts.',
    severity: 'info',
    detectedAt: '2026-04-23T15:40:00',
    settledAt: '2026-04-22T00:00:00',
    periodId: 'p-2026-04',
  },
  {
    id: 'fpd-004',
    reservationId: 'r-2026-1201',
    propertyCode: 'LC-9',
    guestName: 'Marie Beemul',
    channel: 'airbnb',
    kind: 'reservation_change',
    guestyAmountMinor: 64_000_00,
    actualAmountMinor: 61_200_00,
    currency: 'MUR',
    diffMinor: 2_800_00,
    suggestedOwnerChargeMinor: 2_800_00,
    summary: 'Reservation change refund (one night shorter)',
    detectorReason: 'Airbnb host report shows Rs 2,800 net pulled — labelled "Resolution Center" in Guesty but Airbnb-side ref indicates a reservation-change shorten by 1 night. Disambiguated via Wave 1 host-report integration; Phase 1 best-effort flag.',
    severity: 'warn',
    detectedAt: '2026-04-20T09:11:00',
    settledAt: '2026-04-19T00:00:00',
    periodId: 'p-2026-04',
  },
  {
    id: 'fpd-005',
    reservationId: 'r-2026-1199',
    propertyCode: 'GBH-C8',
    guestName: 'Wei Chen',
    channel: 'booking',
    kind: 'special_offer_collapse',
    guestyAmountMinor: 73_750_00,
    actualAmountMinor: 73_750_00,
    currency: 'MUR',
    diffMinor: 0,
    suggestedOwnerChargeMinor: 0,
    summary: 'Booking-side promo collapsed cleaning fee into rate',
    detectorReason: 'Cleaning_fee = 0 + Booking-side promo applied + accom_fare anomaly. Same fix pattern as Airbnb special-offer.',
    severity: 'warn',
    detectedAt: '2026-04-22T13:55:00',
    periodId: 'p-2026-04',
  },
  {
    id: 'fpd-006',
    reservationId: 'r-2026-1183',
    propertyCode: 'KS-5',
    guestName: 'Olivia Janssen',
    channel: 'airbnb',
    kind: 'resolution_centre',
    guestyAmountMinor: 51_000_00,
    actualAmountMinor: 47_900_00,
    currency: 'MUR',
    diffMinor: 3_100_00,
    suggestedOwnerChargeMinor: 3_100_00,
    summary: 'Airbnb resolution-centre — pool maintenance complaint',
    detectorReason: 'Rs 3,100 silently pulled. Linked review rv-021 ("pool needed work") suggests the guest opened a resolution case. Confirm with Airbnb host portal.',
    severity: 'high',
    detectedAt: '2026-04-04T10:22:00',
    settledAt: '2026-04-03T00:00:00',
    periodId: 'p-2026-04',
    // Already resolved — example of post-Apply state
    resolvedExpenseId: 'e-recon-001',
    resolvedAt: '2026-04-05T08:30:00',
    resolvedBy: 'u-mathias',
  },
];

// ───────────────── Helpers ─────────────────

export const DISCREPANCY_KIND_LABEL: Record<DiscrepancyKind, string> = {
  resolution_centre: 'Resolution-centre sync',
  special_offer_collapse: 'Special-offer fare collapse',
  reservation_change: 'Reservation change refund',
  platform_discount: 'Platform discount absorbed',
};

/** All currently-open discrepancies (not yet resolved). */
export function openDiscrepancies(): PayoutDiscrepancy[] {
  return FIN_PAYOUT_DISCREPANCIES.filter((d) => !d.resolvedAt).sort(
    (a, b) => b.detectedAt.localeCompare(a.detectedAt),
  );
}

/** Open discrepancies for a specific period. */
export function openDiscrepanciesForPeriod(periodId: string): PayoutDiscrepancy[] {
  return openDiscrepancies().filter((d) => d.periodId === periodId);
}

/** Discrepancy linked to a specific reservation (used by FinanceTransactions
 *  to render an anomaly chip on rows whose `reservationId` matches). */
export function discrepancyForReservation(reservationId: string): PayoutDiscrepancy | undefined {
  return FIN_PAYOUT_DISCREPANCIES.find((d) => d.reservationId === reservationId);
}

/** Discrepancy linked to a specific expense (after Apply lands an Owner
 *  Charge — the new expense.reservationId points back to a discrepancy). */
export function discrepancyForExpense(expense: FinExpense): PayoutDiscrepancy | undefined {
  if (!expense.reservationId) return undefined;
  return discrepancyForReservation(expense.reservationId);
}

/**
 * Phase 1: returns the seeded fixture verbatim. Phase 2: actually compares
 * Airbnb-host-report against Guesty payouts and the seasonal-baseline
 * accom_fare to produce live discrepancies. UI surfaces don't need to know
 * the difference.
 */
export function detectAllAnomalies(): PayoutDiscrepancy[] {
  return openDiscrepancies();
}

/** Shape for the "Apply" action's preview — what the corrective expense
 *  will look like. Doesn't write anything; just builds the row. */
export interface OwnerChargeProposal {
  description: string;
  propertyCode: string;
  reservationId: string;
  amountMinor: number;
  currency: Currency;
  category: string;
  reasoning: string;
}

export function proposeOwnerCharge(d: PayoutDiscrepancy): OwnerChargeProposal {
  return {
    description: d.summary + ` · ${d.guestName} (${d.reservationId})`,
    propertyCode: d.propertyCode,
    reservationId: d.reservationId,
    amountMinor: d.suggestedOwnerChargeMinor,
    currency: d.currency,
    category: 'FR-REC', // Reconciliation-Owner-Charge category — owner-billable
    reasoning: d.detectorReason,
  };
}

/** Shape for the "Apply" action of a special-offer collapse — describes
 *  the fare-line split that gets pushed to the reservation record. */
export interface FareCollapseSplit {
  reservationId: string;
  propertyCode: string;
  /** New accommodation fare (lower than Guesty current). */
  newAccomFareMinor: number;
  /** Cleaning fee re-instated as its own line. */
  newCleaningFeeMinor: number;
  /** Original (incorrect) fare we're correcting from. */
  originalAccomFareMinor: number;
}

export function proposeFareSplit(d: PayoutDiscrepancy): FareCollapseSplit {
  // Phase 1: hard-coded suggestion for the seeded fixtures. Phase 2 the
  // engine reads cleaning_fee_baseline from the property profile.
  const cleaningFeeMinor = d.id === 'fpd-002' ? 5_000_00 : 4_500_00;
  return {
    reservationId: d.reservationId,
    propertyCode: d.propertyCode,
    newAccomFareMinor: d.guestyAmountMinor - cleaningFeeMinor,
    newCleaningFeeMinor: cleaningFeeMinor,
    originalAccomFareMinor: d.guestyAmountMinor,
  };
}

/** Total Owner-Charge value across open discrepancies, MUR. Used by the
 *  Overview "Open recon items" card. */
export function openReconValueMinor(): number {
  return openDiscrepancies().reduce((s, d) => s + d.suggestedOwnerChargeMinor, 0);
}

/** Breakdown by kind — for severity-based grouping in the Overview card. */
export function openReconCountsByKind(): Record<DiscrepancyKind, number> {
  const out: Record<DiscrepancyKind, number> = {
    resolution_centre: 0, special_offer_collapse: 0, reservation_change: 0, platform_discount: 0,
  };
  for (const d of openDiscrepancies()) out[d.kind]++;
  return out;
}

/** Friendly assignee label for a resolved discrepancy. */
export function resolverLabel(d: PayoutDiscrepancy): string {
  if (!d.resolvedBy) return '—';
  return TASK_USER_BY_ID[d.resolvedBy]?.name ?? d.resolvedBy;
}
