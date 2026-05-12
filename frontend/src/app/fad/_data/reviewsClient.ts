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

// Guesty Open-API review shape (verified 2026-05-12 via /v1/reviews):
//   top level: _id, channelId, externalReviewId, guestId, listingId,
//              externalListingId, externalReservationId, reservationId,
//              createdAt, updatedAt, reviewReplies[]
//   rawReview: { id, reviewer_role, reviewer_id, reviewee_role, reviewee_id,
//                listing_id, reservation_confirmation_code, hidden, submitted,
//                overall_rating, public_review, category_ratings[],
//                category_ratings_cleanliness, _accuracy, _checkin,
//                _communication, _location, _value, submitted_at, ... }
//
// guestName is NOT in the response — Guesty returns only guestId. To get the
// real name we'd need a separate /guests/:id call per review (heavy). For v1
// we display "Guest" + last-6-of-guestId so each card is distinguishable.
// Channel detection lives in channelId (opaque ID) — collapsed to 'direct'
// until we map Guesty's channel UUIDs to our enum.

export function transformGuestyReview(raw: Record<string, unknown>): Review {
  const rawReview = (raw.rawReview as Record<string, unknown>) || {};
  const rating = Number(rawReview.overall_rating ?? raw.overallRating ?? raw.rating ?? 0);

  // Guest fallback name: "Guest a3c0bec" — gives each card a unique label
  // until guest-lookup ships.
  const guestId = String(raw.guestId || '');
  const guestName = guestId ? `Guest ${guestId.slice(-6)}` : 'Guest';

  const propertyCode = String(
    raw.externalListingId || raw.listingId || rawReview.listing_id || '???',
  );

  const replies = (raw.reviewReplies as unknown[]) || [];
  const replied = Array.isArray(replies) && replies.length > 0;
  const firstReply = replied ? (replies[0] as Record<string, unknown>) : {};

  return {
    id: String(raw._id || rawReview.id || `rv-live-${Math.random().toString(36).slice(2, 10)}`),
    externalId: String(raw.externalReviewId || rawReview.id || raw._id || ''),
    channel: mapChannel(raw.channelId ?? raw.channel),
    channelReviewId: (raw.externalReviewId as string) || (rawReview.id as string),
    channelUrl: undefined,
    reservationId: raw.reservationId ? String(raw.reservationId) : undefined,
    propertyCode,
    cohort: PROPERTY_COHORT[propertyCode] ?? 'flic_en_flac',
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
    title: '', // Guesty reviews don't have a separate title field
    reviewText: String(rawReview.public_review || ''),
    submittedAt: String(
      rawReview.submitted_at || rawReview.first_completed_at || raw.createdAt || new Date().toISOString(),
    ),
    sentiment: rating >= 4.5 ? 'positive' : rating >= 3 ? 'mixed' : 'negative',
    replyStatus: replied ? 'sent' : 'unreplied',
    replyText: (firstReply.text as string) || undefined,
    replySentAt: (firstReply.created_at as string) || undefined,
  };
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
