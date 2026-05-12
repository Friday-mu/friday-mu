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

export const REVIEWS: Review[] = [
  // ───── Last 7 days (Apr 21–27) — most actionable ─────
  r({
    id: 'rv-001', externalId: 'reva-rv-001', channel: 'airbnb',
    channelReviewId: 'abnb-RV-9421',
    channelUrl: 'https://airbnb.com/reviews/RV-9421',
    reservationId: 'rsv-rc15-thomas',
    propertyCode: 'RC-15', guestName: 'Thomas Kanarski', guestInitials: 'TK',
    rating: 5, title: 'Felt like home for our family',
    reviewText: "Returning guest. Welcome basket was perfect — kids were thrilled with the chocolates Catherine left. Driver was on time, pool ready exactly as we asked. Friday remembers everything.",
    submittedAt: '2026-04-26T18:14:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Thomas — December bookings open mid-May, we already pencilled you in.',
    replySentAt: '2026-04-26T19:32:00',
  }),
  r({
    id: 'rv-002', externalId: 'reva-rv-002', channel: 'booking',
    channelReviewId: 'bdc-RV-8830',
    reservationId: 'rsv-cor-solheim',
    propertyCode: 'LC-9', guestName: 'Henrik Solheim', guestInitials: 'HS',
    rating: 3, title: 'AC issue soured an otherwise great stay',
    reviewText: "Master bedroom AC was out for a day and a half before parts arrived. Staff was responsive but at this price point I'd expect a backup unit or hotel upgrade offered. Otherwise the location and house design are stunning.",
    submittedAt: '2026-04-25T11:42:00', sentiment: 'mixed',
    replyStatus: 'unreplied', urgent: true,
    privateFeedback: 'They told me directly the cooling unit ETA was the only frustration — fix faster next time.',
  }),
  r({
    id: 'rv-003', externalId: 'reva-rv-003', channel: 'airbnb',
    channelReviewId: 'abnb-RV-9415',
    propertyCode: 'GBH-C8', guestName: 'Hannah Becker', guestInitials: 'HB',
    rating: 5, title: 'Top to bottom faultless',
    reviewText: "Spotless on arrival, beach a 4 minute walk, the welcome bottle and snacks were a nice surprise. Communication leading up to check-in was exceptional. We'll book direct next time.",
    submittedAt: '2026-04-24T08:30:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Hannah — direct rate awaits, we just sent you the link.',
    replySentAt: '2026-04-24T10:05:00',
  }),
  r({
    id: 'rv-004', externalId: 'reva-rv-004', channel: 'airbnb',
    propertyCode: 'BS-1', guestName: 'Yudi Wang', guestInitials: 'YW',
    rating: 4, title: 'Lovely studio, late check-in',
    reviewText: "Cute property, exactly as photographed. Only nit — we arrived at 14:00 as agreed but had to wait until 14:45 for the keys. Otherwise perfect.",
    submittedAt: '2026-04-23T19:20:00', sentiment: 'mixed',
    replyStatus: 'unreplied', urgent: false,
  }),
  r({
    id: 'rv-005', externalId: 'reva-rv-005', channel: 'direct',
    propertyCode: 'BL-12', guestName: 'Sophia Linde', guestInitials: 'SL',
    rating: 5, title: 'Chef night was the highlight',
    reviewText: "Aarav cooked an unforgettable meal on the terrace. Pool was perfect for the kids the next day. House is enormous but somehow felt cosy.",
    submittedAt: '2026-04-22T14:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Sophia — Aarav was thrilled. See you in November.',
    replySentAt: '2026-04-22T15:11:00',
  }),

  // ───── Last 14 days (Apr 14–20) ─────
  r({
    id: 'rv-006', externalId: 'reva-rv-006', channel: 'airbnb',
    propertyCode: 'VV-47', guestName: 'Marco Ricci', guestInitials: 'MR',
    rating: 5, title: 'Stunning, no notes',
    reviewText: "No notes. Will be back.",
    submittedAt: '2026-04-20T09:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Marco — appreciated. Door is open.',
    replySentAt: '2026-04-20T10:04:00',
  }),
  r({
    id: 'rv-007', externalId: 'reva-rv-007', channel: 'booking',
    propertyCode: 'SD-10', guestName: 'Julien Bernard', guestInitials: 'JB',
    rating: 2, title: 'Disappointing check-in experience',
    reviewText: "Arrived at 14:30 as agreed, property wasn't ready until 16:10. No apology, no offer of compensation. For this price range I expect better coordination.",
    submittedAt: '2026-04-19T17:45:00', sentiment: 'negative', replyStatus: 'sent',
    replyText: "Julien — you're right. We've refunded one night's stay and the cleaner schedule has been reviewed. Hope you'll give us another chance.",
    replySentAt: '2026-04-19T19:15:00',
    privateFeedback: 'Operations: cleaner ran 90 min late on the changeover. Build a buffer.',
  }),
  r({
    id: 'rv-008', externalId: 'reva-rv-008', channel: 'airbnb',
    propertyCode: 'GBH-C3', guestName: 'Amélie Dubois', guestInitials: 'AD',
    rating: 5, title: 'Magical long weekend',
    reviewText: "Came for a quick escape and didn't want to leave. The welcome basket, the beach chairs already set up, the handwritten dinner recommendations — every detail was considered.",
    submittedAt: '2026-04-18T11:30:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Amélie — the rum is from our friends in Chamarel. Come back soon.',
    replySentAt: '2026-04-18T12:48:00',
  }),
  r({
    id: 'rv-009', externalId: 'reva-rv-009', channel: 'google',
    propertyCode: 'VV-47', guestName: 'Priya Iyer', guestInitials: 'PI',
    rating: 5, title: 'Our new favourite',
    reviewText: "Been coming to Mauritius for a decade — this is the first house I'd actively recommend to friends. The team anticipates everything before you think to ask.",
    submittedAt: '2026-04-17T20:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Priya — November pencilled in.',
    replySentAt: '2026-04-17T21:20:00',
  }),
  r({
    id: 'rv-010', externalId: 'reva-rv-010', channel: 'airbnb',
    propertyCode: 'PT-3', guestName: 'Fernando Kanarski', guestInitials: 'FK',
    rating: 4, title: 'Welcome basket missing chocolates',
    reviewText: "Loved the property. Only thing — the welcome card mentioned wine and chocolates but only the wine arrived. Tiny thing but worth flagging at this tier.",
    submittedAt: '2026-04-17T08:00:00', sentiment: 'mixed', replyStatus: 'unreplied',
  }),
  r({
    id: 'rv-011', externalId: 'reva-rv-011', channel: 'airbnb',
    propertyCode: 'LC-9', guestName: 'Sofia Mendes', guestInitials: 'SM',
    rating: 4, title: 'Lovely, blackout curtain nit',
    reviewText: "House is gorgeous. Only suggestion — the blackout curtains in the master bedroom don't fully seal at the top. Otherwise can't fault anything.",
    submittedAt: '2026-04-16T15:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Sofia — already in the maintenance queue. Thank you for the signal.',
    replySentAt: '2026-04-16T16:30:00',
  }),
  r({
    id: 'rv-012', externalId: 'reva-rv-012', channel: 'booking',
    propertyCode: 'KS-5', guestName: 'Elena Petrova', guestInitials: 'EP',
    rating: 5, title: 'Absolutely perfect for honeymoon',
    reviewText: "Quiet, private, view to die for. The chef night was the cherry on top. We'll bring our families back next year.",
    submittedAt: '2026-04-15T22:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Elena — congratulations again, see you and the families.',
    replySentAt: '2026-04-15T23:14:00',
  }),
  r({
    id: 'rv-013', externalId: 'reva-rv-013', channel: 'airbnb',
    propertyCode: 'LB-2', guestName: 'Alessandro Conti', guestInitials: 'AC',
    rating: 3, title: 'AC and wifi both flaky',
    reviewText: "Beautiful but two technical issues over a week. AC needed parts (took two days), wifi dropped intermittently. Maintenance was attentive but it shouldn't take that many touches at this rate.",
    submittedAt: '2026-04-14T13:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: "Alessandro — both fair. The AC unit was replaced this week and the router is on a refresh cycle. Apologies.",
    replySentAt: '2026-04-14T14:40:00',
  }),

  // ───── Last 30 days (Mar 28 – Apr 13) ─────
  r({
    id: 'rv-014', externalId: 'reva-rv-014', channel: 'airbnb',
    propertyCode: 'BL-12', guestName: 'James Okonkwo', guestInitials: 'JO',
    rating: 5, title: 'Worth every franc',
    reviewText: "Massive house, faultless service, the cleanliness was museum-grade. Mary's note on arrival was such a thoughtful touch.",
    submittedAt: '2026-04-12T10:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'James — Mary will be touched. Come back soon.',
    replySentAt: '2026-04-12T11:20:00',
  }),
  r({
    id: 'rv-015', externalId: 'reva-rv-015', channel: 'airbnb',
    propertyCode: 'BCN-A', guestName: 'Lukas Brem', guestInitials: 'LB',
    rating: 2, title: 'Persistent kitchen smell',
    reviewText: "Strong drain smell from the kitchen on day 1. Maintenance came twice but it never fully cleared. We left a day early.",
    submittedAt: '2026-04-11T16:30:00', sentiment: 'negative', replyStatus: 'sent',
    replyText: "Lukas — that's a serious miss. Plumbing is being redone next week and you'll see a partial refund tonight.",
    replySentAt: '2026-04-11T17:45:00',
    privateFeedback: 'BCN-A drain trap needs replacement. Already ordered.',
  }),
  r({
    id: 'rv-016', externalId: 'reva-rv-016', channel: 'direct',
    propertyCode: 'GBH-C8', guestName: 'Mia Chen', guestInitials: 'MC',
    rating: 5, title: 'Spotless and serene',
    reviewText: "Quietest week we've had in years. Beach was empty, house was a dream, Catherine left fresh fruit every other day. Magic.",
    submittedAt: '2026-04-10T09:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Mia — direct rate booked any time you want it.',
    replySentAt: '2026-04-10T10:15:00',
  }),
  r({
    id: 'rv-017', externalId: 'reva-rv-017', channel: 'airbnb',
    propertyCode: 'RC-15', guestName: 'Tomás Reyes', guestInitials: 'TR',
    rating: 4, title: 'Coffee machine needed descaling',
    reviewText: "Property was lovely. Coffee machine was descaling-overdue — small thing but at this price it stands out. Pool maintenance was great.",
    submittedAt: '2026-04-09T14:00:00', sentiment: 'mixed', replyStatus: 'unreplied',
  }),
  r({
    id: 'rv-018', externalId: 'reva-rv-018', channel: 'airbnb',
    propertyCode: 'SD-10', guestName: 'Nina Berger', guestInitials: 'NB',
    rating: 5, title: 'Pure luxury done right',
    reviewText: "Service without being intrusive, design that feels lived-in not staged. The driver-on-arrival is a game changer with kids. Bravo team.",
    submittedAt: '2026-04-08T19:30:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Nina — December slots open in two weeks. Already on the list.',
    replySentAt: '2026-04-08T20:50:00',
  }),
  r({
    id: 'rv-019', externalId: 'reva-rv-019', channel: 'booking',
    propertyCode: 'PT-3', guestName: 'Emma Beaumont', guestInitials: 'EB',
    rating: 4, title: 'Good but not quite the photos',
    reviewText: "Property is lovely but slightly more lived-in than the photos suggest. Kitchen tiles are dated. Would still rebook.",
    submittedAt: '2026-04-07T12:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Emma — fair point. Kitchen refresh is queued for low season.',
    replySentAt: '2026-04-07T13:24:00',
  }),
  r({
    id: 'rv-020', externalId: 'reva-rv-020', channel: 'airbnb',
    propertyCode: 'VV-47', guestName: 'Diego Castillo', guestInitials: 'DC',
    rating: 5, title: 'Perfect family setup',
    reviewText: "Two cribs ready when we walked in, beach toys in the garage, Mary thought of everything. We left in tears.",
    submittedAt: '2026-04-05T08:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Diego — Mary will miss you too.',
    replySentAt: '2026-04-05T09:10:00',
  }),
  r({
    id: 'rv-021', externalId: 'reva-rv-021', channel: 'airbnb',
    propertyCode: 'LV-10', guestName: 'Olivia Jansen', guestInitials: 'OJ',
    rating: 3, title: 'Pool needed work',
    reviewText: "Pool had visible algae on day one. Was cleaned next day but lost us the morning. Otherwise the property is beautiful.",
    submittedAt: '2026-04-03T11:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Olivia — pool maintenance schedule has been tightened. Apologies.',
    replySentAt: '2026-04-03T12:00:00',
    privateFeedback: 'Pool service interval went 9 days — needs to stay at 7.',
  }),

  // ───── Last 60 days (Feb 27 – Mar 27) ─────
  r({
    id: 'rv-022', externalId: 'reva-rv-022', channel: 'airbnb',
    propertyCode: 'GBH-C3', guestName: 'Ravi Patel', guestInitials: 'RP',
    rating: 5, title: 'Communication and care',
    reviewText: "From booking to check-out the team was responsive and warm. Property exceeded expectations.",
    submittedAt: '2026-03-25T09:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Ravi — appreciated. Already pencilled you in for August.',
    replySentAt: '2026-03-25T10:30:00',
  }),
  r({
    id: 'rv-023', externalId: 'reva-rv-023', channel: 'airbnb',
    propertyCode: 'BS-1', guestName: 'Camille Roche', guestInitials: 'CR',
    rating: 4, title: 'Bug issue resolved well',
    reviewText: "Found ants in the kitchen first day. Pest control came within 4 hours and it was sorted. Took half a star but the recovery was great.",
    submittedAt: '2026-03-22T15:30:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Camille — preventive treatment is now on a quarterly schedule. Thank you.',
    replySentAt: '2026-03-22T17:00:00',
  }),
  r({
    id: 'rv-024', externalId: 'reva-rv-024', channel: 'airbnb',
    propertyCode: 'KS-5', guestName: 'Mateo Silva', guestInitials: 'MS',
    rating: 5, title: 'Honeymoon perfection',
    reviewText: "Quiet, scenic, the chef night made our trip. We can't recommend enough.",
    submittedAt: '2026-03-18T19:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Mateo — congratulations. Friday awaits whenever.',
    replySentAt: '2026-03-18T20:14:00',
  }),
  r({
    id: 'rv-025', externalId: 'reva-rv-025', channel: 'booking',
    propertyCode: 'LB-2', guestName: 'Anna Schmidt', guestInitials: 'AS',
    rating: 3, title: 'Linen quality below expectations',
    reviewText: "Sheets felt thin and one set had a small tear. Otherwise the property is beautiful and the location is excellent.",
    submittedAt: '2026-03-14T10:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Anna — fair flag. We refreshed the linen rotation across the portfolio this week.',
    replySentAt: '2026-03-14T11:20:00',
    privateFeedback: 'Linen rotation: replace any set entering year 3 of service.',
  }),
  r({
    id: 'rv-026', externalId: 'reva-rv-026', channel: 'direct',
    propertyCode: 'VV-47', guestName: 'Jonas Lindqvist', guestInitials: 'JL',
    rating: 5, title: 'Repeat visit, even better',
    reviewText: "Third time at Friday. Each visit raises the bar. The driver and concierge service is unmatched in Mauritius.",
    submittedAt: '2026-03-10T14:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Jonas — your usual room is held for September.',
    replySentAt: '2026-03-10T15:00:00',
  }),
  r({
    id: 'rv-027', externalId: 'reva-rv-027', channel: 'airbnb',
    propertyCode: 'BL-12', guestName: 'Hugo Lefèvre', guestInitials: 'HL',
    rating: 4, title: 'Wifi dropouts',
    reviewText: "Wifi dropped a few times during work hours. Otherwise faultless. The pool is exceptional.",
    submittedAt: '2026-03-05T11:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Hugo — router refresh shipped this week. Thank you for the data.',
    replySentAt: '2026-03-05T12:14:00',
  }),

  // ───── Last 90 days (Jan 27 – Feb 27) ─────
  r({
    id: 'rv-028', externalId: 'reva-rv-028', channel: 'airbnb',
    propertyCode: 'GBH-C8', guestName: 'Yuki Sato', guestInitials: 'YS',
    rating: 5, title: 'Beach paradise',
    reviewText: "30 seconds to the sand, kitchen well-stocked, communication impeccable. We'll be back every year.",
    submittedAt: '2026-02-22T10:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Yuki — we look forward to it.',
    replySentAt: '2026-02-22T11:00:00',
  }),
  r({
    id: 'rv-029', externalId: 'reva-rv-029', channel: 'vrbo',
    propertyCode: 'PT-3', guestName: 'Robert Klein', guestInitials: 'RK',
    rating: 4, title: 'Great little house',
    reviewText: "Great location, very clean, hot water was a touch sluggish in the morning. Small thing.",
    submittedAt: '2026-02-15T08:00:00', sentiment: 'mixed', replyStatus: 'sent',
    replyText: 'Robert — boiler is being upgraded. Appreciated.',
    replySentAt: '2026-02-15T09:18:00',
  }),
  r({
    id: 'rv-030', externalId: 'reva-rv-030', channel: 'airbnb',
    propertyCode: 'SD-10', guestName: 'Ines Nogueira', guestInitials: 'IN',
    rating: 5, title: 'Better than 5 stars',
    reviewText: "Genuinely the best stay we've had anywhere. The level of attention is something else. Friday is our annual tradition now.",
    submittedAt: '2026-02-03T13:00:00', sentiment: 'positive', replyStatus: 'sent',
    replyText: 'Ines — appreciated. Annual tradition locked.',
    replySentAt: '2026-02-03T14:14:00',
  }),
];

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

