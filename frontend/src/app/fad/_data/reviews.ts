// @demo:data — Channel reviews — GET /api/reviews
// Tag: PROD-DATA-9 — see frontend/DEMO_CRUFT.md

/**
 * Reviews module — Phase 1 fixture (direct read from Guesty + Breezeway).
 *
 * Strategic frame (per Apr 2026 sessions): skip Reva entirely. Once the FAD
 * backend is built, reviews come from Guesty's API (Airbnb / Booking / VRBO
 * / Direct) and staff attribution comes from Breezeway task IDs. Reva is
 * decommissioned the moment FAD is up. This fixture mirrors the shape that
 * integration will return so the UI can be built against it now.
 *
 * Cross-link primary keys:
 *  - reservationId → `reservations.ts:RESERVATION_BY_ID`
 *  - propertyCode  → `tasks.ts:TASK_PROPERTY_BY_CODE`
 *  - staff (cleaner/inspector) → `tasks.ts:TASK_USER_BY_ID`
 *  - breezewayTaskId on each StaffReviewLink — the join key for Phase 2's
 *    real Breezeway-task ↔ review correlation
 */

export type ReviewChannel = 'airbnb' | 'booking' | 'vrbo' | 'google' | 'direct';
export type ReviewSentiment = 'positive' | 'mixed' | 'negative';
export type ReplyStatus = 'unreplied' | 'draft' | 'sent' | 'failed';
export type Cohort = 'flic_en_flac' | 'grand_baie' | 'pereybere' | 'bel_ombre';
export type StaffRole = 'cleaner' | 'inspector';
export type TagSentiment = 'positive' | 'negative' | 'neutral';

export const COHORT_LABEL: Record<Cohort, string> = {
  flic_en_flac: 'Flic en Flac',
  grand_baie: 'Grand Baie',
  pereybere: 'Pereybere',
  bel_ombre: 'Bel Ombre',
};

export const CHANNEL_LABEL: Record<ReviewChannel, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  vrbo: 'VRBO',
  google: 'Google',
  direct: 'Direct',
};

/** Property → cohort mapping. Now back-compat shim — canonical `Property.region`
 *  lives in `_data/properties.ts`. This export will be removed in commit 4 of
 *  the Properties rebuild. */
import { PROPERTY_COHORT_SHIM } from './properties';
export const PROPERTY_COHORT: Record<string, Cohort> = PROPERTY_COHORT_SHIM;

export interface SubRatings {
  accuracy: number;
  checkin: number;
  cleanliness: number;
  communication: number;
  location: number;
  value: number;
}

export interface Review {
  id: string;
  /** Reva's review ID — primary external key in Phase 1. */
  externalId: string;
  channel: ReviewChannel;
  /** Channel-side review ID (Airbnb/Booking/etc) — needed for reply pushback. */
  channelReviewId?: string;
  /** Public deep-link to the channel-side review surface. */
  channelUrl?: string;
  reservationId?: string;
  propertyCode: string;
  cohort: Cohort;
  guestName: string;
  guestInitials: string;
  rating: number;
  subRatings: SubRatings;
  title: string;
  reviewText: string;
  /** Friday-internal feedback only — never shown to guests / channels. */
  privateFeedback?: string;
  /** ISO timestamp the guest submitted. */
  submittedAt: string;
  /** Auto-derived from rating + sub-ratings + tag set. */
  sentiment: ReviewSentiment;
  replyStatus: ReplyStatus;
  replyText?: string;
  replySentAt?: string;
  /** Optional flag — surfaces in OverviewPage Suggested Actions. */
  urgent?: boolean;
}

export interface ReviewTag {
  id: string;
  reviewId: string;
  tag: string;
  source: 'ai' | 'manual';
  sentiment: TagSentiment;
}

/** Links a review to the cleaner / inspector responsible for the stay. Phase 1
 *  this comes from Reva's Breezeway-task join; Phase 2+ we'll derive locally. */
