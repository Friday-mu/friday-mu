'use client';

// Adapter: friday.mu website inbox threads → unified InboxThread shape.
//
// The friday.mu marketing site sends inquiries (typically email forms)
// into `inbox_threads` via /api/inbox/website/friday-website webhook.
// Until 2026-05-17 those lived in a separate Website module. Per
// locked decision §L (handover queue), they fold into the unified
// Inbox so the team triages all inbound communication in one place.
//
// Phase 1 (this file): surface website threads in the list with
// entity='unclassified' (operator triages per row); reply path still
// goes via the legacy /api/inbox/website endpoints. AI classification
// + inline 'Create reservation' affordance are Phase 2/3.

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiFetch, getToken } from '../../../components/types';
import type { InboxEntity, InboxThread, WebsiteAIHandoff } from './fixtures';
import type { DraftState } from './fixtures';

export type WebsiteThreadStatus = 'open' | 'in_progress' | 'paid' | 'closed';

interface RawWebsiteThread {
  id: string;
  guest_email?: string | null;
  guest_email_raw?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  status: WebsiteThreadStatus;
  last_event_type?: string | null;
  last_event_at?: string | null;
  guesty_reservation_id?: string | null;
  guesty_listing_id?: string | null;
  guesty_reservation_status?: string | null;
  notes?: string | null;
  event_count?: number | string;
  latest_draft_id?: string | null;
  latest_draft_state?: DraftState | string | null;
  latest_draft_confidence?: number | string | null;
  latest_ai_handoff_id?: string | null;
  latest_ai_surface?: string | null;
  latest_ai_confidence?: string | null;
  latest_ai_reply_state?: string | null;
  latest_ai_takeover_state?: string | null;
  latest_ai_may_reply?: boolean | string | null;
  latest_ai_escalation_reason?: string | null;
  latest_ai_recommended_next_action?: string | null;
}

function confidenceRatio(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n > 1 ? Math.max(0, Math.min(100, n)) / 100 : Math.max(0, Math.min(1, n));
}

export interface WebsiteInquiryThread {
  id: string;
  status: WebsiteThreadStatus;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  propertyCode?: string;
  reservationId?: string;
  subject: string;
  notes?: string;
  lastEventType?: string;
  updatedAt: string;
  eventCount: number;
}

