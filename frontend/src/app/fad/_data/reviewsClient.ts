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

export function transformGuestyReview(raw: Record<string, unknown>): Review {
  const guestName = String(
    (raw.guestName as string) ||
      ((raw.guest as Record<string, unknown>)?.fullName as string) ||
      (raw.author as string) ||
      'Guest',
  );
  const rating = Number(raw.overallRating ?? raw.rating ?? raw.stars ?? 0);
  const channel = mapChannel(raw.channel ?? raw.source ?? raw.platform);
  const propertyCode = String(
    raw.propertyCode ||
      raw.listingNickname ||
      ((raw.listing as Record<string, unknown>)?.nickname as string) ||
      raw.listingId ||
      '???',
  );
  const response = (raw.response as Record<string, unknown>) || {};
  const replied = !!(response.text || raw.reply || raw.respondedAt);
  const sub = (raw.subRatings as Record<string, number>) || {};

  return {
    id: String(raw._id || raw.id || raw.externalId || `rv-live-${Math.random().toString(36).slice(2, 10)}`),
    externalId: String(raw._id || raw.externalId || raw.id || ''),
    channel,
    channelReviewId: (raw.channelReviewId as string) || (raw.externalReviewId as string),
    channelUrl: (raw.channelUrl as string) || (raw.publicUrl as string),
    reservationId:
      (raw.reservationId as string) || ((raw.reservation as Record<string, unknown>)?._id as string),
    propertyCode,
    cohort: PROPERTY_COHORT[propertyCode] ?? 'flic_en_flac',
    guestName,
    guestInitials: initials(guestName),
    rating,
    subRatings: {
      accuracy: Number(sub.accuracy ?? rating),
      checkin: Number(sub.checkin ?? rating),
      cleanliness: Number(sub.cleanliness ?? rating),
      communication: Number(sub.communication ?? rating),
      location: Number(sub.location ?? rating),
      value: Number(sub.value ?? rating),
    },
    title: String(raw.title || ''),
    reviewText: String(raw.publicReview || raw.comments || raw.text || raw.body || ''),
    submittedAt: String(raw.submittedAt || raw.createdAt || raw.date || new Date().toISOString()),
    sentiment: rating >= 4.5 ? 'positive' : rating >= 3 ? 'mixed' : 'negative',
    replyStatus: replied ? 'sent' : 'unreplied',
    replyText: (response.text as string) || (raw.reply as string),
    replySentAt: (response.sentAt as string) || (raw.respondedAt as string),
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