export interface StaffReviewLink {
  reviewId: string;
  staffId: string;
  role: StaffRole;
  /** Breezeway task id of the cleaning / inspection job for this stay. */
  breezewayTaskId: string;
  cleaningDate: string;
}

// ───────────────── Tag library ─────────────────
// Curated by Reva's AI today; this enumerates the canonical set we'll
// surface as chips. New tags can still appear; this list is the trending /
// drill-down catalogue, not a hard schema.

export const TAG_LIBRARY: { tag: string; sentiment: TagSentiment }[] = [
  // Positive
  { tag: 'Spotless', sentiment: 'positive' },
  { tag: 'Great location', sentiment: 'positive' },
  { tag: 'Communication', sentiment: 'positive' },
  { tag: 'Welcome touches', sentiment: 'positive' },
  { tag: 'Beach access', sentiment: 'positive' },
  { tag: 'Pool', sentiment: 'positive' },
  { tag: 'Chef service', sentiment: 'positive' },
  { tag: 'Driver', sentiment: 'positive' },
  { tag: 'Family friendly', sentiment: 'positive' },
  { tag: 'View', sentiment: 'positive' },
  { tag: 'Quiet', sentiment: 'positive' },
  { tag: 'Design', sentiment: 'positive' },
  { tag: 'Concierge', sentiment: 'positive' },
  // Negative
  { tag: 'Slow check-in', sentiment: 'negative' },
  { tag: 'AC issues', sentiment: 'negative' },
  { tag: 'Wifi issues', sentiment: 'negative' },
  { tag: 'Hot water', sentiment: 'negative' },
  { tag: 'Smell', sentiment: 'negative' },
  { tag: 'FF&E', sentiment: 'negative' },
  { tag: 'Bugs', sentiment: 'negative' },
  { tag: 'Pool maintenance', sentiment: 'negative' },
  { tag: 'Linen quality', sentiment: 'negative' },
  { tag: 'Coffee machine', sentiment: 'negative' },
  { tag: 'Communication delay', sentiment: 'negative' },
  { tag: 'Noise', sentiment: 'negative' },
];

// ───────────────── Reviews fixture ─────────────────
// 30 reviews across last ~120 days. Distribution: ~70% positive, ~22% mixed,
// ~8% negative. Channels weighted Airbnb > Booking > Vrbo/Direct/Google.

const r = (overrides: Partial<Review> & Pick<Review,
  'id' | 'externalId' | 'channel' | 'propertyCode' | 'guestName' | 'guestInitials' |
  'rating' | 'title' | 'reviewText' | 'submittedAt' | 'sentiment' | 'replyStatus'
>): Review => {
  const cohort = PROPERTY_COHORT[overrides.propertyCode] ?? 'flic_en_flac';
  // Default sub-ratings: jitter each within 0.3 of overall rating, clamp to [1, 5].
  const base = overrides.rating;
  const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v * 10) / 10));
  const subRatings: SubRatings = overrides.subRatings ?? {
    accuracy: clamp(base + 0.1),
    checkin: clamp(base - 0.1),
    cleanliness: clamp(base),
    communication: clamp(base + 0.1),
    location: clamp(base + 0.2),
    value: clamp(base - 0.2),
  };
  return { ...overrides, cohort, subRatings };
};

export const REVIEWS: Review[] = [];

export const REVIEW_BY_ID: Record<string, Review> = Object.fromEntries(
  REVIEWS.map((rv) => [rv.id, rv]),
);

// ───────────────── Tags fixture ─────────────────
// AI-extracted per review. Multiple tags per review.

const t = (id: number, reviewId: string, tag: string, sentiment: TagSentiment): ReviewTag => ({
  id: `rvt-${String(id).padStart(3, '0')}`, reviewId, tag, source: 'ai', sentiment,
});

let tid = 1;
const T = (reviewId: string, tag: string, sentiment: TagSentiment) => t(tid++, reviewId, tag, sentiment);

export const REVIEW_TAGS: ReviewTag[] = [];

