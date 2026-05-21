// @demo:data — Breezeway integration data — GET /api/integrations/breezeway
// Tag: PROD-DATA-12 — see frontend/DEMO_CRUFT.md

// Breezeway fixture-API shim.
// Phase 1: appends/mutates local fixture arrays + fires "would push to Breezeway" toast.
// Phase 2: swap internals to call real Breezeway endpoints. UI surface stays identical.
//
// Every write goes through this shim. Modules MUST NOT mutate fixture arrays directly.

import { TASKS, TASK_USERS, TASK_USER_BY_ID, type Task, type TaskComment, type TaskUser, type ActivityEntry } from './tasks';
import { TIME_OFF_REQUESTS, type TimeOffRequest } from './timeOff';
import { ROSTER_LAST_WEEK, ROSTER_NEXT_WEEK, ROSTER_THIS_WEEK } from './roster';
import { TEAM_MESSAGES, type ChannelKey, type TeamMessage } from './teamInbox';
import {
  RESERVATION_BY_ID,
  RESERVATION_NOTES,
  type Reservation,
  type ReservationNote,
} from './reservations';

type ToastEmitter = (message: string) => void;

let toastSink: ToastEmitter | null = null;

/**
 * Wire a toast callback once at app boot. The shim fires on every write.
 * Phase 2: keep the toast (still useful in dev) but back it with real API responses.
 */
export function registerBreezewayToast(emit: ToastEmitter): void {
  toastSink = emit;
}

function fireToast(message: string): void {
  if (toastSink) toastSink(message);
  // No-op silently if no sink wired yet — useful in tests / SSR.
}

// ───────────────── Helpers ─────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function makeTaskId(): string {
  return `t-${Math.random().toString(36).slice(2, 8)}`;
}

function makeCommentId(): string {
  return `c-${Math.random().toString(36).slice(2, 8)}`;
}

function makeActivityId(): string {
  return `a-${Math.random().toString(36).slice(2, 8)}`;
}

// ───────────────── Task writes ─────────────────

export interface CreateTaskInput {
  title: string;
  description?: string;
  propertyCode: string;
  department: Task['department'];
  subdepartment: Task['subdepartment'];
  priority: Task['priority'];
  status?: Task['status'];
  source: Task['source'];
  assigneeIds?: string[];
  requesterId?: string;
  dueDate: string;
  dueTime?: string;
  estimatedMinutes?: number;
  reservationId?: string;
  tags?: string[];
  inboxThreadId?: string;
  groupEmailId?: string;
  awaitingHumanApproval?: boolean;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const id = makeTaskId();
  const ts = nowIso();
  const task: Task = {
    id,
    title: input.title,
    description: input.description,
    propertyCode: input.propertyCode,
    department: input.department,
    subdepartment: input.subdepartment,
    priority: input.priority,
    status: input.status ?? (input.source === 'inbox_ai' || input.source === 'reported_issue' || input.source === 'review' ? 'reported' : 'scheduled'),
    source: input.source,
    visibility: 'all',
    assigneeIds: input.assigneeIds ?? [],
    requesterId: input.requesterId,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    estimatedMinutes: input.estimatedMinutes,
    reservationId: input.reservationId,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: input.tags ?? [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      {
        id: makeActivityId(),
        ts,
        kind: 'created',
        actorId: input.requesterId ?? 'system',
        detail: `Task created from ${input.source}`,
      },
    ],
    createdAt: ts,
    updatedAt: ts,
    inboxThreadId: input.inboxThreadId,
    groupEmailId: input.groupEmailId,
    awaitingHumanApproval: input.awaitingHumanApproval,
  };
  TASKS.push(task);
  fireToast(`Would push to Breezeway: create task "${task.title}" at ${task.propertyCode}`);
  return task;
}

export interface UpdateTaskInput {
  taskId: string;
  patch: Partial<Pick<
    Task,
    | 'title'
    | 'description'
    | 'priority'
    | 'status'
    | 'assigneeIds'
    | 'dueDate'
    | 'dueTime'
    | 'estimatedMinutes'
    | 'spentMinutes'
    | 'tags'
  >>;
  actorId: string;
}

