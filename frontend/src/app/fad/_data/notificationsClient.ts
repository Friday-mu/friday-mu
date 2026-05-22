'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiFetch, getToken } from '../../../components/types';
import {
  bumpNotificationsRev,
  getContext,
  isSnoozedNow,
  subscribeNotifications,
  type ModuleId,
  type Notification,
  type Severity,
} from './notifications';

type RawNotification = {
  id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  url?: string | null;
  source?: string | null;
  source_id?: string | null;
  priority?: string | null;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at?: string | null;
};

type NotificationsResponse = {
  notifications?: RawNotification[];
};

const MODULES: ModuleId[] = [
  'inbox',
  'operations',
  'calendar',
  'reservations',
  'properties',
  'reviews',
  'finance',
  'hr',
  'friday',
];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function moduleFrom(value: unknown): ModuleId | null {
  const v = asString(value);
  if (!v) return null;
  return MODULES.includes(v as ModuleId) ? (v as ModuleId) : null;
}

function inferModule(row: RawNotification): ModuleId {
  const data = row.data || {};
  const explicit = moduleFrom(data.module) || moduleFrom(data.moduleId);
  if (explicit) return explicit;

  const haystack = `${row.type || ''} ${row.source || ''} ${row.url || ''}`.toLowerCase();
  if (haystack.includes('review')) return 'reviews';
  if (haystack.includes('reservation') || haystack.includes('booking')) return 'reservations';
  if (haystack.includes('property') || haystack.includes('listing')) return 'properties';
  if (haystack.includes('finance') || haystack.includes('invoice') || haystack.includes('payment')) return 'finance';
  if (haystack.includes('hr') || haystack.includes('roster') || haystack.includes('time_off')) return 'hr';
  if (haystack.includes('task') || haystack.includes('ops') || haystack.includes('operation')) return 'operations';
  if (haystack.includes('calendar') || haystack.includes('schedule')) return 'calendar';
  if (haystack.includes('friday') || haystack.includes('ai')) return 'friday';
  return 'inbox';
}

function severityFrom(row: RawNotification): Severity {
  const raw = `${asString(row.data?.severity) || ''} ${row.priority || ''} ${row.type || ''}`.toLowerCase();
  if (raw.includes('urgent') || raw.includes('critical')) return 'urgent';
  if (raw.includes('high') || raw.includes('warn') || raw.includes('warning')) return 'warn';
  return 'info';
}

function categoryFrom(row: RawNotification): Notification['category'] {
  const raw = `${row.type || ''} ${row.source || ''}`.toLowerCase();
  if (row.data?.isMention === true || raw.includes('mention')) return 'mention';
  if (raw.includes('comment') || raw.includes('reply')) return 'comment';
  if (raw.includes('watch')) return 'watching';
  if (raw.includes('department') || raw.includes('team')) return 'department';
  return undefined;
}

function isMention(row: RawNotification): boolean {
  const raw = `${row.type || ''} ${row.source || ''}`.toLowerCase();
  return row.data?.isMention === true || raw.includes('mention');
}

function rankLiveNotifications(items: Notification[]): Notification[] {
  const now = Date.now();
  return items.map((n) => {
    let score = 0;
    const reasons: string[] = [];
    const ctx = getContext(n.id);

    if (n.severity === 'urgent') { score += 0.45; reasons.push('high severity'); }
    else if (n.severity === 'warn') { score += 0.25; reasons.push('medium severity'); }
    else { score += 0.10; }

    if (n.isMention) { score += 0.30; reasons.push('you were @mentioned'); }

    const createdMs = new Date(n.ts).getTime();
    if (Number.isFinite(createdMs)) {
      const ageDays = Math.max(0, (now - createdMs) / 86_400_000);
      const recency = Math.max(0, 1 - ageDays / 7);
      score += recency * 0.20;
      if (recency > 0.7) reasons.push('recent');
    }

    if (!n.readAt) score += 0.05;

    if (isSnoozedNow(ctx)) {
      score *= 0.20;
      reasons.push(`snoozed until ${ctx.snoozedUntil?.slice(0, 16).replace('T', ' ')}`);
    }
    if (ctx.waitingOn) {
      score += 0.15;
      reasons.push(`waiting on ${ctx.waitingOn}`);
    }
    if (ctx.note) {
      score += 0.05;
      reasons.push('you noted this');
    }

    return {
      ...n,
      aiPriority: Math.min(1, Math.max(0, score)),
      aiReason: reasons.join(' · '),
    };
  });
}

