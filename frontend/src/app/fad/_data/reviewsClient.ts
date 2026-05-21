'use client';

// Live reviews fetched from /api/reviews/list (FAD backend → Guesty).
// Coexists with the fixture REVIEWS export in reviews.ts; sub-pages migrate
// to useLiveReviews() at their own pace (Overview + AllReviews ship in bw-4).
//
// Guesty's exact review payload is undocumented in our codebase. The
// transformer is best-effort with multiple field-name fallbacks; iterate as
// real responses surface in dev. Missing fields default to neutral values
// rather than throwing, so the UI never crashes on a malformed entry.

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../components/types';
import type { Review, ReviewChannel } from './reviews';
import { PROPERTY_COHORT } from './reviews';

function mapChannel(raw: unknown): ReviewChannel {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking') || s.includes('bdc')) return 'booking';
  if (s.includes('vrbo')) return 'vrbo';
  if (s.includes('google')) return 'google';
  return 'direct';
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

// Guesty Open-API review payload differs by channel. Verified 2026-05-12.
//
// AIRBNB (channelId="airbnb2"): 1-5 rating scale, no reviewer name in payload.
//   rawReview: { overall_rating, public_review, submitted_at,
//                category_ratings_cleanliness/accuracy/checkin/communication/
//                location/value, reservation_confirmation_code,
//                reviewer_role, reviewer_id (numeric), ... }
//
// BOOKING.COM (channelId="bookingCom"): 1-10 rating scale, REVIEWER NAME
//   INCLUDED. Different field names entirely.
//   rawReview: { review_id, created_timestamp, last_change_timestamp,
//                content: { headline, positive, negative, language_code },
//                scoring: { review_score (1-10), clean, comfort, facilities,
//                           location, staff, value },
//                reviewer: { name, country_code, is_genius },
//                reply: null | { ... }, url, reservation_id }
//
// Shared top-level: _id, channelId, externalReviewId, guestId, listingId,
//   externalListingId, externalReservationId, reservationId, reviewReplies[],
//   createdAt, updatedAt.

// Airbnb provides no guest name — only a numeric reviewer_id. Falls back to
// "Guest {last-6-of-guestId}" per card; full-name lookup would require a
// separate /guests/:id call per review (deferred).
function transformAirbnb(raw: Record<string, unknown>, rawReview: Record<string, unknown>): Review {
  const rating = Number(rawReview.overall_rating ?? 0);
  const guestId = String(raw.guestId || '');
  const guestName = guestId ? `Guest ${guestId.slice(-6)}` : 'Guest';
  // propertyNickname is enriched server-side from the Guesty listings index
  // (= friendly code like "MV-7"). Falls back to raw channel listing ID
  // when the listing isn't in Guesty's catalogue or the join didn't resolve.
  const propertyCode = String(raw.propertyNickname || raw.externalListingId || raw.listingId || '???');
  const replies = (raw.reviewReplies as unknown[]) || [];
  const replied = Array.isArray(replies) && replies.length > 0;
  const firstReply = replied ? (replies[0] as Record<string, unknown>) : {};

  return {
    id: String(raw._id || rawReview.id || `rv-${Math.random().toString(36).slice(2, 10)}`),
    externalId: String(raw.externalReviewId || rawReview.id || ''),
    channel: 'airbnb',
    channelReviewId: (raw.externalReviewId as string) || undefined,
    channelUrl: undefined,
    reservationId: raw.reservationId ? String(raw.reservationId) : undefined,
    propertyCode,
    cohort: (raw.propertyCohort as Review['cohort']) ?? PROPERTY_COHORT[propertyCode] ?? 'other',
    guestName,
    guestInitials: initials(guestName),
    rating,
    subRatings: {
      accuracy: Number(rawReview.category_ratings_accuracy ?? rating),
      checkin: Number(rawReview.category_ratings_checkin ?? rating),
      cleanliness: Number(rawReview.category_ratings_cleanliness ?? rating),
      communication: Number(rawReview.category_ratings_communication ?? rating),
      location: Number(rawReview.category_ratings_location ?? rating),
      value: Number(rawReview.category_ratings_value ?? rating),
    },
    title: '',
    reviewText: String(rawReview.public_review || ''),
    submittedAt: String(rawReview.submitted_at || rawReview.first_completed_at || raw.createdAt || new Date().toISOString()),
    sentiment: rating >= 4.5 ? 'positive' : rating >= 3 ? 'mixed' : 'negative',
    replyStatus: replied ? 'sent' : 'unreplied',
    replyText: (firstReply.text as string) || undefined,
    replySentAt: (firstReply.created_at as string) || undefined,
  };
}

// Booking.com: 1-10 scale → divide by 2 for FAD's 1-5. Reviewer name IS in
// payload. Content split into headline/positive/negative — combine for a
// readable reviewText. Sub-rating keys don't map 1:1 with FAD's:
//   FAD          ← Booking
//   cleanliness  ← clean
//   value        ← value
//   location     ← location
//   communication ← staff
//   accuracy     ← (no match — use overall)
//   checkin      ← (no match — use overall)
function transformBooking(raw: Record<string, unknown>, rawReview: Record<string, unknown>): Review {
  const scoring = (rawReview.scoring as Record<string, number>) || {};
  const overall10 = Number(scoring.review_score ?? 0);
  const rating = overall10 / 2; // 1-10 → 1-5

  const reviewer = (rawReview.reviewer as Record<string, unknown>) || {};
  const guestName = String(reviewer.name || 'Guest');

  const content = (rawReview.content as Record<string, unknown>) || {};
  const headline = String(content.headline || '');
  const positive = String(content.positive || '');
  const negative = String(content.negative || '');
  const reviewText = [
    positive ? `👍 ${positive}` : '',
    negative ? `👎 ${negative}` : '',
  ].filter(Boolean).join('\n\n');

  const replied = !!rawReview.reply;
  const reply = (rawReview.reply as Record<string, unknown>) || {};

  const propertyCode = String(raw.propertyNickname || raw.externalListingId || raw.listingId || '???');
  const normSub = (v: unknown): number => (v != null ? Number(v) / 2 : rating);

  return {
    id: String(raw._id || rawReview.review_id || `rv-${Math.random().toString(36).slice(2, 10)}`),
    externalId: String(raw.externalReviewId || rawReview.review_id || ''),
    channel: 'booking',
    channelReviewId: (raw.externalReviewId as string) || undefined,
    channelUrl: (rawReview.url as string) || undefined,
    reservationId: raw.reservationId ? String(raw.reservationId) : undefined,
    propertyCode,
    cohort: (raw.propertyCohort as Review['cohort']) ?? PROPERTY_COHORT[propertyCode] ?? 'other',
    guestName,
    guestInitials: initials(guestName),
    rating,
    subRatings: {
      accuracy: rating,
      checkin: rating,
      cleanliness: normSub(scoring.clean),
      communication: normSub(scoring.staff),
      location: normSub(scoring.location),
      value: normSub(scoring.value),
    },
    title: headline,
    reviewText,
    submittedAt: String(rawReview.created_timestamp || raw.createdAt || new Date().toISOString()),
    sentiment: rating >= 4.5 ? 'positive' : rating >= 3 ? 'mixed' : 'negative',
    replyStatus: replied ? 'sent' : 'unreplied',
    replyText: (reply.text as string) || undefined,
    replySentAt: (reply.timestamp as string) || (reply.created_at as string) || undefined,
  };
}

export function transformGuestyReview(raw: Record<string, unknown>): Review {
  const rawReview = (raw.rawReview as Record<string, unknown>) || {};
  const channelId = String(raw.channelId || '').toLowerCase();

  if (channelId.includes('booking')) {
    return transformBooking(raw, rawReview);
  }
  // Default to Airbnb shape — also handles vrbo (similar Airbnb-style payload).
  return transformAirbnb(raw, rawReview);
}

export async function loadReviewsLive(): Promise<Review[]> {
  const data = await apiFetch('/api/reviews/list');
  const raw = (data?.results || data?.reviews || data?.data || (Array.isArray(data) ? data : [])) as Record<string, unknown>[];
  return raw.map(transformGuestyReview);
}

export interface UseLiveReviewsResult {
  reviews: Review[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiveReviews(): UseLiveReviewsResult {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadReviewsLive()
      .then((list) => setReviews(list))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reviews'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reviews, loading, error, refetch };
}