export function tagsForReview(reviewId: string): ReviewTag[] {
  return REVIEW_TAGS.filter((tg) => tg.reviewId === reviewId);
}

// ───────────────── Staff attribution fixture ─────────────────
// Cleaners: Mary, Catherine, Alex. Inspectors: Alex, Catherine, Franny.
// Each review has up to 1 cleaner + 1 inspector linked via the reservation
// (in the real Reva integration this comes via Breezeway task IDs).

const sl = (
  reviewId: string, staffId: string, role: StaffRole, breezewayTaskId: string, cleaningDate: string,
): StaffReviewLink => ({ reviewId, staffId, role, breezewayTaskId, cleaningDate });

// @demo:data — Tag: PROD-DATA-42 — see frontend/DEMO_CRUFT.md
//   covers STAFF_REVIEW_LINKS + COHORT_NARRATIVES + SUGGESTED_ACTIONS + REVIEW_ANOMALIES
//   (all four named-staff/property-coded surfaces in this file)
export const STAFF_REVIEW_LINKS: StaffReviewLink[] = [];

export function staffLinksForReview(reviewId: string): StaffReviewLink[] {
  return STAFF_REVIEW_LINKS.filter((l) => l.reviewId === reviewId);
}

// ───────────────── Aggregations / helpers ─────────────────