export async function updateTask({ taskId, patch, actorId }: UpdateTaskInput): Promise<Task> {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  Object.assign(task, patch);
  task.updatedAt = nowIso();
  task.activityLog.push({
    id: makeActivityId(),
    ts: task.updatedAt,
    kind: patch.status ? 'status_changed' : 'updated',
    actorId,
    detail: patch.status ? `Status → ${patch.status}` : Object.keys(patch).join(', '),
  });
  if (patch.status === 'completed') task.completedAt = task.updatedAt;
  fireToast(`Would push to Breezeway: update task ${taskId}`);
  return task;
}

// ───────────────── Cost-to-Finance integration ─────────────────

import { FIN_EXPENSES, type FinExpense } from './finance';

export interface AddCostInput {
  taskId: string;
  type: 'labor' | 'material' | 'expense' | 'tax' | 'skilled_labor' | 'unskilled_labor' | 'mileage' | 'markup';
  amount: number;
  currency: 'MUR' | 'EUR';
  description: string;
  ownerCharge: boolean;
  addedBy: string;
}

const FINANCE_THRESHOLD_MINOR = 500_000; // Rs 5,000 — above this triggers Path-A owner approval

/**
 * Add a cost line to a task. If `ownerCharge: true`, also create a Finance
 * expense capture with `sourceTaskId` set, kicking off the Path-A approval
 * flow when the amount crosses threshold.
 */
export async function addCost(input: AddCostInput): Promise<{ costId: string; flowedToFinanceExpenseId?: string }> {
  const task = TASKS.find((t) => t.id === input.taskId);
  if (!task) throw new Error(`Task ${input.taskId} not found`);
  const ts = nowIso();
  const costId = `cs-${Math.random().toString(36).slice(2, 8)}`;

  let flowedToFinanceExpenseId: string | undefined;

  if (input.ownerCharge) {
    // Create a FinExpense capture pointed back at the task.
    const expenseId = `e-${Math.random().toString(36).slice(2, 6)}`;
    const amountMinor = Math.round(input.amount * 100);
    const expense: FinExpense = {
      id: expenseId,
      occurredAt: ts.slice(0, 19).replace('T', ' '),
      enteredAt: ts.slice(0, 19).replace('T', ' '),
      vendorId: '',
      vendorName: 'task-originated',
      vendorUnrecognized: true,
      amountMinor,
      currency: input.currency,
      categoryCode: input.type === 'labor' || input.type === 'skilled_labor' || input.type === 'unskilled_labor' ? 'FR-MAI' : 'FR-REP',
      billTo: 'owner',
      propertyCode: task.propertyCode,
      description: input.description,
      status: amountMinor > FINANCE_THRESHOLD_MINOR ? 'pending_approval' : 'submitted',
      approvalTier: amountMinor > FINANCE_THRESHOLD_MINOR ? 'medium' : 'routine',
      approvalStatus: amountMinor > FINANCE_THRESHOLD_MINOR ? 'pending' : undefined,
      entryMode: 'team_breezeway',
      enteredBy: input.addedBy,
      brzTaskId: task.bzId,
      receipts: 0,
      periodId: 'p-2026-04',
      sourceTaskId: task.id,
    };
    FIN_EXPENSES.push(expense);
    flowedToFinanceExpenseId = expenseId;
    fireToast(`Cost added · flowing to Finance for ${expense.status === 'pending_approval' ? 'owner approval' : 'capture'}`);
  } else {
    fireToast('Cost added · internal (Friday absorbs)');
  }

  task.costs.push({
    id: costId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    addedBy: input.addedBy,
    ownerCharge: input.ownerCharge,
    flowedToFinanceExpenseId,
  });
  if (input.ownerCharge) task.ownerCharge = true;

  task.activityLog.push({
    id: makeActivityId(),
    ts,
    kind: 'cost_added',
    actorId: input.addedBy,
    detail: `${input.amount.toLocaleString()} ${input.currency} · ${input.description}${input.ownerCharge ? ' · owner-billable' : ''}`,
  });
  task.updatedAt = ts;

  return { costId, flowedToFinanceExpenseId };
}

/**
 * Phase 1 heuristic for owner-billable cost suggestion.
 * Phase 2 swaps to LLM evaluation over historical data.
 */
