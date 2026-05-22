// Client-side notification state helpers for the live FAD notification feed.
// Notification rows come from /api/events/notifications via notificationsClient.

export type Severity = 'info' | 'warn' | 'urgent';
export type ModuleId =
  | 'inbox' | 'operations' | 'calendar' | 'reservations'
  | 'properties' | 'reviews' | 'finance' | 'hr' | 'friday';

export interface Notification {
  id: string;
  title: string;
  body: string;
  ts: string; // ISO
  readAt?: string | null;
  severity: Severity;
  module: ModuleId;
  category?: 'mention' | 'comment' | 'watching' | 'department';
  /** Cross-link record id within the source module. */
  sourceId?: string;
  /** Optional exact source comment id when the event came from a task comment. */
  commentId?: string;
  /** Optional URL override — falls back to module-id link. */
  href?: string;
  /** True when the current user is @mentioned (force-pinned). */
  isMention?: boolean;
  /** Optional user target for per-user generated events. */
  targetUserId?: string;
  /** AI ranking score 0-1 (filled in by `rankNotifications`). */
  aiPriority?: number;
  /** AI ranking explanation surfaced on hover. */
  aiReason?: string;
}

// ───────────────── User context: notes, snooze, waiting-on, forward ─────────────────

export interface UserContext {
  /** ISO timestamp; until then the notification is deprioritised. */
  snoozedUntil?: string;
  /** Free-form note from the user. Surfaces as 💬 chip in the list. */
  note?: string;
  /** Person the user is waiting on (free-form). Pins until cleared. */
  waitingOn?: string;
  /** UserId the notification was forwarded to. Hides from my feed. */
  forwardedTo?: string;
}

const CONTEXT_KEY = 'fad:notif-context';

function readContextMap(): Record<string, UserContext> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CONTEXT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeContextMap(m: Record<string, UserContext>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(m));
  } catch {
    // ignore
  }
}

export function getContext(id: string): UserContext {
  return readContextMap()[id] ?? {};
}

export function setContext(id: string, patch: Partial<UserContext>): void {
  const m = readContextMap();
  m[id] = { ...(m[id] ?? {}), ...patch };
  writeContextMap(m);
  bumpNotificationsRev();
}

export function clearContext(id: string, keys: (keyof UserContext)[]): void {
  const m = readContextMap();
  if (!m[id]) return;
  keys.forEach((k) => delete m[id][k]);
  if (Object.keys(m[id]).length === 0) delete m[id];
  writeContextMap(m);
  bumpNotificationsRev();
}

export function snoozeNotification(id: string, until: Date): void {
  setContext(id, { snoozedUntil: until.toISOString() });
}

export function isSnoozedNow(ctx: UserContext): boolean {
  if (!ctx.snoozedUntil) return false;
  return new Date(ctx.snoozedUntil).getTime() > Date.now();
}

// ───────────────── Read-state (localStorage Phase 1) ─────────────────

const READ_KEY = 'fad:notif-read';

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSet(s: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...s]));
  } catch {
    // ignore
  }
}

export function isRead(id: string): boolean {
  return readSet().has(id);
}

export function markRead(id: string): void {
  const s = readSet();
  s.add(id);
  writeSet(s);
  bumpNotificationsRev();
}

export function markUnread(id: string): void {
  const s = readSet();
  s.delete(id);
  writeSet(s);
  bumpNotificationsRev();
}

export function markAllRead(notifications: Notification[]): void {
  const s = readSet();
  notifications.forEach((n) => s.add(n.id));
  writeSet(s);
  bumpNotificationsRev();
}

// ───────────────── Archive state ─────────────────

const ARCHIVE_KEY = 'fad:notif-archived';

function readArchiveSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ARCHIVE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeArchiveSet(s: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...s]));
  } catch {
    // ignore
  }
}

export function isArchived(id: string): boolean {
  return readArchiveSet().has(id);
}

export function archiveNotification(id: string): void {
  const s = readArchiveSet();
  s.add(id);
  writeArchiveSet(s);
  markRead(id);
  bumpNotificationsRev();
}

export function unarchiveNotification(id: string): void {
  const s = readArchiveSet();
  s.delete(id);
  writeArchiveSet(s);
  bumpNotificationsRev();
}

// ───────────────── Task-comment mention events ─────────────────

const TASK_COMMENT_NOTIFICATIONS_KEY = 'fad:notif-task-comment-mentions';

function readTaskCommentNotifications(): Notification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TASK_COMMENT_NOTIFICATIONS_KEY);
    return raw ? JSON.parse(raw) as Notification[] : [];
  } catch {
    return [];
  }
}

function writeTaskCommentNotifications(items: Notification[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TASK_COMMENT_NOTIFICATIONS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage failures; the task comment remains canonical.
  }
}

export function taskCommentMentionNotifications(): Notification[] {
  return readTaskCommentNotifications();
}

export function recordTaskCommentMentionNotification(notification: Notification): boolean {
  const existing = readTaskCommentNotifications();
  if (existing.some((item) => item.id === notification.id)) return false;
  writeTaskCommentNotifications([...existing, notification]);
  bumpNotificationsRev();
  return true;
}

// ───────────────── Rev-bump (mirrors pendingCounts pattern) ─────────────────

let notificationsRev = 0;
const subs = new Set<(rev: number) => void>();

export function bumpNotificationsRev(): void {
  notificationsRev++;
  subs.forEach((cb) => cb(notificationsRev));
}

export function subscribeNotifications(cb: (rev: number) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