// @demo:logic — Tag: PROD-LOGIC-7 — see frontend/DEMO_CRUFT.md. Replace with real Date.now() / server now().
const TODAY_ISO = '2026-04-27';
function daysAgo(iso: string): number {
  return Math.round((new Date(TODAY_ISO).getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// Helpers accept an optional `source` array so live data from useLiveReviews()
// can feed them. Default REVIEWS keeps every existing call site working
// unchanged while the migration to live data rolls out per sub-page.

export function reviewsInWindow(days: number, source: Review[] = REVIEWS): Review[] {
  return source.filter((rv) => daysAgo(rv.submittedAt) <= days);
}

export function avgRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}

export function ratingDistribution(reviews: Review[]): Record<1 | 2 | 3 | 4 | 5, number> {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) dist[Math.round(r.rating) as 1 | 2 | 3 | 4 | 5]++;
  return dist;
}

export function reviewsByCohort(source: Review[] = REVIEWS): Record<Cohort, Review[]> {
  const out: Record<Cohort, Review[]> = {
    flic_en_flac: [], grand_baie: [], pereybere: [], bel_ombre: [],
  };
  for (const rv of source) out[rv.cohort].push(rv);
  return out;
}

export function reviewsByChannel(source: Review[] = REVIEWS): Record<ReviewChannel, Review[]> {
  const out: Record<ReviewChannel, Review[]> = {
    airbnb: [], booking: [], vrbo: [], google: [], direct: [],
  };
  for (const rv of source) out[rv.channel].push(rv);
  return out;
}

export function reviewsByProperty(source: Review[] = REVIEWS): Record<string, Review[]> {
  const out: Record<string, Review[]> = {};
  for (const rv of source) {
    (out[rv.propertyCode] = out[rv.propertyCode] || []).push(rv);
  }
  return out;
}

export interface TagAgg {
  tag: string;
  sentiment: TagSentiment;
  count: number;
  pct: number;
  trendingDelta?: number;
}

export function tagAggregate(window: 'all' | 30 | 90 = 'all'): TagAgg[] {
  const reviewIds = new Set(
    (window === 'all' ? REVIEWS : reviewsInWindow(window)).map((r) => r.id),
  );
  const denom = reviewIds.size || 1;
  const counts: Record<string, { sentiment: TagSentiment; count: number }> = {};
  for (const tg of REVIEW_TAGS) {
    if (!reviewIds.has(tg.reviewId)) continue;
    const k = tg.tag;
    counts[k] = counts[k] || { sentiment: tg.sentiment, count: 0 };
    counts[k].count++;
  }
  return Object.entries(counts)
    .map(([tag, v]) => ({
      tag,
      sentiment: v.sentiment,
      count: v.count,
      pct: v.count / denom,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface StaffPerf {
  staffId: string;
  role: StaffRole;
  reviewCount: number;
  avgRating: number;
  avgCleanliness: number;
  goodTagCount: number;
  badTagCount: number;
}

export function staffPerformance(role: StaffRole): StaffPerf[] {
  const byStaff: Record<string, StaffReviewLink[]> = {};
  for (const link of STAFF_REVIEW_LINKS) {
    if (link.role !== role) continue;
    (byStaff[link.staffId] = byStaff[link.staffId] || []).push(link);
  }
  return Object.entries(byStaff).map(([staffId, links]) => {
    const reviews = links.map((l) => REVIEW_BY_ID[l.reviewId]).filter(Boolean);
    const tags = reviews.flatMap((rv) => tagsForReview(rv.id));
    return {
      staffId,
      role,
      reviewCount: reviews.length,
      avgRating: avgRating(reviews),
      avgCleanliness: reviews.length === 0 ? 0
        : reviews.reduce((s, rv) => s + rv.subRatings.cleanliness, 0) / reviews.length,
      goodTagCount: tags.filter((tg) => tg.sentiment === 'positive').length,
      badTagCount: tags.filter((tg) => tg.sentiment === 'negative').length,
    };
  });
}

export function lowRatedReviews(source: Review[] = REVIEWS): Review[] {
  return source.filter((rv) => rv.rating <= 3).sort(
    (a, b) => b.submittedAt.localeCompare(a.submittedAt),
  );
}

export function unrepliedReviews(source: Review[] = REVIEWS): Review[] {
  return source.filter((rv) => rv.replyStatus === 'unreplied').sort(
    (a, b) => b.submittedAt.localeCompare(a.submittedAt),
  );
}

/** AI-derived cohort narratives — Phase 1 hand-crafted, Phase 2 will pull
 *  from a real LLM call. Shape stays the same so swap is local. */
export const COHORT_NARRATIVES: Record<Cohort, string> = {
  flic_en_flac:
    "In the last 90 days Flic en Flac is the highest-volume cohort by a wide margin (12 reviews) and the most consistent — average rating 4.6, no review under 3 stars. Welcome-touches and Communication dominate the positive tag mix; the only repeat negative pattern is FF&E (Tomás's coffee machine, Sofia's curtains) which suggests a portfolio-wide hardware refresh would lift scores another notch.",
  grand_baie:
    "Grand Baie is small but elite: 6 reviews, 4.8 average, no negative tags in the last 60 days. Beach access and Spotless are the standout positive signals. Worth flagging that GBH-C8 has produced two five-star reviews in three weeks — Catherine has cleaned both. Keep her on that property.",
  pereybere:
    "Pereybere swung in the last 30 days. BCN-A's drain-smell incident dragged the cohort average down to 3.5 (Lukas's 2-star). PT-3 is steady at 4.0 across three reviews but Hot water and Welcome-basket-completeness keep recurring as small misses. Plumbing-then-checklist pass would close this gap.",
  bel_ombre:
    "Bel Ombre is split: SD-10 produces consistent 5-star stays (Nina, Ines), LB-2 shows mixed results with two recent 3-star reviews around AC, Wifi and Linen. Both properties use the same maintenance vendor — worth checking whether LB-2 is on a different cleaner rotation.",
};

/** AI Suggested Actions — review → suggested Operations task. Phase 1
 *  hand-curated based on review tags + sub-rating dips; Phase 2 generated. */
export interface SuggestedAction {
  id: string;
  reviewId: string;
  taskTitle: string;
  taskDescription: string;
  department: 'cleaning' | 'inspection' | 'maintenance' | 'office';
  subdepartment: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  reasoning: string;
}

export const SUGGESTED_ACTIONS: SuggestedAction[] = [];

/** Anomaly callouts shown above OverviewPage. Phase 1 hand-crafted, Phase 2
 *  pattern-detected from rolling sub-rating means. */
export interface Anomaly {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'danger';
}

export const REVIEW_ANOMALIES: Anomaly[] = [];