function mapNotification(row: RawNotification): Notification {
  const category = categoryFrom(row);
  return {
    id: row.id,
    title: row.title || 'Notification',
    body: row.body || '',
    ts: row.created_at || new Date().toISOString(),
    readAt: row.read_at || null,
    severity: severityFrom(row),
    module: inferModule(row),
    category,
    sourceId: row.source_id || asString(row.data?.sourceId) || undefined,
    commentId: asString(row.data?.commentId) || undefined,
    href: row.url || asString(row.data?.href) || undefined,
    isMention: isMention(row),
  };
}

async function fetchLiveNotifications(): Promise<Notification[]> {
  const data = (await apiFetch('/api/events/notifications')) as NotificationsResponse;
  const rows = Array.isArray(data.notifications) ? data.notifications : [];
  return rankLiveNotifications(rows.map(mapNotification));
}

async function setLiveRead(ids: string[], read: boolean): Promise<void> {
  await apiFetch('/api/events/notifications/mark-read', {
    method: 'POST',
    body: JSON.stringify({ ids, read }),
  });
}

function mergeNotification(current: Notification[], incoming: Notification[]): Notification[] {
  const byId = new Map<string, Notification>();
  [...current, ...incoming].forEach((item) => byId.set(item.id, item));
  return rankLiveNotifications(
    [...byId.values()].sort((a, b) => (a.ts < b.ts ? 1 : -1)),
  );
}

export function notificationRead(notification: Notification): boolean {
  return Boolean(notification.readAt);
}

export function useLiveNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const items = await fetchLiveNotifications();
    setNotifications(items);
    return items;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load notifications');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => subscribeNotifications(() => {
    void refresh().catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to refresh notifications');
    });
  }), [refresh]);

  useEffect(() => {
    const token = getToken();
    if (typeof window === 'undefined' || !token) return undefined;
    const source = new EventSource(`${API_BASE}/api/events/stream?token=${encodeURIComponent(token)}`);
    const onCreated = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        const rows = Array.isArray(payload?.payload?.notifications)
          ? payload.payload.notifications as RawNotification[]
          : [];
        if (rows.length === 0) return;
        setNotifications((current) => mergeNotification(current, rows.map(mapNotification)));
      } catch {
        // A malformed realtime event should not break the current notification list.
      }
    };
    source.addEventListener('notification.created', onCreated as EventListener);
    return () => source.close();
  }, []);

  const markRead = useCallback(async (id: string) => {
    const readAt = new Date().toISOString();
    setNotifications((items) => rankLiveNotifications(items.map((n) => n.id === id ? { ...n, readAt } : n)));
    try {
      await setLiveRead([id], true);
      bumpNotificationsRev();
    } catch (e) {
      await refresh().catch(() => undefined);
      throw e;
    }
  }, [refresh]);

  const markUnread = useCallback(async (id: string) => {
    setNotifications((items) => rankLiveNotifications(items.map((n) => n.id === id ? { ...n, readAt: null } : n)));
    try {
      await setLiveRead([id], false);
      bumpNotificationsRev();
    } catch (e) {
      await refresh().catch(() => undefined);
      throw e;
    }
  }, [refresh]);

  const markAllRead = useCallback(async (items?: Notification[]) => {
    const ids = (items || notifications).map((n) => n.id);
    const readAt = new Date().toISOString();
    setNotifications((current) => rankLiveNotifications(current.map((n) => ids.includes(n.id) ? { ...n, readAt } : n)));
    try {
      await setLiveRead(ids, true);
      bumpNotificationsRev();
    } catch (e) {
      await refresh().catch(() => undefined);
      throw e;
    }
  }, [notifications, refresh]);

  return {
    notifications,
    loading,
    error,
    refresh,
    markRead,
    markUnread,
    markAllRead,
  };
}
