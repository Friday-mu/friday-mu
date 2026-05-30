// @demo:logic — ENTIRE FILE is computed-on-frontend logic that should be backend.
// Tag: PROD-LOGIC-5 — see frontend/DEMO_CRUFT.md
// Replace with: GET /api/pending-counts?role=:role&userId=:id (server-computed).
// Plus replace bumpRev/subscribePendingRev (lines ~314-328) with WebSocket/SSE.
// Sidebar pending-count signals — central registry per-module.
//
// Each module exports a `pendingCount*()` function. The sidebar reads
// `pendingCountFor(role, userId, moduleId)` (and optionally a sub-page id)
// and renders a small chip on the nav button when count > 0.
//
// Adding a new signal: add it to the relevant module's function. The
// framework scales — every "anything to do" signal across the system
// surfaces here, and badges update reactively when fixtures mutate via
// the existing bumpRev pattern.

import { TASKS } from './tasks';
import type { TaskUser } from './tasks';
import { FIN_EXPENSES } from './finance';
import { RESERVATIONS } from './reservations';
import { INBOX_THREADS } from './fixtures';
import { REVIEWS } from './reviews';
import { ROSTERS } from './roster';
import { PROPERTIES } from './properties';
import { portfolioInsights } from './properties';
import { liveOnlyMode } from './demoMode';

// T1.9 (2026-05-25): TODAY gating — wall clock in live-only mode, fixture
// anchor (2026-04-27) otherwise. Functions rather than module-load
// constants so a long-running tab rolls over at midnight in live mode.
function todayDate(): Date {
  return liveOnlyMode() ? new Date() : new Date('2026-04-27');
}
function todayMs(): number { return todayDate().getTime(); }
function todayDay(): number { return todayDate().getDate(); }
function todayMonth(): string { return todayDate().toISOString().slice(0, 7); }

type Role = TaskUser['role'];

export interface PendingCount {
  total: number;
  /** Tone hint for the chip. 'urgent' renders red; 'normal' renders neutral. */
  tone: 'normal' | 'urgent';
}

const ZERO: PendingCount = { total: 0, tone: 'normal' };

function combine(...counts: PendingCount[]): PendingCount {
  return counts.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      tone: acc.tone === 'urgent' || c.tone === 'urgent' ? 'urgent' : 'normal',
    }),
    ZERO,
  );
}

// ───────────────── Inbox ─────────────────
//
// Threads where there's something the current user needs to act on.
// Lumps owner + vendor + guest + team + syndic thread types into total
// (per-tab tabs land when Inbox phase 2 ships those subtypes).

export function pendingInbox(role: Role, _userId: string): PendingCount {
  if (role === 'external') return ZERO;
  let count = 0;
  let urgent = false;
  INBOX_THREADS.forEach((t) => {
    // Existing fixture has unread + isMention shapes; assume any thread without
    // a recent reply from us is "actionable". This is a conservative mock —
    // Phase 2 wires the real read-state ledger.
    if ((t as any).unread) {
      count++;
      // mention bumps urgency
      if ((t as any).isMention) urgent = true;
    }
  });
  return { total: count, tone: urgent ? 'urgent' : 'normal' };
}

// ───────────────── Operations ─────────────────
//
// Tasks where current user is on the assigneeIds list AND status is open
// AND dueDate <= today. Plus reported-issues that haven't been routed yet.

export function pendingOperations(role: Role, userId: string): PendingCount {
  if (role === 'external') return ZERO;

  const isManager = role === 'director' || role === 'ops_manager';

  const overdue = TASKS.filter((t) => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (t.dueDate > todayDate().toISOString().slice(0, 10)) return false; // not yet due
    // Manager sees team-wide overdue; field/commercial only sees own
    if (!isManager && !t.assigneeIds.includes(userId)) return false;
    return true;
  });

  const reported = TASKS.filter((t) => t.source === 'reported_issue' && t.status === 'reported');

  return {
    total: overdue.length + reported.length,
    tone: overdue.length > 0 ? 'urgent' : 'normal',
  };
}

export function pendingOperationsApprovals(role: Role): PendingCount {
  if (role !== 'director' && role !== 'ops_manager') return ZERO;
  if (liveOnlyMode()) return ZERO;
  // Director sees all pending; ops_manager sees medium-tier and below
  const pending = FIN_EXPENSES.filter((e) => {
    if (e.approvalStatus !== 'pending' && e.approvalStatus !== 'partial_proposed') return false;
    if (role === 'ops_manager') return e.approvalTier !== 'major';
    return true;
  });
  return { total: pending.length, tone: 'normal' };
}

// ───────────────── Calendar ─────────────────
//
// Reservations checking in today where access info hasn't been sent.