function boolValue(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function surfaceEntity(surface: string | null | undefined): InboxEntity {
  if (surface === 'guest') return 'guest';
  if (surface === 'owner') return 'owner';
  return 'unclassified';
}

function aiHandoffFor(r: RawWebsiteThread): WebsiteAIHandoff | undefined {
  if (!r.latest_ai_handoff_id) return undefined;
  return {
    handoffId: r.latest_ai_handoff_id,
    surface: r.latest_ai_surface || undefined,
    confidence: r.latest_ai_confidence || undefined,
    aiReplyState: r.latest_ai_reply_state || undefined,
    takeoverState: r.latest_ai_takeover_state || undefined,
    aiMayReply: boolValue(r.latest_ai_may_reply),
    escalationReason: r.latest_ai_escalation_reason || undefined,
    recommendedNextAction: r.latest_ai_recommended_next_action || undefined,
  };
}

function mapWebsiteToInboxThread(r: RawWebsiteThread): InboxThread {
  const aiHandoff = aiHandoffFor(r);
  const guest = aiHandoff
    ? `Website AI · ${String(aiHandoff.surface || 'handoff')}`
    : (r.guest_name || r.guest_email_raw || r.guest_email || 'Anonymous');
  const preview = aiHandoff
    ? [aiHandoff.escalationReason, aiHandoff.recommendedNextAction].filter(Boolean).join(' · ') || 'Website AI needs human context'
    : `${r.last_event_type || 'inquiry'} · ${guest}${r.guest_email ? ` <${r.guest_email}>` : ''}`;
  const subject = aiHandoff
    ? `AI handoff · ${aiHandoff.surface || 'website'} · ${aiHandoff.confidence || 'unknown'} confidence`
    : (r.notes
      ? String(r.notes).slice(0, 100)
      : (r.last_event_type ? `${r.last_event_type} from ${guest}` : 'Website inquiry'));
  return {
    // Prefix the id so we never collide with Guesty conversation UUIDs
    // when both feeds merge into one list.
    id: `web-${r.id}`,
    unread: r.status === 'open' || aiHandoff?.aiMayReply === true,
    urgent: aiHandoff?.confidence === 'low' ? 'amber' : undefined,
    guest,
    subject,
    preview,
    channel: aiHandoff ? 'Website AI' : 'Website',
    entity: aiHandoff ? surfaceEntity(aiHandoff.surface) : 'unclassified',
    channelKey: 'website',
    property: r.guesty_listing_id || '',
    time: r.last_event_at || new Date().toISOString(),
    triageStatus: r.status === 'closed' ? 'done' : (r.status === 'paid' ? 'done' : 'open'),
    reservationId: r.guesty_reservation_id || undefined,
    mentionsMe: false,
    summary: r.notes || undefined,
    sentiment: 'neutral',
    language: 'EN',
    latestDraftState: r.latest_draft_state ? (String(r.latest_draft_state) as DraftState) : undefined,
    latestDraftConfidence: confidenceRatio(r.latest_draft_confidence),
    aiHandoff,
  };
}

function mapWebsiteToInquiryThread(r: RawWebsiteThread): WebsiteInquiryThread {
  const guestName = r.guest_name || r.guest_email_raw || r.guest_email || 'Anonymous';
  return {
    id: r.id,
    status: r.status,
    guestName,
    guestEmail: r.guest_email_raw || r.guest_email || undefined,
    guestPhone: r.guest_phone || undefined,
    propertyCode: r.guesty_listing_id || undefined,
    reservationId: r.guesty_reservation_id || undefined,
    subject: r.last_event_type ? `${r.last_event_type} from ${guestName}` : 'Website inquiry',
    notes: r.notes || undefined,
    lastEventType: r.last_event_type || undefined,
    updatedAt: r.last_event_at || new Date().toISOString(),
    eventCount: Number(r.event_count || 0),
  };
}

export async function loadWebsiteThreads(): Promise<InboxThread[]> {
  const data = await apiFetch('/api/inbox/website/threads') as { results?: RawWebsiteThread[] };
  return (data?.results || []).map(mapWebsiteToInboxThread);
}

export async function loadWebsiteInquiryThreads(): Promise<WebsiteInquiryThread[]> {
  const data = await apiFetch('/api/inbox/website/threads') as { results?: RawWebsiteThread[] };
  return (data?.results || []).map(mapWebsiteToInquiryThread);
}

export interface UseWebsiteThreadsResult {
  threads: InboxThread[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWebsiteThreads(): UseWebsiteThreadsResult {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale-while-revalidate. SSE-triggered refetches don't blank the list.
  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadWebsiteThreads()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load website inbox'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const token = getToken();
    if (!token) return undefined;
    const es = new EventSource(`${API_BASE}/api/events/stream?token=${encodeURIComponent(token)}`);
    const refresh = () => refetch();
    const eventTypes = [
      'inbox.draft_ready',
      'inbox.message_sent',
      'website_inbox.thread_updated',
      'website_ai.handoff_received',
      'website_ai.takeover',
    ];
    eventTypes.forEach((type) => es.addEventListener(type, refresh));
    es.onerror = () => {};
    return () => {
      eventTypes.forEach((type) => es.removeEventListener(type, refresh));
      es.close();
    };
  }, [refetch]);

  return { threads, loading, isRevalidating, error, refetch };
}

export interface UseWebsiteInquiryThreadsResult {
  threads: WebsiteInquiryThread[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWebsiteInquiryThreads(): UseWebsiteInquiryThreadsResult {
  const [threads, setThreads] = useState<WebsiteInquiryThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadWebsiteInquiryThreads()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load website inquiries'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { threads, loading, isRevalidating, error, refetch };
}