export function suggestOwnerCharge(input: { description: string; type: string; amountMinor: number }): {
  suggested: boolean;
  confidence: number;
  reasoning: string;
} {
  const text = input.description.toLowerCase();
  const isCapex = /\b(replace|replacement|install|installation|compressor|boiler|heater|panel|new unit|capex|major repair|appliance)\b/.test(text);
  const isRoutine = /\b(routine|cleaning|inspection|checkup|tune.up|minor|fluid|service|amenities|stocking)\b/.test(text);

  if (isCapex && !isRoutine) {
    return {
      suggested: true,
      confidence: 0.87,
      reasoning: `${input.description.length > 40 ? input.description.slice(0, 40) + '…' : input.description} — capex-class repair, falls outside routine maintenance covered by management fee.`,
    };
  }
  if (isRoutine && !isCapex) {
    return {
      suggested: false,
      confidence: 0.82,
      reasoning: 'Routine maintenance — typically absorbed by management fee, not owner-billable.',
    };
  }
  if (input.amountMinor > 1_000_000) {
    return {
      suggested: true,
      confidence: 0.71,
      reasoning: 'High-value cost — likely owner-billable, but please review.',
    };
  }
  return {
    suggested: false,
    confidence: 0.55,
    reasoning: 'Unclear — defaulting to internal. Override if this is a passthrough cost.',
  };
}

export async function addComment(input: {
  taskId: string;
  authorId: string;
  text: string;
  mentions?: string[];
}): Promise<TaskComment> {
  const task = TASKS.find((t) => t.id === input.taskId);
  if (!task) throw new Error(`Task ${input.taskId} not found`);
  const ts = nowIso();
  const comment: TaskComment = {
    id: makeCommentId(),
    authorId: input.authorId,
    text: input.text,
    ts,
    mentions: input.mentions,
    syncedToBreezeway: false,
  };
  task.comments.push(comment);
  task.activityLog.push({
    id: makeActivityId(),
    ts,
    kind: 'commented',
    actorId: input.authorId,
    detail: input.text.length > 60 ? input.text.slice(0, 57) + '…' : input.text,
  });
  task.updatedAt = ts;
  fireToast(`Would push to Breezeway: comment on task ${task.id}`);
  return comment;
}

export async function approveAiDraft(taskId: string, actorId: string): Promise<Task> {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.awaitingHumanApproval = false;
  task.updatedAt = nowIso();
  task.activityLog.push({
    id: makeActivityId(),
    ts: task.updatedAt,
    kind: 'approved',
    actorId,
    detail: 'AI draft approved → pushed to Breezeway',
  });
  fireToast(`Would push to Breezeway: approve and create AI-drafted task "${task.title}"`);
  return task;
}

export async function dismissAiDraft(taskId: string, actorId: string): Promise<void> {
  const idx = TASKS.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  TASKS.splice(idx, 1);
  fireToast(`AI draft dismissed (would NOT push to Breezeway)`);
}

// ───────────────── Reads ─────────────────

export async function fetchTasks(filter?: {
  propertyCode?: string;
  status?: Task['status'];
  assigneeId?: string;
}): Promise<Task[]> {
  let result = [...TASKS];
  if (filter?.propertyCode) result = result.filter((t) => t.propertyCode === filter.propertyCode);
  if (filter?.status) result = result.filter((t) => t.status === filter.status);
  if (filter?.assigneeId) result = result.filter((t) => t.assigneeIds.includes(filter.assigneeId!));
  return result;
}

export async function fetchTask(taskId: string): Promise<Task | undefined> {
  return TASKS.find((t) => t.id === taskId);
}

// ───────────────── Roster sync stub ─────────────────

export async function publishRosterToBreezeway(weekId: string, actorId: string): Promise<void> {
  fireToast(`Would push to Breezeway: publish roster ${weekId} (sets staff availability)`);
}

// ───────────────── HR shim ─────────────────

export type CreateStaffInput = Omit<TaskUser, 'id' | 'initials' | 'avatarColor' | 'active'>;