export function pendingCalendar(role: Role, _userId: string): PendingCount {
  if (role === 'external') return ZERO;
  const todayCheckins = RESERVATIONS.filter((r) => {
    return r.checkIn.startsWith(todayDate().toISOString().slice(0, 10)) && r.status === 'confirmed' && !r.accessInfoSentAt;
  });
  return {
    total: todayCheckins.length,
    tone: todayCheckins.length > 0 ? 'urgent' : 'normal',
  };
}

// ───────────────── Reservations ─────────────────
//
// Active inquiries needing response + reservations with balance due ≤ 3
// days before check-in.

export function pendingReservations(role: Role, _userId: string): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  const balanceCritical = RESERVATIONS.filter((r) => {
    if (r.status !== 'confirmed' || r.balanceDue <= 0) return false;
    const checkInMs = new Date(r.checkIn).getTime();
    const daysUntil = (checkInMs - todayMs()) / 86400000;
    return daysUntil >= 0 && daysUntil <= 3;
  });
  return { total: balanceCritical.length, tone: balanceCritical.length > 0 ? 'urgent' : 'normal' };
}

// ───────────────── Properties ─────────────────
//
// Onboarding stalled (>7 days since lastActivityAt) + Insights with high severity.

export function pendingProperties(role: Role, _userId: string): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  const stuck = PROPERTIES.filter((p) => {
    if (p.lifecycleStatus !== 'onboarding') return false;
    const days = (todayMs() - new Date(p.lastActivityAt).getTime()) / 86400000;
    return days > 7;
  });
  const highInsights = portfolioInsights().filter((i) => i.severity === 'high');
  return {
    total: stuck.length + highInsights.length,
    tone: stuck.length > 0 || highInsights.length > 0 ? 'urgent' : 'normal',
  };
}

export function pendingPropertiesOnboarding(role: Role): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  const stuck = PROPERTIES.filter((p) => {
    if (p.lifecycleStatus !== 'onboarding') return false;
    const days = (todayMs() - new Date(p.lastActivityAt).getTime()) / 86400000;
    return days > 7;
  });
  return { total: stuck.length, tone: stuck.length > 0 ? 'urgent' : 'normal' };
}

export function pendingPropertiesInsights(role: Role): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  const high = portfolioInsights().filter((i) => i.severity === 'high');
  return { total: high.length, tone: 'normal' };
}

// ───────────────── Reviews ─────────────────
//
// Unreplied reviews where the channel reply window is still open.

const REPLY_WINDOW_DAYS: Record<string, number> = {
  airbnb: 14,
  booking: 7,
  vrbo: 14,
  google: 30,
  direct: 30,
};

export function pendingReviews(role: Role, _userId: string): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  const unreplied = REVIEWS.filter((rv) => {
    if ((rv as any).replyText) return false;
    const submittedMs = new Date((rv as any).submittedAt ?? '2000-01-01').getTime();
    const days = (todayMs() - submittedMs) / 86400000;
    const window = REPLY_WINDOW_DAYS[(rv as any).channel as string] ?? 14;
    return days <= window;
  });
  return { total: unreplied.length, tone: 'normal' };
}

// ───────────────── Finance ─────────────────
//
// Expenses awaiting approval (role-tier-scoped) + end-of-month reconciliation
// when within last week of month and unreconciled items exist.

export function pendingFinance(role: Role, _userId: string): PendingCount {
  if (role === 'field' || role === 'external') return ZERO;
  if (role !== 'director' && role !== 'ops_manager') return ZERO;
  if (liveOnlyMode()) return ZERO;

  const approvals = FIN_EXPENSES.filter((e) => {
    if (e.approvalStatus !== 'pending' && e.approvalStatus !== 'partial_proposed') return false;
    if (role === 'ops_manager') return e.approvalTier !== 'major';
    return true;
  });

  // @demo:logic — Tag: PROD-LOGIC-13 — see frontend/DEMO_CRUFT.md
  // End-of-month reconciliation: last week of month + unreconciled posted/captured items
  const isMonthEnd = todayDay() >= 25;
  const monthEndItems = isMonthEnd
    ? FIN_EXPENSES.filter((e) => e.periodId === `p-${todayMonth()}` && e.status === 'pending_approval').length
    : 0;

  // Only surface a "reconciliation due" signal when there are real items to reconcile.
  // (Previously fired unconditionally on day >= 25 even with empty fixtures.)
  const reconSignal = isMonthEnd && monthEndItems > 0 ? 1 : 0;
  return {
    total: approvals.length + reconSignal,
    tone: approvals.some((a) => a.approvalTier === 'urgent_override' || a.approvalTier === 'major') ? 'urgent' : 'normal',
  };
}

