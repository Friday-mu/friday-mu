// @demo:data — Notifications — GET /api/notifications (per-user)
// Tag: PROD-DATA-14 — see frontend/DEMO_CRUFT.md

// Notifications — central event log surfaced via the topbar bell.
//
// Distinct from `pendingCounts.ts` which counts actionable items per module
// (sidebar badges). Notifications are timestamped events — "X happened, you
// might want to know." Each notification cross-links to its source record.
//
// Phase 1: hand-seeded fixture + per-module derived contributions. localStorage
// holds read-state per device. Phase 2: real backend event stream + LLM-ranked
// priority.

import type { TaskUser } from './tasks';
import { TASKS } from './tasks';
import { RESERVATIONS } from './reservations';
import { FIN_EXPENSES } from './finance';
import { PROPERTIES, portfolioInsights } from './properties';
import { REVIEWS } from './reviews';
import { ROSTERS } from './roster';

// @demo:logic — Tag: PROD-LOGIC-7 — see frontend/DEMO_CRUFT.md. Replace with real Date.now() / server now().
const TODAY = '2026-04-27';
const TODAY_MS = new Date(TODAY).getTime();

export type Severity = 'info' | 'warn' | 'urgent';
export type ModuleId =
  | 'inbox' | 'operations' | 'calendar' | 'reservations'
  | 'properties' | 'reviews' | 'finance' | 'hr' | 'friday';

