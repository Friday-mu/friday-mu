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
import { apiFetch } from '../../../components/types';
import type { InboxThread } from './fixtures';

interface RawWebsiteThread {
  id: string;
  guest_email?: string | null;
  guest_email_raw?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  status: 'open' | 'in_progress' | 'paid' | 'closed';
  last_event_type?: string | null;
  last_event_at?: string | null;
  guesty_reservation_id?: string | null;
  guesty_listing_id?: string | null;
  guesty_reservation_status?: string | null;
  notes?: string | null;
  event_count?: number | string;
}

function mapWebsiteToInboxThread(r: RawWebsiteThread): InboxThread {
  const guest = r.guest_name || r.guest_email_raw || r.guest_email || 'Anonymous';
  const preview = `${r.last_event_type || 'inquiry'} · ${guest}${r.guest_email ? ` <${r.guest_email}>` : ''}`;
  return {
    // Prefix the id so we never collide with Guesty conversation UUIDs
    // when both feeds merge into one list.
    id: `web-${r.id}`,
    unread: r.status === 'open',
    urgent: undefined,
    guest,
    subject: r.notes
      ? String(r.notes).slice(0, 100)
      : (r.last_event_type ? `${r.last_event_type} from ${guest}` : 'Website inquiry'),
    preview,
    channel: 'Website',
    entity: 'unclassified',
    channelKey: 'website',
    property: r.guesty_listing_id || '',
    time: r.last_event_at || new Date().toISOString(),
    triageStatus: r.status === 'closed' ? 'done' : (r.status === 'paid' ? 'done' : 'open'),
    reservationId: r.guesty_reservation_id || undefined,
    mentionsMe: false,
    summary: r.notes || undefined,
    sentiment: 'neutral',
    language: 'EN',
  };
}

export async function loadWebsiteThreads(): Promise<InboxThread[]> {
  const data = await apiFetch('/api/inbox/website/threads') as { results?: RawWebsiteThread[] };
  return (data?.results || []).map(mapWebsiteToInboxThread);
}

export interface UseWebsiteThreadsResult {
  threads: InboxThread[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWebsiteThreads(): UseWebsiteThreadsResult {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadWebsiteThreads()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load website inbox'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { threads, loading, error, refetch };
}
