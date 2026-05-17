'use client';

// Live data client + hooks for FAD's TeamInbox (Slack replacement).
// Calls /api/team/* on fad-backend (see backend/src/team_inbox/index.js).
//
// Coexists with the fixture types in teamInbox.ts — the live data is
// shape-compatible with TeamChannel / TeamDM / TeamMessage so the
// existing TeamInbox.tsx renders against it without prop reshuffling.
//
// Polling strategy: useChannelMessages polls every 15s while the
// channel is visible. useChannels polls every 30s for the unread
// badges. Pure poll for v1; SSE upgrade in v2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { ChannelKey, TeamMessage, TeamMessageKind } from './teamInbox';

// ─── Wire shapes (mirror backend shapeChannel / shapeMessage) ───────

export interface LiveChannel {
  id: string;
  key: ChannelKey;
  name: string;
  purpose: string | null;
  visibility: 'public' | 'private';
  preserveUploadQuality: boolean;
  archivedAt: string | null;
  createdAt: string;
  unread: number;
}

export interface LiveDm {
  id: string;
  participantIds: string[];
  unread: number;
  lastMessageAt: string;
}

export interface LiveTeamMessage {
  id: string;
  kind: TeamMessageKind;
  channelKey?: ChannelKey;
  dmId?: string;
  authorId: string | null;
  authorName: string;
  text: string;
  mentions: string[];
  parentMessageId: string | null;
  /** Number of replies on this message (top-level only — replies
   *  themselves report 0). Backend populates via a LEFT JOIN LATERAL
   *  count subquery on the list endpoints. */
  replyCount: number;
  meta: Record<string, unknown> | null;
  editedAt: string | null;
  ts: string;
  /** Aggregated reactions for this message — emoji → array of user IDs
   *  who reacted with it. Bulk-fetched in the messages endpoint so we
   *  avoid N+1. UI renders one chip per emoji with count + click to
   *  toggle the current user's reaction. */
  reactions: Record<string, string[]>;
}

export interface LiveUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string | null;
}

export interface LiveReactions {
  // emoji → list of users who reacted
  [emoji: string]: Array<{ userId: string; displayName: string }>;
}

export interface LiveRead {
  userId: string;
  displayName: string;
  username: string;
  readAt: string;
}

// ─── Loaders ────────────────────────────────────────────────────────

export async function loadChannels(): Promise<LiveChannel[]> {
  const data = await apiFetch('/api/team/channels') as { channels?: LiveChannel[] };
  return data?.channels ?? [];
}

export async function loadChannelDetail(channelId: string): Promise<{
  channel: LiveChannel;
  members: Array<LiveUser & { channelRole: 'admin' | 'member'; joinedAt: string }>;
}> {
  return apiFetch(`/api/team/channels/${channelId}`) as Promise<{
    channel: LiveChannel;
    members: Array<LiveUser & { channelRole: 'admin' | 'member'; joinedAt: string }>;
  }>;
}

export async function loadChannelMessages(channelId: string, opts: { limit?: number; before?: string } = {}): Promise<LiveTeamMessage[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before) params.set('before', opts.before);
  const qs = params.toString();
  const data = await apiFetch(`/api/team/channels/${channelId}/messages${qs ? `?${qs}` : ''}`) as { messages?: LiveTeamMessage[] };
  return data?.messages ?? [];
}

