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
import type { InboxThread, InboxMessage, InboxChannel } from './fixtures';

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

function transformGmsMessage(raw: Record<string, unknown>): InboxMessage {
  const direction = String(raw.direction ?? 'inbound');
  return {
    from: direction === 'outbound' ? 'us' : 'them',
    name: String(raw.author_name || raw.guest_name || raw.from_name || (direction === 'outbound' ? 'Friday' : 'Guest')),
    time: String(raw.created_at || raw.timestamp || new Date().toISOString()),
    body: String(raw.translated_body || raw.body || raw.content || ''),
  };
}

export function transformGmsConversation(
  raw: Record<string, unknown>,
  messagesRaw?: Record<string, unknown>[],
): InboxThread {
  const channelKey = mapChannelKey(raw.channel ?? raw.channel_type);
  const status = raw.status;
  const sentiment = raw.sentiment;
  const urgencyScore = typeof raw.urgency_score === 'number' ? raw.urgency_score : undefined;

  const latestMessage = (raw.latest_message as Record<string, unknown>) ?? {};
  const preview = String(
    latestMessage.body || raw.preview || raw.latest_message_text || raw.conversation_summary || ''
  ).slice(0, 200);

  const messages: InboxMessage[] | undefined = messagesRaw
    ? messagesRaw.map(transformGmsMessage)
    : undefined;

  const waOpen = !!raw.whatsapp_window_open;
  const waExpiresMin =
    typeof raw.whatsapp_window_expires_in === 'number'
      ? raw.whatsapp_window_expires_in
      : undefined;

  return {
    id: String(raw.id || raw._id || raw.conversation_id || `conv-${Math.random().toString(36).slice(2, 9)}`),
    unread: Boolean(raw.unread_count && Number(raw.unread_count) > 0) || Boolean(raw.unread),
    urgent: mapUrgent(sentiment, urgencyScore),
    guest: String(raw.guest_name || raw.author || 'Guest'),
    subject: String(raw.subject || raw.latest_subject || (preview ? preview.slice(0, 80) : '(no subject)')),
    preview,
    channel: channelLabel(channelKey),
    entity: 'guest',
    channelKey,
    property: String(raw.property_name || raw.property_code || ''),
    time: String(raw.updated_at || raw.latest_message_time || raw.created_at || new Date().toISOString()),
    triageStatus: mapTriage(status),
    stayStatus: undefined, // derived from reservation lookup at render time
    reservationId: raw.reservation_id ? String(raw.reservation_id) : undefined,
    mentionsMe: Boolean(raw.mentions_current_user),
    messages,
    summary: raw.conversation_summary ? String(raw.conversation_summary) : undefined,
    sentiment: mapSentiment(sentiment),
    language: mapLanguage(raw.last_detected_language ?? raw.language),
    whatsappWindow: channelKey === 'whatsapp'
      ? { open: waOpen, expiresInMinutes: waExpiresMin }
      : undefined,
  };
}

// ───────── load functions ─────────

interface ConvListResp {
  conversations?: unknown;
  results?: unknown;
  data?: unknown;
}

export async function loadConversations(): Promise<InboxThread[]> {
  const data = await apiFetch('/api/inbox/conversations') as ConvListResp;
  const raw =
    (Array.isArray(data) ? data : data?.conversations || data?.results || data?.data || []) as Record<
      string,
      unknown
    >[];
  return raw.map((c) => transformGmsConversation(c));
}

export async function loadThreadDetail(id: string): Promise<InboxThread> {
  // Fetch detail + messages in parallel — GMS exposes both at /:id and /:id/messages.
  const [detail, messagesResp] = await Promise.all([
    apiFetch(`/api/inbox/conversations/${id}`) as Promise<Record<string, unknown>>,
    apiFetch(`/api/inbox/conversations/${id}/messages`).catch(() => ({ messages: [] })) as Promise<
      Record<string, unknown>
    >,
  ]);
  const messagesRaw =
    (Array.isArray(messagesResp)
      ? messagesResp
      : messagesResp?.messages || messagesResp?.results || []) as Record<string, unknown>[];
  return transformGmsConversation(detail, messagesRaw);
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