export async function createStaff(input: CreateStaffInput): Promise<TaskUser> {
  const id = `u-${input.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}-${Math.random().toString(36).slice(2, 5)}`;
  const initials = input.name
    .split(' ')
    .map((n) => n[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  const palette = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#84cc16', '#ec4899', '#6366f1'];
  const avatarColor = palette[Math.floor(Math.random() * palette.length)];
  const user: TaskUser = {
    ...input,
    id,
    initials,
    avatarColor,
    active: true,
  };
  TASK_USERS.push(user);
  fireToast(`Staff added: ${user.name}`);
  return user;
}

export async function updateStaff(id: string, patch: Partial<TaskUser>): Promise<TaskUser | undefined> {
  const user = TASK_USERS.find((u) => u.id === id);
  if (!user) return undefined;
  Object.assign(user, patch);
  fireToast(`Staff updated: ${user.name}`);
  return user;
}

export interface CreateTimeOffInput {
  userId: string;
  startDate: string;
  endDate: string;
  type: TimeOffRequest['type'];
  reason?: string;
}

export async function createTimeOffRequest(input: CreateTimeOffInput): Promise<TimeOffRequest> {
  const req: TimeOffRequest = {
    id: `to-${Date.now()}`,
    ...input,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  TIME_OFF_REQUESTS.push(req);
  fireToast(`Time-off request submitted (${input.startDate} → ${input.endDate})`);
  return req;
}

export async function decideTimeOff(
  requestId: string,
  decision: 'approved' | 'declined',
  reviewerId: string,
  notes?: string,
): Promise<TimeOffRequest | undefined> {
  const req = TIME_OFF_REQUESTS.find((r) => r.id === requestId);
  if (!req) return undefined;
  req.status = decision;
  req.reviewedBy = reviewerId;
  req.reviewedAt = new Date().toISOString();
  req.reviewNotes = notes;

  if (decision === 'approved') {
    // Auto-flip RosterDay cells overlapping the request window.
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    const weeks = [ROSTER_LAST_WEEK, ROSTER_THIS_WEEK, ROSTER_NEXT_WEEK];
    let touched = 0;
    for (const week of weeks) {
      for (const day of week.days) {
        if (day.userId !== req.userId) continue;
        const dayDate = new Date(day.date);
        if (dayDate >= start && dayDate <= end) {
          day.availability = 'leave';
          day.zone = null;
          day.leaveType = req.type;
          touched++;
        }
      }
    }
    fireToast(`Time-off approved · ${touched} roster day${touched === 1 ? '' : 's'} updated`);
  } else {
    fireToast(`Time-off declined`);
  }

  return req;
}

// ───────────────── Team Inbox shim ─────────────────

/**
 * Append a system message to a Team Inbox channel. Used by the Roster Publish
 * flow (T5) to post to #ops, and any other module that wants to surface state
 * changes inside the team feed.
 */
export function postToTeamChannel(
  channelKey: ChannelKey,
  text: string,
  authorId: string,
  kind: TeamMessage['kind'] = 'text',
): TeamMessage {
  const message: TeamMessage = {
    id: `tm-${Date.now()}`,
    channelKey,
    authorId,
    text,
    ts: new Date().toISOString(),
    kind,
  };
  TEAM_MESSAGES.push(message);
  return message;
}

// Re-export the activity entry type so consumers don't need a second import.
export type { ActivityEntry } from './tasks';

// ───────────────── Finance reconciliation writes (Mathias additions) ─────────────────
// Items A + B: applies the corrective Owner Charge / fare-line split when
// Mathias one-clicks Apply on a flagged discrepancy. Item C below.
//
// Imports for FIN_EXPENSES / FinExpense / TEAM_MESSAGES are reused from
// the existing module-top imports.

import { FIN_ESCALATION_CHAIN } from './finance';
import {
  proposeOwnerCharge,
  proposeFareSplit,
  type PayoutDiscrepancy,
} from './financeAnomalies';

function makeExpenseId(): string {
  return `e-rec-${Math.random().toString(36).slice(2, 8)}`;
}

/** Item A · apply Owner Charge for an Airbnb resolution-centre / BDC
 *  discount discrepancy. Adds a corrective FinExpense + marks the
 *  discrepancy resolved. */
export function applyOwnerCharge(
  d: PayoutDiscrepancy,
  actorId: string,
): { expense: FinExpense; discrepancy: PayoutDiscrepancy } {
  const proposal = proposeOwnerCharge(d);
  const id = makeExpenseId();
  const expense: FinExpense = {
    id,
    occurredAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    enteredAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    vendorId: '',
    vendorName: 'Owner Charge — reconciliation',
    amountMinor: proposal.amountMinor,
    currency: proposal.currency,
    categoryCode: proposal.category,
    billTo: 'owner',
    propertyCode: proposal.propertyCode,
    description: proposal.description,
    status: 'posted',
    entryMode: 'admin_direct',
    enteredBy: TASK_USER_BY_ID[actorId]?.name ?? 'Mathias',
    receipts: 0,
    periodId: d.periodId,
    reservationId: d.reservationId,
  };
  FIN_EXPENSES.push(expense);
  d.resolvedExpenseId = expense.id;
  d.resolvedAt = new Date().toISOString();
  d.resolvedBy = actorId;
  fireToast(`Owner Charge posted · ${expense.propertyCode} · ${proposal.amountMinor / 100} ${proposal.currency}`);
  return { expense, discrepancy: d };
}

/** Item B · apply fare-line split for a special-offer-collapse
 *  discrepancy. Phase 1 mutates the discrepancy state only (real fare-line
 *  rewrite needs Guesty write API · Phase 3). */
export function applyFareCollapseSplit(
  d: PayoutDiscrepancy,
  actorId: string,
): { split: ReturnType<typeof proposeFareSplit>; discrepancy: PayoutDiscrepancy } {
  const split = proposeFareSplit(d);
  d.resolvedAt = new Date().toISOString();
  d.resolvedBy = actorId;
  fireToast(`Fare split queued · ${d.propertyCode} · cleaning fee re-instated`);
  return { split, discrepancy: d };
}

// ───────────────── Item C — internal approval routing (Slack → FAD Inbox) ─────────────────
//
// Replaces the originally-locked Slack-DM-Ishant flow per running decisions
// log §3.1. Posts to FAD Inbox #finance instead of Slack, and runs a tiered
// escalation if the tier-1 recipient stays silent.

import type { FinanceEscalationMeta, FinanceEscalationTier } from './teamInbox';

function makeRequestId(): string {
  return `req-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RequestRefundApprovalInput {
  reservationId?: string;
  amountMinor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  requestorId: string;
  reason: string;
  urgent?: boolean;
}

/**
 * Mathias-or-Franny initiates a refund/reconciliation request that exceeds
 * their authority cap. Posts the tier-1 ask to #finance in FAD Inbox.
 * Returns the request id so the caller can render a "waiting on Ishant"
 * inline state.
 *
 * If `urgent` is true, the runtime would also schedule the tier-2 phone
 * escalation after `tier1.silentTimeoutMins`. Phase 1 we just stage the
 * tier-1 message; the real timer-driven escalation lives in the backend.
 */
export function requestRefundApproval(input: RequestRefundApprovalInput): {
  requestId: string;
  tier: FinanceEscalationTier;
  recipientId: string;
} {
  const requestId = makeRequestId();
  const chain = FIN_ESCALATION_CHAIN;
  const recipientId = chain.tier1.recipientId;
  const requestor = TASK_USER_BY_ID[input.requestorId];
  const recipient = TASK_USER_BY_ID[recipientId];

  const meta: FinanceEscalationMeta = {
    requestId,
    requestorId: input.requestorId,
    recipientId,
    reservationId: input.reservationId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    urgent: input.urgent,
    tier: 't1_inbox',
  };

  const message = {
    id: `tm-fin-${Date.now()}`,
    channelKey: chain.tier1.channelKey,
    authorId: input.requestorId,
    text:
      `${recipient?.name ?? 'Ishant'} — approval needed.\n` +
      `Amount: ${(input.amountMinor / 100).toLocaleString()} ${input.currency}.\n` +
      (input.reservationId ? `Reservation: ${input.reservationId}.\n` : '') +
      `Reason: ${input.reason}.` +
      (input.urgent ? '\n⚠ Urgent — auto-escalates to phone in 30 min if silent.' : ''),
    ts: new Date().toISOString(),
    mentions: [recipientId],
    kind: 'finance_escalation' as const,
    financeEscalation: meta,
  };
  TEAM_MESSAGES.push(message);
  fireToast(
    `Approval request sent to ${recipient?.name ?? 'Ishant'} · #finance` +
      (input.urgent ? ' · escalates to phone in 30 min' : ''),
  );
  return { requestId, tier: 't1_inbox', recipientId };
}

/** Manually advance a stuck request through the chain (T1 → T2 → T3). Used
 *  by the backend cron in production; in Phase 1 we expose it for test /
 *  manual-advance buttons in the SettingsEscalation panel. */
export function postFinanceEscalation(
  requestId: string,
  toTier: FinanceEscalationTier,
  payload: { reason: string; amountMinor: number; currency: 'MUR' | 'EUR' | 'USD'; requestorId: string },
): void {
  const chain = FIN_ESCALATION_CHAIN;
  let recipientId: string;
  let body: string;
  if (toTier === 't2_phone_3cx') {
    recipientId = chain.tier2.recipientId;
    body = `📞 Calling ${TASK_USER_BY_ID[recipientId]?.name ?? 'Ishant'} via 3CX · request ${requestId} silent for ${chain.tier1.silentTimeoutMins}m.`;
  } else if (toTier === 't3_fallback') {
    const overCap = payload.amountMinor > chain.tier3.fallbackApprovalCapMinor;
    recipientId = overCap ? chain.tier3.finalFallbackRecipientId : chain.tier3.recipientId;
    body =
      overCap
        ? `Final fallback to ${TASK_USER_BY_ID[recipientId]?.name ?? 'Franny'} — amount exceeds Mathias's Rs ${(chain.tier3.fallbackApprovalCapMinor / 100).toLocaleString()} fallback cap.`
        : `Fallback to ${TASK_USER_BY_ID[recipientId]?.name ?? 'Mathias'} — Ishant unavailable. Mathias may approve up to Rs ${(chain.tier3.fallbackApprovalCapMinor / 100).toLocaleString()}.`;
  } else {
    return;
  }
  TEAM_MESSAGES.push({
    id: `tm-fin-${Date.now()}`,
    channelKey: 'finance',
    authorId: payload.requestorId,
    text: body,
    ts: new Date().toISOString(),
    mentions: [recipientId],
    kind: 'finance_escalation',
    financeEscalation: {
      requestId,
      requestorId: payload.requestorId,
      recipientId,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      reason: payload.reason,
      tier: toTier,
    },
  });
}

// ───────────────── Reservation writes ─────────────────

function makeNoteId(): string {
  return `rnote-${Math.random().toString(36).slice(2, 8)}`;
}

export function addReservationNote(input: {
  reservationId: string;
  authorId: string;
  body: string;
  mentions: string[];
}): ReservationNote {
  const author = TASK_USER_BY_ID[input.authorId];
  const note: ReservationNote = {
    id: makeNoteId(),
    reservationId: input.reservationId,
    authorId: input.authorId,
    authorName: author?.name ?? 'Unknown',
    body: input.body,
    mentions: input.mentions,
    createdAt: new Date().toISOString(),
  };
  RESERVATION_NOTES.push(note);
  return note;
}

/**
 * Mutate a reservation's check-in / check-out time and queue a Guesty-sync
 * task so the ops manager can manually push the change upstream until we
 * have a real Guesty integration. Returns { reservation, syncTask } so the
 * caller can re-render and toast.
 */
export async function updateReservationTimes(input: {
  reservationId: string;
  checkIn?: string;
  checkOut?: string;
  actorId: string;
}): Promise<{ reservation: Reservation; syncTask: Task }> {
  const rsv = RESERVATION_BY_ID[input.reservationId];
  if (!rsv) throw new Error(`Reservation ${input.reservationId} not found`);

  const changes: string[] = [];
  if (input.checkIn && input.checkIn !== rsv.checkIn) {
    changes.push(`check-in ${formatDt(rsv.checkIn)} → ${formatDt(input.checkIn)}`);
    rsv.checkIn = input.checkIn;
  }
  if (input.checkOut && input.checkOut !== rsv.checkOut) {
    changes.push(`check-out ${formatDt(rsv.checkOut)} → ${formatDt(input.checkOut)}`);
    rsv.checkOut = input.checkOut;
  }
  // Recompute nights from the (possibly updated) window.
  rsv.nights = Math.max(
    1,
    Math.round(
      (new Date(rsv.checkOut).getTime() - new Date(rsv.checkIn).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );

  // Find the ops_manager(s) — typically one user (Franny). If none in the
  // fixture, fall back to assigning the actor so the task isn't orphaned.
  const opsManagers = TASK_USERS.filter((u) => u.role === 'ops_manager' && u.active).map(
    (u) => u.id,
  );
  const assigneeIds = opsManagers.length > 0 ? opsManagers : [input.actorId];

  const syncTask = await createTask({
    title: `Update Guesty: ${rsv.guestName} ${changes.join(', ')}`,
    description: `Reservation ${rsv.id} (${rsv.propertyCode}) was updated in FAD. Push the new time(s) to Guesty so the channel partners see the same window.`,
    propertyCode: rsv.propertyCode,
    department: 'office',
    subdepartment: 'admin',
    priority: 'high',
    source: 'manual',
    assigneeIds,
    requesterId: input.actorId,
    dueDate: new Date().toISOString().slice(0, 10),
    reservationId: rsv.id,
  });

  return { reservation: rsv, syncTask };
}

function formatDt(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}
