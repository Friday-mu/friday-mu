'use client';

// Live conversations + thread detail fetched from /api/inbox/* (FAD backend
// → GMS). Coexists with the INBOX_THREADS fixture in fixtures.ts; the inbox
// UI migrates to useLiveConversations() / useThreadDetail() at its own pace
// (InboxModule wiring lands in bw-6).
//
// Adapter philosophy: GMS owns the data, FAD owns the display shape. The
// transformer narrows GMS's broader record into FAD's InboxThread interface
// with neutral fallbacks so a malformed entry never crashes the page.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { InboxThread, InboxMessage, InboxChannel, InboxReservation } from './fixtures';

// ───────── enum mappers ─────────

function mapChannelKey(channel: unknown): InboxChannel {
  const s = String(channel ?? '').toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking') || s === 'bdc' || s === 'bookingcom') return 'booking';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s === 'mail') return 'email';
  if (s.includes('vrbo')) return 'airbnb'; // FAD enum has no vrbo; collapse to airbnb visually
  return 'email';
}

function mapTriage(status: unknown): InboxThread['triageStatus'] {
  const s = String(status ?? '').toLowerCase();
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'snoozed' || s === 'review') return 'review';
  if (s === 'spam') return 'done';
  return 'open';
}

function mapUrgent(sentiment: unknown, urgencyScore: number | undefined): InboxThread['urgent'] {
  const s = String(sentiment ?? '').toLowerCase();
  if (urgencyScore !== undefined && urgencyScore >= 0.8) return 'red';
  if (s === 'negative') return 'red';
  if (s === 'mixed' || (urgencyScore !== undefined && urgencyScore >= 0.5)) return 'amber';
  return undefined;
}

function mapSentiment(s: unknown): InboxThread['sentiment'] {
  const v = String(s ?? '').toLowerCase();
  if (v === 'positive') return 'positive';
  if (v === 'negative') return 'negative';
  if (v === 'urgent') return 'urgent';
  return 'neutral';
}

function mapLanguage(lang: unknown): InboxThread['language'] {
  const v = String(lang ?? 'en').toLowerCase().slice(0, 2);
  if (v === 'fr') return 'FR';
  if (v === 'pt') return 'PT';
  if (v === 'it') return 'IT';
  if (v === 'nl') return 'NL';
  return 'EN';
}

function channelLabel(key: InboxChannel): string {
  return {
    airbnb: 'Airbnb',
    booking: 'Booking',
    whatsapp: 'WhatsApp',
    email: 'Email',
    owner_email: 'Owner email',
    owner_whatsapp: 'Owner WhatsApp',
    vendor_breezeway: 'Breezeway',
    vendor_driver: 'Driver',
    vendor_chef: 'Chef',
  }[key];
}

// ───────── shape adapters ─────────
//
// Real GMS conversation shape (verified 2026-05-12):
//   list (GET /api/inbox/conversations) returns { conversations: [...], total }.
//   Each conversation row: id, guesty_conversation_id, guesty_reservation_id,
//     property_id, guest_name, guest_email, property_name, channel, status
//     (active|done|spam|snoozed), last_message_at, check_in_date,
//     check_out_date, num_guests, notes, conversation_summary, created_at,
//     updated_at, reservation_id, first_response_minutes, sentiment,
//     last_detected_language, latest_draft_state, latest_draft_id,
//     latest_draft_confidence, inbound_count, last_message_body,
//     last_message_direction, is_unread.
//
//   detail (GET /api/inbox/conversations/:id) returns BUNDLE:
//     { conversation, messages, drafts, reservation, whatsapp_window_open,
//       whatsapp_window_expires_at, available_channels, recommended_channel,
//       seen_by }
//   No separate /messages call needed.
//
// Real GMS message shape: id, conversation_id, guesty_message_id, direction
//   ('inbound'|'outbound'), body, original_language, translated_body,
//   sender_name, created_at, sentiment, is_auto_response, sent_by,
//   sent_via_system, attachments, module_type.

function transformGmsMessage(raw: Record<string, unknown>): InboxMessage {
  const direction = String(raw.direction ?? 'inbound');
  // Prefer translated_body (English) when available; falls back to original.
  // Translation toggle in the UI can show the original later (bw-8 wiring).
  const body = String(raw.translated_body || raw.body || '');
  return {
    from: direction === 'outbound' ? 'us' : 'them',
    name: String(raw.sender_name || (direction === 'outbound' ? 'Friday' : 'Guest')),
    time: String(raw.created_at || new Date().toISOString()),
    body,
  };
}

interface WhatsAppWindowInfo {
  open: boolean;
  expiresAt?: string;
}

function transformGmsReservation(raw: Record<string, unknown>): InboxReservation {
  const num = (v: unknown): number | undefined =>
    v == null ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    id: String(raw.id || raw.guesty_reservation_id || ''),
    guestyReservationId: raw.guesty_reservation_id ? String(raw.guesty_reservation_id) : undefined,
    listingName: raw.listing_name ? String(raw.listing_name) : undefined,
    status: raw.status ? String(raw.status) : undefined,
    channel: raw.channel ? String(raw.channel) : (raw.source ? String(raw.source) : undefined),
    checkIn: raw.check_in ? String(raw.check_in) : undefined,
    checkOut: raw.check_out ? String(raw.check_out) : undefined,
    numberOfNights: num(raw.number_of_nights),
    numGuests: num(raw.num_guests),
    guestName: raw.guest_name ? String(raw.guest_name) : undefined,
    guestEmail: raw.guest_email ? String(raw.guest_email) : undefined,
    guestPhone: raw.guest_phone ? String(raw.guest_phone) : undefined,
    totalPrice: num(raw.total_price),
    currency: raw.currency ? String(raw.currency) : undefined,
    cleaningFee: num(raw.cleaning_fee),
    nightlyRate: num(raw.nightly_rate),
    specialRequests: raw.special_requests ? String(raw.special_requests) : undefined,
  };
}