export const REVIEW_TAGS: ReviewTag[] = [
  // rv-001
  T('rv-001', 'Welcome touches', 'positive'),
  T('rv-001', 'Driver', 'positive'),
  T('rv-001', 'Family friendly', 'positive'),
  // rv-002
  T('rv-002', 'AC issues', 'negative'),
  T('rv-002', 'Communication', 'positive'),
  T('rv-002', 'Design', 'positive'),
  // rv-003
  T('rv-003', 'Spotless', 'positive'),
  T('rv-003', 'Beach access', 'positive'),
  T('rv-003', 'Communication', 'positive'),
  T('rv-003', 'Welcome touches', 'positive'),
  // rv-004
  T('rv-004', 'Slow check-in', 'negative'),
  T('rv-004', 'Design', 'positive'),
  // rv-005
  T('rv-005', 'Chef service', 'positive'),
  T('rv-005', 'Pool', 'positive'),
  T('rv-005', 'Family friendly', 'positive'),
  // rv-006
  T('rv-006', 'Design', 'positive'),
  T('rv-006', 'Quiet', 'positive'),
  // rv-007
  T('rv-007', 'Slow check-in', 'negative'),
  T('rv-007', 'Communication', 'negative'),
  // rv-008
  T('rv-008', 'Welcome touches', 'positive'),
  T('rv-008', 'Beach access', 'positive'),
  T('rv-008', 'Concierge', 'positive'),
  // rv-009
  T('rv-009', 'Communication', 'positive'),
  T('rv-009', 'Concierge', 'positive'),
  // rv-010
  T('rv-010', 'Welcome touches', 'negative'),
  T('rv-010', 'Family friendly', 'positive'),
  // rv-011
  T('rv-011', 'FF&E', 'negative'),
  T('rv-011', 'Design', 'positive'),
  // rv-012
  T('rv-012', 'Quiet', 'positive'),
  T('rv-012', 'View', 'positive'),
  T('rv-012', 'Chef service', 'positive'),
  // rv-013
  T('rv-013', 'AC issues', 'negative'),
  T('rv-013', 'Wifi issues', 'negative'),
  T('rv-013', 'Communication', 'positive'),
  // rv-014
  T('rv-014', 'Spotless', 'positive'),
  T('rv-014', 'Welcome touches', 'positive'),
  // rv-015
  T('rv-015', 'Smell', 'negative'),
  T('rv-015', 'Communication', 'positive'),
  // rv-016
  T('rv-016', 'Spotless', 'positive'),
  T('rv-016', 'Quiet', 'positive'),
  T('rv-016', 'Beach access', 'positive'),
  T('rv-016', 'Welcome touches', 'positive'),
  // rv-017
  T('rv-017', 'Coffee machine', 'negative'),
  T('rv-017', 'Pool', 'positive'),
  // rv-018
  T('rv-018', 'Design', 'positive'),
  T('rv-018', 'Driver', 'positive'),
  T('rv-018', 'Family friendly', 'positive'),
  // rv-019
  T('rv-019', 'FF&E', 'negative'),
  // rv-020
  T('rv-020', 'Family friendly', 'positive'),
  T('rv-020', 'Welcome touches', 'positive'),
  // rv-021
  T('rv-021', 'Pool maintenance', 'negative'),
  // rv-022
  T('rv-022', 'Communication', 'positive'),
  // rv-023
  T('rv-023', 'Bugs', 'negative'),
  T('rv-023', 'Communication', 'positive'),
  // rv-024
  T('rv-024', 'Quiet', 'positive'),
  T('rv-024', 'View', 'positive'),
  T('rv-024', 'Chef service', 'positive'),
  // rv-025
  T('rv-025', 'Linen quality', 'negative'),
  T('rv-025', 'Great location', 'positive'),
  // rv-026
  T('rv-026', 'Driver', 'positive'),
  T('rv-026', 'Concierge', 'positive'),
  // rv-027
  T('rv-027', 'Wifi issues', 'negative'),
  T('rv-027', 'Pool', 'positive'),
  // rv-028
  T('rv-028', 'Beach access', 'positive'),
  T('rv-028', 'Communication', 'positive'),
  // rv-029
  T('rv-029', 'Hot water', 'negative'),
  T('rv-029', 'Great location', 'positive'),
  // rv-030
  T('rv-030', 'Concierge', 'positive'),
  T('rv-030', 'Welcome touches', 'positive'),
];

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
export const STAFF_REVIEW_LINKS: StaffReviewLink[] = [
  sl('rv-001', 'u-catherine', 'cleaner', 'bzw-tk-rc15-426', '2026-04-26'),
  sl('rv-002', 'u-alex', 'cleaner', 'bzw-tk-lc9-424', '2026-04-24'),
  sl('rv-003', 'u-catherine', 'cleaner', 'bzw-tk-gbh8-422', '2026-04-22'),
  sl('rv-003', 'u-franny', 'inspector', 'bzw-tk-gbh8-i422', '2026-04-22'),
  sl('rv-004', 'u-mary', 'cleaner', 'bzw-tk-bs1-421', '2026-04-21'),
  sl('rv-005', 'u-catherine', 'cleaner', 'bzw-tk-bl12-420', '2026-04-20'),
  sl('rv-005', 'u-alex', 'inspector', 'bzw-tk-bl12-i420', '2026-04-20'),
  sl('rv-006', 'u-mary', 'cleaner', 'bzw-tk-vv47-418', '2026-04-18'),
  sl('rv-007', 'u-mary', 'cleaner', 'bzw-tk-sd10-417', '2026-04-17'),
  sl('rv-008', 'u-alex', 'cleaner', 'bzw-tk-gbh3-416', '2026-04-16'),
  sl('rv-009', 'u-catherine', 'cleaner', 'bzw-tk-vv47-415', '2026-04-15'),
  sl('rv-010', 'u-alex', 'cleaner', 'bzw-tk-pt3-414', '2026-04-14'),
  sl('rv-011', 'u-mary', 'cleaner', 'bzw-tk-lc9-413', '2026-04-13'),
  sl('rv-012', 'u-catherine', 'cleaner', 'bzw-tk-ks5-412', '2026-04-12'),
  sl('rv-012', 'u-franny', 'inspector', 'bzw-tk-ks5-i412', '2026-04-12'),
  sl('rv-013', 'u-mary', 'cleaner', 'bzw-tk-lb2-411', '2026-04-11'),
  sl('rv-014', 'u-catherine', 'cleaner', 'bzw-tk-bl12-410', '2026-04-10'),
  sl('rv-015', 'u-alex', 'cleaner', 'bzw-tk-bcna-409', '2026-04-09'),
  sl('rv-016', 'u-catherine', 'cleaner', 'bzw-tk-gbh8-408', '2026-04-08'),
  sl('rv-017', 'u-mary', 'cleaner', 'bzw-tk-rc15-407', '2026-04-07'),
  sl('rv-018', 'u-alex', 'cleaner', 'bzw-tk-sd10-406', '2026-04-06'),
  sl('rv-019', 'u-mary', 'cleaner', 'bzw-tk-pt3-405', '2026-04-05'),
  sl('rv-020', 'u-catherine', 'cleaner', 'bzw-tk-vv47-403', '2026-04-03'),
  sl('rv-021', 'u-alex', 'cleaner', 'bzw-tk-lv10-401', '2026-04-01'),
  sl('rv-022', 'u-catherine', 'cleaner', 'bzw-tk-gbh3-323', '2026-03-23'),
  sl('rv-023', 'u-mary', 'cleaner', 'bzw-tk-bs1-320', '2026-03-20'),
  sl('rv-024', 'u-catherine', 'cleaner', 'bzw-tk-ks5-316', '2026-03-16'),
  sl('rv-025', 'u-alex', 'cleaner', 'bzw-tk-lb2-312', '2026-03-12'),
  sl('rv-026', 'u-mary', 'cleaner', 'bzw-tk-vv47-308', '2026-03-08'),
  sl('rv-027', 'u-catherine', 'cleaner', 'bzw-tk-bl12-303', '2026-03-03'),
  sl('rv-028', 'u-alex', 'cleaner', 'bzw-tk-gbh8-220', '2026-02-20'),
  sl('rv-029', 'u-mary', 'cleaner', 'bzw-tk-pt3-213', '2026-02-13'),
  sl('rv-030', 'u-catherine', 'cleaner', 'bzw-tk-sd10-201', '2026-02-01'),
];

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