export async function sendChannelMessage(channelId: string, body: {
  text: string;
  mentions?: string[];
  kind?: TeamMessageKind;
  meta?: Record<string, unknown>;
  parentMessageId?: string;
}): Promise<LiveTeamMessage> {
  const data = await apiFetch(`/api/team/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as { message: LiveTeamMessage };
  return data.message;
}

export async function markChannelRead(channelId: string): Promise<void> {
  await apiFetch(`/api/team/channels/${channelId}/read`, { method: 'POST' });
}

/**
 * Add a user to a channel. Caller must be a channel admin; backend
 * returns 403 otherwise. Idempotent — re-adding an existing member
 * is a no-op.
 */
export async function addChannelMember(
  channelId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
): Promise<void> {
  await apiFetch(`/api/team/channels/${channelId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
}

/** Remove a user from a channel. Caller must be a channel admin. */
export async function removeChannelMember(channelId: string, userId: string): Promise<void> {
  await apiFetch(`/api/team/channels/${channelId}/members/${userId}`, { method: 'DELETE' });
}

export async function loadDms(): Promise<LiveDm[]> {
  const data = await apiFetch('/api/team/dms') as { dms?: LiveDm[] };
  return data?.dms ?? [];
}

export async function openDm(participantIds: string[]): Promise<LiveDm> {
  const data = await apiFetch('/api/team/dms', {
    method: 'POST',
    body: JSON.stringify({ participantIds }),
  }) as { dm: LiveDm };
  return data.dm;
}

export async function loadDmMessages(dmId: string, opts: { limit?: number; before?: string } = {}): Promise<LiveTeamMessage[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before) params.set('before', opts.before);
  const qs = params.toString();
  const data = await apiFetch(`/api/team/dms/${dmId}/messages${qs ? `?${qs}` : ''}`) as { messages?: LiveTeamMessage[] };
  return data?.messages ?? [];
}

export async function sendDmMessage(dmId: string, body: {
  text: string;
  mentions?: string[];
  kind?: TeamMessageKind;
  meta?: Record<string, unknown>;
  parentMessageId?: string;
}): Promise<LiveTeamMessage> {
  const data = await apiFetch(`/api/team/dms/${dmId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as { message: LiveTeamMessage };
  return data.message;
}

export async function markDmRead(dmId: string): Promise<void> {
  await apiFetch(`/api/team/dms/${dmId}/read`, { method: 'POST' });
}

// ─── Search ────────────────────────────────────────────────────────

export interface SearchHit {
  kind: 'channel' | 'dm';
  // Channel hits
  channelId?: string;
  channelKey?: ChannelKey;
  channelName?: string;
  // DM hits
  dmId?: string;
  participantIds?: string[];
  // Common
  messageId: string;
  authorName: string;
  text: string;
  ts: string;
  rank: number;
}

/**
 * Postgres full-text search over channel messages + DMs the caller
 * has access to. Results ranked by ts_rank_cd then recency. For
 * `q.length < 2` returns empty + a note (server-side guard).
 *
 * File search hooks in later (Day 2-3 when file uploads ship).
 * Semantic / vector search is a v2 upgrade — additive, not a
 * replacement; both APIs will coexist.
 */
export async function searchTeam(q: string, limit = 30): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const data = await apiFetch(`/api/team/search?${params.toString()}`) as { hits?: SearchHit[] };
  return data?.hits ?? [];
}

export async function loadTenantUsers(): Promise<LiveUser[]> {
  const data = await apiFetch('/api/team/users') as { users?: LiveUser[] };
  return data?.users ?? [];
}

export async function loadMessageReads(kind: 'channel' | 'dm', messageId: string): Promise<LiveRead[]> {
  const data = await apiFetch(`/api/team/messages/${kind}/${messageId}/reads`) as { reads?: LiveRead[] };
  return data?.reads ?? [];
}

export async function loadMessageReactions(kind: 'channel' | 'dm', messageId: string): Promise<LiveReactions> {
  const data = await apiFetch(`/api/team/messages/${kind}/${messageId}/reactions`) as { reactions?: LiveReactions };
  return data?.reactions ?? {};
}

/**
 * Fetch all replies for a top-level message. Returned in chronological
 * order (oldest first) — threads read top-down like Slack, opposite of
 * the main timeline.
 */
export async function loadMessageReplies(
  kind: 'channel' | 'dm',
  messageId: string,
): Promise<LiveTeamMessage[]> {
  const data = await apiFetch(`/api/team/messages/${kind}/${messageId}/replies`) as { replies?: LiveTeamMessage[] };
  return data?.replies ?? [];
}

export async function addReaction(kind: 'channel' | 'dm', messageId: string, emoji: string): Promise<void> {
  await apiFetch(`/api/team/messages/${kind}/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export async function removeReaction(kind: 'channel' | 'dm', messageId: string, emoji: string): Promise<void> {
  await apiFetch(`/api/team/messages/${kind}/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
  });
}

// ─── Hooks ──────────────────────────────────────────────────────────

const CHANNELS_POLL_MS = 30_000;
const MESSAGES_POLL_MS = 15_000;

/** Live channels list with 30s polling for unread-badge updates. */
export function useChannels(): {
  channels: LiveChannel[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [channels, setChannels] = useState<LiveChannel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    loadChannels()
      .then((data) => { setChannels(data); setError(null); })
      .catch((e: Error) => setError(e?.message || 'Failed to load channels'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, CHANNELS_POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return { channels, loading, error, refetch };
}

/** Live DM list with same polling cadence as channels. */
export function useDms(): {
  dms: LiveDm[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [dms, setDms] = useState<LiveDm[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    loadDms()
      .then((data) => { setDms(data); setError(null); })
      .catch((e: Error) => setError(e?.message || 'Failed to load DMs'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, CHANNELS_POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return { dms, loading, error, refetch };
}

/** Live messages for a channel or DM. Polls every 15s while mounted.
 *  Pass null to "pause" (e.g., no channel selected). */
export function useTeamMessages(target: { kind: 'channel' | 'dm'; id: string } | null): {
  messages: LiveTeamMessage[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  send: (text: string, opts?: { mentions?: string[]; meta?: Record<string, unknown>; parentMessageId?: string; kind?: TeamMessageKind }) => Promise<LiveTeamMessage | null>;
} {
  const [messages, setMessages] = useState<LiveTeamMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable ref so the polling interval always reads the latest target
  // without re-creating the interval on every render.
  const targetRef = useRef(target);
  useEffect(() => { targetRef.current = target; }, [target]);

  const refetch = useCallback(() => {
    const t = targetRef.current;
    if (!t) { setMessages(null); setLoading(false); return; }
    setLoading(true);
    const loader = t.kind === 'channel'
      ? loadChannelMessages(t.id)
      : loadDmMessages(t.id);
    loader
      .then((data) => { setMessages(data); setError(null); })
      .catch((e: Error) => setError(e?.message || 'Failed to load messages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
    if (!target) return;
    const id = setInterval(refetch, MESSAGES_POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id]);

  const send = useCallback(async (text: string, opts: { mentions?: string[]; meta?: Record<string, unknown>; parentMessageId?: string; kind?: TeamMessageKind } = {}) => {
    const t = targetRef.current;
    if (!t || !text.trim()) return null;
    try {
      const msg = t.kind === 'channel'
        ? await sendChannelMessage(t.id, { text: text.trim(), ...opts })
        : await sendDmMessage(t.id, { text: text.trim(), ...opts });
      // Optimistic append — also refetched on next poll tick for safety.
      setMessages((prev) => prev ? [...prev, msg] : [msg]);
      return msg;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
      return null;
    }
  }, []);

  return { messages, loading, error, refetch, send };
}

/**
 * Live thread-replies hook. Pass null target to "pause" (no thread
 * open). Polls every 15s like the main timeline. The `send` helper
 * posts a reply with parentMessageId set; the optimistic append keeps
 * the thread responsive between polls.
 *
 * The caller owns the parent (kind+parentId); when the operator closes
 * the thread surface, pass null to stop polling.
 */
export function useMessageReplies(target: { kind: 'channel' | 'dm'; parentId: string; targetId: string } | null): {
  replies: LiveTeamMessage[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  send: (text: string, opts?: { mentions?: string[]; meta?: Record<string, unknown>; kind?: TeamMessageKind }) => Promise<LiveTeamMessage | null>;
} {
  const [replies, setReplies] = useState<LiveTeamMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef(target);
  useEffect(() => { targetRef.current = target; }, [target]);

  const refetch = useCallback(() => {
    const t = targetRef.current;
    if (!t) { setReplies(null); setLoading(false); return; }
    setLoading(true);
    loadMessageReplies(t.kind, t.parentId)
      .then((data) => { setReplies(data); setError(null); })
      .catch((e: Error) => setError(e?.message || 'Failed to load replies'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
    if (!target) return;
    const id = setInterval(refetch, MESSAGES_POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.parentId, target?.targetId]);

  const send = useCallback(async (text: string, opts: { mentions?: string[]; meta?: Record<string, unknown>; kind?: TeamMessageKind } = {}) => {
    const t = targetRef.current;
    if (!t || !text.trim()) return null;
    try {
      const msg = t.kind === 'channel'
        ? await sendChannelMessage(t.targetId, { text: text.trim(), ...opts, parentMessageId: t.parentId })
        : await sendDmMessage(t.targetId, { text: text.trim(), ...opts, parentMessageId: t.parentId });
      setReplies((prev) => prev ? [...prev, msg] : [msg]);
      return msg;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
      return null;
    }
  }, []);

  return { replies, loading, error, refetch, send };
}

/** Tenant user list, cached for the session — used by the @mention
 *  picker and DM target picker. Refetched once on mount. */
export function useTenantTeamUsers(): {
  users: LiveUser[] | null;
  byId: Map<string, LiveUser>;
  loading: boolean;
  error: string | null;
} {
  const [users, setUsers] = useState<LiveUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTenantUsers()
      .then((data) => { setUsers(data); setError(null); })
      .catch((e: Error) => setError(e?.message || 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  const byId = new Map<string, LiveUser>((users ?? []).map((u) => [u.id, u]));
  return { users, byId, loading, error };
}

// ─── @mention text-parsing helpers (client-side) ────────────────────

/** Naive mention parser: matches `@<displayName-or-username>` tokens.
 *  Returns the matched substrings + the resolved user IDs. The mention
 *  text stays in the body verbatim; the server validates the IDs are
 *  channel members (and silently drops anyone who isn't). */
export function parseMentions(text: string, users: LiveUser[]): { mentions: string[]; matches: string[] } {
  const mentions: string[] = [];
  const matches: string[] = [];
  const re = /@(\w[\w.-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].toLowerCase();
    const u = users.find(
      (u) => u.username.toLowerCase() === handle
        || u.displayName.toLowerCase().replace(/\s+/g, '') === handle.replace(/\s+/g, ''),
    );
    if (u) {
      mentions.push(u.id);
      matches.push(m[0]);
    }
  }
  return { mentions: [...new Set(mentions)], matches };
}