export interface Notification {
  id: string;
  title: string;
  body: string;
  ts: string; // ISO
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

type Role = TaskUser['role'];

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

// ───────────────── Per-module contributions ─────────────────

/** Module-derived notifications computed from fixture state. Phase 1 returns
 *  realistic events; Phase 2 reads from a real event log. */
function moduleNotifications(_role: Role, _userId: string): Notification[] {
  const out: Notification[] = [];

  // Calendar: arrivals today missing access info
  RESERVATIONS.forEach((r) => {
    if (r.status === 'confirmed' && r.checkIn.startsWith(TODAY) && !r.accessInfoSentAt) {
      out.push({
        id: `cal-noaccess-${r.id}`,
        title: 'Arrival today — access info not sent',
        body: `${r.guestName} · ${r.propertyCode} · check-in ${r.checkIn.slice(11, 16)}`,
        ts: `${TODAY}T08:00:00`,
        severity: 'urgent',
        module: 'calendar',
        sourceId: r.id,
        href: `/fad?m=reservations&sub=overview&rsv=${r.id}`,
      });
    }
  });

  // Reservations: balance due ≤ 3 days before check-in
  RESERVATIONS.forEach((r) => {
    if (r.status !== 'confirmed' || r.balanceDue <= 0) return;
    const days = (new Date(r.checkIn).getTime() - TODAY_MS) / 86400000;
    if (days >= 0 && days <= 3) {
      out.push({
        id: `rsv-balance-${r.id}`,
        title: 'Balance due before check-in',
        body: `${r.guestName} · ${r.propertyCode} · ${r.balanceDue.toLocaleString()} ${r.currency} · arrives in ${Math.round(days)}d`,
        ts: `${TODAY}T09:00:00`,
        severity: days <= 1 ? 'urgent' : 'warn',
        module: 'reservations',
        sourceId: r.id,
        href: `/fad?m=reservations&sub=overview&rsv=${r.id}`,
      });
    }
  });

  // Operations: overdue tasks
  TASKS.forEach((t) => {
    if (t.status === 'completed' || t.status === 'cancelled') return;
    if (t.dueDate >= TODAY) return;
    const daysOverdue = Math.round((TODAY_MS - new Date(t.dueDate).getTime()) / 86400000);
    out.push({
      id: `ops-overdue-${t.id}`,
      title: `Overdue: ${t.title}`,
      body: `${t.propertyCode} · ${daysOverdue}d late · ${t.assigneeIds.length} assignee${t.assigneeIds.length === 1 ? '' : 's'}`,
      ts: `${t.dueDate}T17:00:00`,
      severity: daysOverdue > 3 ? 'urgent' : 'warn',
      module: 'operations',
      sourceId: t.id,
      href: `/fad?m=operations&task=${t.id}`,
    });
  });

  // Properties: onboarding stalled
  PROPERTIES.forEach((p) => {
    if (p.lifecycleStatus !== 'onboarding') return;
    const days = (TODAY_MS - new Date(p.lastActivityAt).getTime()) / 86400000;
    if (days > 7) {
      out.push({
        id: `prop-stalled-${p.id}`,
        title: 'Onboarding stalled',
        body: `${p.code} · ${p.name} · ${Math.round(days)}d since last activity. Escalate to Mathias.`,
        ts: p.lastActivityAt,
        severity: 'warn',
        module: 'properties',
        sourceId: p.code,
        href: `/fad?m=properties&sub=overview&p=${p.code}`,
      });
    }
  });

  // Properties: high-severity insights
  portfolioInsights().forEach((insight) => {
    if (insight.severity !== 'high') return;
    out.push({
      id: `prop-insight-${insight.id}`,
      title: `Insight: ${insight.title}`,
      body: insight.message,
      ts: `${TODAY}T07:00:00`,
      severity: 'urgent',
      module: 'properties',
      href: `/fad?m=properties&sub=insights`,
    });
  });

  // Finance: pending approvals
  FIN_EXPENSES.forEach((e) => {
    if (e.approvalStatus !== 'pending' && e.approvalStatus !== 'partial_proposed') return;
    const isUrgent = e.approvalTier === 'urgent_override' || e.approvalTier === 'major';
    out.push({
      id: `fin-approval-${e.id}`,
      title: `Approval pending — ${e.vendorName}`,
      body: `${e.propertyCode} · Rs ${(e.amountMinor / 100).toLocaleString()} · ${e.description.slice(0, 60)}`,
      ts: `${e.enteredAt.replace(' ', 'T')}`,
      severity: isUrgent ? 'urgent' : 'warn',
      module: 'finance',
      sourceId: e.id,
      href: `/fad?m=finance&sub=approvals`,
    });
  });

  // Reviews: unreplied within window
  const REPLY_WINDOW: Record<string, number> = { airbnb: 14, booking: 7, vrbo: 14, google: 30, direct: 30 };
  REVIEWS.forEach((rv) => {
    if ((rv as any).replyText) return;
    const submittedMs = new Date((rv as any).submittedAt ?? '2000-01-01').getTime();
    const days = (TODAY_MS - submittedMs) / 86400000;
    const window = REPLY_WINDOW[(rv as any).channel as string] ?? 14;
    if (days > window) return;
    const closing = days > window - 2;
    out.push({
      id: `rv-unreplied-${(rv as any).id}`,
      title: closing ? 'Review reply window closing' : 'Unreplied review',
      body: `${(rv as any).guestName} · ${(rv as any).propertyCode} · ${(rv as any).rating}★ · ${Math.round(window - days)}d left`,
      ts: (rv as any).submittedAt,
      severity: closing ? 'warn' : 'info',
      module: 'reviews',
      sourceId: (rv as any).id,
      href: `/fad?m=reviews&sub=all`,
    });
  });

  // HR: roster published this week
  const rosterThisWeek = ROSTERS.find((r) => r.status === 'published' && r.weekStart <= TODAY && r.weekEnd >= TODAY);
  if (rosterThisWeek) {
    out.push({
      id: `hr-roster-${rosterThisWeek.id}`,
      title: 'Roster published',
      body: `Week of ${rosterThisWeek.weekStart} → ${rosterThisWeek.weekEnd}. Check your shifts.`,
      ts: `${rosterThisWeek.weekStart}T08:00:00`,
      severity: 'info',
      module: 'hr',
      sourceId: rosterThisWeek.id,
      href: `/fad?m=operations&sub=roster`,
    });
  }

  return out;
}

// ───────────────── Hand-seeded "context" notifications ─────────────────
// Things that wouldn't naturally fall out of fixture state but represent the
// kinds of events the user would actually see (mentions, AI updates, etc.).
// Phase 2 these come from real event sources.

const SEEDED_NOTIFICATIONS: Notification[] = [
  {
    id: 'seed-mention-1',
    title: 'Bryan mentioned you in t-006',
    body: '@Ishant Ayadassen — please confirm Daikin compressor replacement is OK to proceed at LB-2',
    ts: '2026-04-27T08:42:00',
    severity: 'warn',
    module: 'operations',
    sourceId: 't-006',
    href: '/fad?m=operations&task=t-006',
    isMention: true,
  },
  {
    id: 'seed-mention-2',
    title: 'Franny mentioned you in #ops',
    body: 'Roster questions for next week — quick chat when free?',
    ts: '2026-04-27T07:15:00',
    severity: 'info',
    module: 'inbox',
    isMention: true,
    href: '/fad?m=inbox',
  },
  {
    id: 'seed-friday-1',
    title: 'Friday flagged 2 reservations needing attention',
    body: 'KS-5 missing access info · BL-12 balance due tomorrow. Friday auto-drafted reminders — review before sending.',
    ts: '2026-04-27T06:30:00',
    severity: 'info',
    module: 'friday',
    href: '/fad',
  },
  {
    id: 'seed-payout-1',
    title: 'Payout settled · Airbnb · Apr batch',
    body: '€48,220 cleared MCB-828 · 11 reservations · ref AXB-8821',
    ts: '2026-04-26T18:14:00',
    severity: 'info',
    module: 'finance',
    href: '/fad?m=finance&sub=transactions',
  },
  {
    id: 'seed-renewal-1',
    title: 'Owner agreement renewal due',
    body: 'Harrington · Blue Bay House · ends May 2026 (28 days)',
    ts: '2026-04-26T10:00:00',
    severity: 'warn',
    module: 'properties',
    href: '/fad?m=properties&sub=overview&p=BBH',
  },
];

// ───────────────── Aggregator + ranking ─────────────────

export function allNotifications(role: Role, userId: string): Notification[] {
  if (role === 'external') return [];
  const merged = [...SEEDED_NOTIFICATIONS, ...moduleNotifications(role, userId), ...taskCommentMentionNotifications()];
  // Dedupe by id
  const seen = new Set<string>();
  const unique = merged.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  // Filter out items I forwarded (still show in the destination user's feed)
  const visible = unique.filter((n) => {
    if (n.targetUserId && n.targetUserId !== userId) return false;
    const ctx = getContext(n.id);
    if (ctx.forwardedTo && ctx.forwardedTo !== userId) return false;
    return true;
  });
  return rankNotifications(visible);
}

/** Heuristic AI ranking. Higher = more important. Phase 2 swap = LLM ranker. */
export function rankNotifications(items: Notification[]): Notification[] {
  return items.map((n) => {
    let score = 0;
    const reasons: string[] = [];
    const ctx = getContext(n.id);

    // Severity
    if (n.severity === 'urgent') { score += 0.45; reasons.push('high severity'); }
    else if (n.severity === 'warn') { score += 0.25; reasons.push('medium severity'); }
    else { score += 0.10; }

    // Mentions force-pin
    if (n.isMention) { score += 0.30; reasons.push('you were @mentioned'); }

    // Recency (decays over a week)
    const ageDays = (TODAY_MS - new Date(n.ts).getTime()) / 86400000;
    const recency = Math.max(0, 1 - Math.abs(ageDays) / 7);
    score += recency * 0.20;
    if (recency > 0.7) reasons.push('recent');

    // Unread bonus
    if (!isRead(n.id)) { score += 0.05; }

    // User-context modifiers (your context teaches the ranker)
    if (isSnoozedNow(ctx)) {
      score *= 0.20; // big drop while snoozed
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

export function unreadCount(role: Role, userId: string): { total: number; urgent: number } {
  const all = allNotifications(role, userId);
  const unread = all.filter((n) => {
    if (isRead(n.id)) return false;
    if (isSnoozedNow(getContext(n.id))) return false;
    return true;
  });
  const urgent = unread.filter((n) => n.severity === 'urgent').length;
  return { total: unread.length, urgent };
}

export function topNotifications(role: Role, userId: string, limit: number, aiSort: boolean): Notification[] {
  const all = allNotifications(role, userId);
  const sorted = aiSort
    ? [...all].sort((a, b) => (b.aiPriority ?? 0) - (a.aiPriority ?? 0))
    : [...all].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return sorted.slice(0, limit);
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