export const SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    id: 'sa-001', reviewId: 'rv-002',
    taskTitle: 'AC unit replacement at LC-9 master bedroom',
    taskDescription: 'Henrik flagged AC outage on day 2 of stay; parts took 36h. Replace unit now to prevent repeat with incoming guest.',
    department: 'maintenance', subdepartment: 'aircon', priority: 'high',
    reasoning: 'AC issues tag + 3-star rating + complaint about parts ETA',
  },
  {
    id: 'sa-002', reviewId: 'rv-015',
    taskTitle: 'BCN-A drain trap replacement (kitchen)',
    taskDescription: 'Lukas left a day early due to persistent kitchen drain smell. Replace drain trap before next booking on May 3.',
    department: 'maintenance', subdepartment: 'plumbing', priority: 'urgent',
    reasoning: 'Smell tag + 2-star rating + early-departure flag',
  },
  {
    id: 'sa-003', reviewId: 'rv-021',
    taskTitle: 'Tighten LV-10 pool service interval to 7 days',
    taskDescription: "Olivia found algae on day 1. Confirm interval is 7d not 9d, brief the vendor.",
    department: 'maintenance', subdepartment: 'pool', priority: 'medium',
    reasoning: 'Pool maintenance tag + 3-star rating',
  },
  {
    id: 'sa-004', reviewId: 'rv-017',
    taskTitle: 'Descale RC-15 coffee machine',
    taskDescription: 'Tomás flagged descaling overdue. 15-min job, do before Saturday turnover.',
    department: 'cleaning', subdepartment: 'amenities', priority: 'low',
    reasoning: 'Coffee machine tag + at-this-price-it-stands-out sentiment',
  },
];

/** Anomaly callouts shown above OverviewPage. Phase 1 hand-crafted, Phase 2
 *  pattern-detected from rolling sub-rating means. */
export interface Anomaly {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'danger';
}

export const REVIEW_ANOMALIES: Anomaly[] = [
  {
    id: 'an-001', severity: 'warn',
    title: 'Cleanliness rating dropped 0.3 vs last month',
    body: "Last 30 days: 4.4 avg cleanliness. Prior 30 days: 4.7. Drag is concentrated at LB-2 and BCN-A — both north-zone, both Mary-cleaned. Worth a 1:1 before Mary's last day on May 25.",
  },
  {
    id: 'an-002', severity: 'info',
    title: 'Welcome-touches mentions doubled in 30 days',
    body: 'From 4 mentions in March to 9 mentions in April. Catherine\'s welcome-basket protocol seems to be the driver. Codify into the standard pre-arrival checklist.',
  },
  {
    id: 'an-003', severity: 'danger',
    title: 'BCN-A on watch — 2 reviews in 60 days, 3.0 avg',
    body: 'Drain-smell incident plus a previous Wifi complaint. Property is at risk of slipping into Reva\'s low-activity threshold AND a low-rating cluster simultaneously. Schedule a full property pass.',
  },
];