export function pendingFinanceApprovals(role: Role): PendingCount {
  if (role !== 'director' && role !== 'ops_manager') return ZERO;
  if (liveOnlyMode()) return ZERO;
  const pending = FIN_EXPENSES.filter((e) => {
    if (e.approvalStatus !== 'pending' && e.approvalStatus !== 'partial_proposed') return false;
    if (role === 'ops_manager') return e.approvalTier !== 'major';
    return true;
  });
  return { total: pending.length, tone: pending.length > 0 ? 'normal' : 'normal' };
}

// ───────────────── HR / Operations · Roster ─────────────────
//
// Roster signal: published roster for current week that user hasn't acknowledged yet.
// Acknowledgement persists in localStorage (per device); visit to Roster sub-page
// marks it acknowledged.

const ROSTER_ACK_KEY = 'fad:roster-ack';

/** Roster ack stores the publishedAt that was acknowledged. A re-publish bumps
 *  publishedAt and the badge re-surfaces until the user visits again. */
export function rosterAckedFor(weekId: string, publishedAt: string | undefined): boolean {
  if (typeof window === 'undefined') return true;
  if (!publishedAt) return false;
  try {
    const stored = window.localStorage.getItem(`${ROSTER_ACK_KEY}:${weekId}`);
    return stored === publishedAt;
  } catch {
    return false;
  }
}

export function ackRosterWeek(weekId: string, publishedAt: string | undefined): void {
  if (typeof window === 'undefined' || !publishedAt) return;
  try {
    window.localStorage.setItem(`${ROSTER_ACK_KEY}:${weekId}`, publishedAt);
  } catch {
    // ignore
  }
}

export function pendingRoster(role: Role, _userId: string): PendingCount {
  if (role === 'external') return ZERO;
  const _today = todayDate().toISOString().slice(0, 10);
  const thisWeek = ROSTERS.find((r) => (r as any).status === 'published' && (r as any).weekStart <= _today && (r as any).weekEnd >= _today);
  if (!thisWeek) return ZERO;
  if (rosterAckedFor((thisWeek as any).id ?? 'this', (thisWeek as any).publishedAt)) return ZERO;
  return { total: 1, tone: 'normal' };
}

// ───────────────── HR ─────────────────
//
// Time-off requests awaiting approval (manager-only signal). Roster signal
// also surfaces here since HR is where staff usually look. Field role gets
// just the roster signal too.

export function pendingHR(role: Role, userId: string): PendingCount {
  // Roster ack is the universal HR signal (shows for everyone)
  const roster = pendingRoster(role, userId);
  if (role === 'field') return roster;
  if (role === 'external') return ZERO;
  // Phase 2: time-off-requests fixture not yet present; placeholder 0 for now
  return roster;
}

// ───────────────── Master switchboard ─────────────────

export function pendingCountFor(role: Role, userId: string, moduleId: string): PendingCount {
  if (liveOnlyMode()) return ZERO;
  switch (moduleId) {
    case 'inbox': return pendingInbox(role, userId);
    case 'operations': return pendingOperations(role, userId);
    case 'calendar': return pendingCalendar(role, userId);
    case 'reservations': return pendingReservations(role, userId);
    case 'properties': return pendingProperties(role, userId);
    case 'reviews': return pendingReviews(role, userId);
    case 'finance': return pendingFinance(role, userId);
    case 'hr': return pendingHR(role, userId);
    default: return ZERO;
  }
}

export function pendingCountForSubpage(role: Role, userId: string, moduleId: string, subPageId: string): PendingCount {
  if (liveOnlyMode()) return ZERO;
  if (moduleId === 'properties' && subPageId === 'onboarding') return pendingPropertiesOnboarding(role);
  if (moduleId === 'properties' && subPageId === 'insights') return pendingPropertiesInsights(role);
  if (moduleId === 'finance' && subPageId === 'approvals') return pendingFinanceApprovals(role);
  if (moduleId === 'operations' && subPageId === 'approvals') return pendingOperationsApprovals(role);
  if ((moduleId === 'operations' || moduleId === 'hr') && subPageId === 'roster') return pendingRoster(role, userId);
  return ZERO;
}

// Bump counter so badges re-compute when fixtures mutate. Modules that mutate
// fixtures call `bumpPendingRev()` to trigger re-render.
let pendingRev = 0;
export function bumpPendingRev(): void {
  pendingRev++;
  // Notify subscribers
  pendingRevSubscribers.forEach((cb) => cb(pendingRev));
}

const pendingRevSubscribers = new Set<(rev: number) => void>();
export function subscribePendingRev(cb: (rev: number) => void): () => void {
  pendingRevSubscribers.add(cb);
  return () => pendingRevSubscribers.delete(cb);
}

export function getPendingRev(): number {
  return pendingRev;
}

// ───────────────── Suppress unused helpers warning ─────────────────
const _unused = combine; void _unused;