export function transformGmsConversation(
  raw: Record<string, unknown>,
  messagesRaw?: Record<string, unknown>[],
  waWindow?: WhatsAppWindowInfo,
  reservationRaw?: Record<string, unknown>,
): InboxThread {
  const channelKey = mapChannelKey(raw.channel ?? raw.communication_channel);
  const status = raw.status;
  const sentiment = raw.sentiment;
  const confidence = typeof raw.latest_draft_confidence === 'number'
    ? raw.latest_draft_confidence
    : undefined;
  // Treat low-confidence drafts as "amber" urgency signal alongside sentiment.
  // (1 - confidence) gives an urgency proxy; 0.5+ confidence-gap → amber.
  const draftUrgency = confidence !== undefined ? 1 - confidence : undefined;

  const preview = String(raw.last_message_body || raw.conversation_summary || '').slice(0, 200);
  const summary = raw.conversation_summary ? String(raw.conversation_summary) : undefined;
  // GMS has no subject field — guests just send messages. Use summary as
  // "subject line" when present; fall back to first 80 chars of preview.
  const subject = summary
    ? summary.split(/[.!?]/)[0].slice(0, 100)
    : (preview ? preview.slice(0, 80) : '(no subject)');

  const messages: InboxMessage[] | undefined = messagesRaw
    ? messagesRaw.map(transformGmsMessage)
    : undefined;

  // WhatsApp window: GMS gives `whatsapp_window_open` (bool) +
  // `whatsapp_window_expires_at` (ISO timestamp). Convert to "minutes until
  // expiry" for the existing FAD UI chip.
  let whatsappWindow: InboxThread['whatsappWindow'];
  if (channelKey === 'whatsapp' && waWindow) {
    let expiresInMinutes: number | undefined;
    if (waWindow.expiresAt) {
      const ms = new Date(waWindow.expiresAt).getTime() - Date.now();
      expiresInMinutes = Math.max(0, Math.round(ms / 60_000));
    }
    whatsappWindow = { open: waWindow.open, expiresInMinutes };
  }

  return {
    id: String(raw.id || `conv-${Math.random().toString(36).slice(2, 9)}`),
    unread: Boolean(raw.is_unread),
    urgent: mapUrgent(sentiment, draftUrgency),
    guest: String(raw.guest_name || 'Guest'),
    subject,
    preview,
    channel: channelLabel(channelKey),
    entity: 'guest',
    channelKey,
    property: String(raw.property_name || ''),
    time: String(raw.last_message_at || raw.updated_at || raw.created_at || new Date().toISOString()),
    triageStatus: mapTriage(status),
    stayStatus: undefined, // could derive from reservation.check_in/out_date in detail view
    reservationId: raw.reservation_id ? String(raw.reservation_id) : undefined,
    mentionsMe: false, // GMS has no @-mention concept yet
    messages,
    summary,
    sentiment: mapSentiment(sentiment),
    language: mapLanguage(raw.last_detected_language),
    whatsappWindow,
    reservation: reservationRaw ? transformGmsReservation(reservationRaw) : undefined,
  };
}

// ───────── load functions ─────────

interface ConvListResp {
  conversations?: unknown;
  total?: number;
}

interface ConvDetailResp {
  conversation: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  drafts?: Record<string, unknown>[];
  reservation?: Record<string, unknown>;
  whatsapp_window_open?: boolean;
  whatsapp_window_expires_at?: string;
}

export async function loadConversations(): Promise<InboxThread[]> {
  const data = await apiFetch('/api/inbox/conversations') as ConvListResp;
  const raw = (data?.conversations || []) as Record<string, unknown>[];
  return raw.map((c) => transformGmsConversation(c));
}

export async function loadThreadDetail(id: string): Promise<InboxThread> {
  // GMS /:id bundles conversation + messages + drafts + reservation +
  // whatsapp window state in one response. No separate fetch needed.
  const data = await apiFetch(`/api/inbox/conversations/${id}`) as ConvDetailResp;
  const conv = data.conversation || {};
  const messages = data.messages || [];
  const waWindow: WhatsAppWindowInfo = {
    open: !!data.whatsapp_window_open,
    expiresAt: data.whatsapp_window_expires_at,
  };
  return transformGmsConversation(conv, messages, waWindow, data.reservation);
}

// ───────── hooks ─────────

export interface UseLiveConversationsResult {
  threads: InboxThread[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiveConversations(): UseLiveConversationsResult {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadConversations()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load inbox'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { threads, loading, error, refetch };
}

export interface UseThreadDetailResult {
  thread: InboxThread | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useThreadDetail(threadId: string | null): UseThreadDetailResult {
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!threadId) {
      setThread(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadThreadDetail(threadId)
      .then(setThread)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load thread'))
      .finally(() => setLoading(false));
  }, [threadId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { thread, loading, error, refetch };
}
