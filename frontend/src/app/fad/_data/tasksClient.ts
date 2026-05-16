'use client';

// API-driven tasks client. Mirrors the function signatures from
// `breezeway.ts` so components (OperationsModule, TaskDetail,
// CreateTaskDrawer, AddCostDrawer) can swap imports without touching
// the JSX or call shape.
//
// Snake_case ↔ camelCase mapping lives here exclusively — the
// backend uses snake (`assignee_user_ids`, `property_code`, etc.)
// while the existing fixture-typed `Task` interface (and 1600+
// lines of consumer code) use camel (`assigneeIds`, `propertyCode`).
//
// The legacy `breezeway.ts` still exports owner-charge → Finance
// integration, staff CRUD, time-off, and other ops surfaces that
// haven't moved to API yet. This file only owns the tasks /
// comments / costs surface.

import { apiFetch } from '../../../components/types';
import type {
  Task,
  TaskComment,
  TaskCost,
  TaskStatus,
  TaskPriority,
  TaskSource,
  TaskVisibility,
  Department,
  Subdepartment,
} from './tasks';
import {
  addTaskToCache,
  removeTaskFromCache,
  replaceTaskInCache,
} from './useApiTasks';

// ─── Shape mappers (server → client) ─────────────────────────────

interface ServerComment {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_display_name: string | null;
  text: string;
  mentions: string[];
  synced_to_breezeway: boolean;
  created_at: string;
}

interface ServerCost {
  id: string;
  task_id: string;
  type: TaskCost['type'];
  amount_minor: number;
  currency_code: string;
  description: string | null;
  added_by_user_id: string | null;
  added_by_display_name: string | null;
  owner_charge: boolean;
  flowed_to_finance_expense_id: string | null;
  created_at: string;
}

interface ServerTask {
  id: string;
  tenant_id: string;
  project_id: string | null;
  bz_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  source: string;
  visibility: string;
  department: string | null;
  subdepartment: string | null;
  property_code: string | null;
  reservation_guesty_id: string | null;
  inbox_thread_id: string | null;
  group_email_id: string | null;
  template: string | null;
  is_recurring: boolean;
  awaiting_human_approval: boolean;
  tags: string[];
  assignee_user_ids: string[];
  assignee_display_names: (string | null)[];
  requester_user_id: string | null;
  created_by_user_id: string | null;
  due_date: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
  spent_minutes: number | null;
  attachment_count: number;
  ai_suggestions: Task['aiSuggestions'];
  activity_log: Task['activityLog'];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  comments?: ServerComment[];
  costs?: ServerCost[];
}

function mapComment(s: ServerComment): TaskComment {
  return {
    id: s.id,
    authorId: s.author_user_id || 'unknown',
    text: s.text,
    ts: s.created_at,
    mentions: s.mentions || [],
    syncedToBreezeway: s.synced_to_breezeway,
  };
}

function mapCost(s: ServerCost): TaskCost {
  return {
    id: s.id,
    type: s.type,
    // amount_minor → amount (major units, e.g. 1250 → 12.5)
    amount: s.amount_minor / 100,
    currency: s.currency_code as TaskCost['currency'],
    description: s.description || '',
    addedBy: s.added_by_user_id || 'unknown',
    ownerCharge: s.owner_charge,
    flowedToFinanceExpenseId: s.flowed_to_finance_expense_id || undefined,
  };
}

// Backend status set is a superset of the fixture's. The 'done' alias
// shouldn't come back from the server (we normalise on write) but
// just in case, fall through.
function mapStatus(s: string): TaskStatus {
  if (s === 'done') return 'completed';
  return s as TaskStatus;
}

function mapTask(s: ServerTask): Task {
  return {
    id: s.id,
    bzId: s.bz_id || undefined,
    title: s.title,
    description: s.description || undefined,
    propertyCode: s.property_code || '',
    department: (s.department as Department) || 'office',
    subdepartment: (s.subdepartment as Subdepartment) || 'admin',
    priority: s.priority as TaskPriority,
    status: mapStatus(s.status),
    source: (s.source as TaskSource) || 'manual',
    visibility: (s.visibility as TaskVisibility) || 'all',
    assigneeIds: s.assignee_user_ids || [],
    requesterId: s.requester_user_id || undefined,
    dueDate: s.due_date || '',
    dueTime: s.due_time || undefined,
    estimatedMinutes: s.estimated_minutes ?? undefined,
    spentMinutes: s.spent_minutes ?? undefined,
    reservationId: s.reservation_guesty_id || undefined,
    ownerCharge: (s.costs || []).some((c) => c.owner_charge) || undefined,
    attachmentCount: s.attachment_count ?? 0,
    comments: (s.comments || []).map(mapComment),
    costs: (s.costs || []).map(mapCost),
    isRecurring: s.is_recurring,
    template: s.template || undefined,
    tags: s.tags || [],
    riskFlags: [],
    aiSuggestions: s.ai_suggestions || [],
    activityLog: s.activity_log || [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    completedAt: s.completed_at || undefined,
    awaitingHumanApproval: s.awaiting_human_approval,
    inboxThreadId: s.inbox_thread_id || undefined,
    groupEmailId: s.group_email_id || undefined,
  };
}

// ─── UUID safety ─────────────────────────────────────────────────
//
// Components still pass fixture user ids like 'u-judith' / 'u-ishant'
// from the TASK_USERS demo data (deeper refactor — see avatar-fix
// handover). The backend's users + tasks tables expect real UUIDs;
// passing 'u-judith' as `requester_user_id` or in
// `assignee_user_ids` blows up with `invalid input syntax for type
// uuid`. Filter to UUIDs only on the wire; the fixture-id case
// silently drops to null/[] which renders cleanly.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asUuidOrNull(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}
function uuidsOnly(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
}

// ─── Public API (matches breezeway.ts signatures) ────────────────

export async function fetchTasks(filter?: {
  assignee?: 'me' | string;
  status?: TaskStatus[];
  property?: string;
  reservation?: string;
  project?: string;
  overdue?: boolean;
}): Promise<Task[]> {
  const qs = new URLSearchParams();
  if (filter?.assignee) qs.set('assignee', filter.assignee);
  if (filter?.status?.length) qs.set('status', filter.status.join(','));
  if (filter?.property) qs.set('property', filter.property);
  if (filter?.reservation) qs.set('reservation', filter.reservation);
  if (filter?.project) qs.set('project', filter.project);
  if (filter?.overdue) qs.set('overdue', 'true');
  const path = '/api/tasks' + (qs.toString() ? `?${qs}` : '');
  const res = (await apiFetch(path)) as { tasks: ServerTask[] };
  return (res?.tasks || []).map(mapTask);
}

export async function fetchTask(taskId: string): Promise<Task | undefined> {
  try {
    const res = (await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`)) as ServerTask;
    return mapTask(res);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) return undefined;
    throw e;
  }
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  propertyCode?: string;
  department?: Department;
  subdepartment?: Subdepartment;
  priority?: TaskPriority;
  source?: TaskSource;
  visibility?: TaskVisibility;
  assigneeIds?: string[];
  requesterId?: string;
  dueDate?: string;
  dueTime?: string;
  estimatedMinutes?: number;
  reservationId?: string;
  projectId?: string;
  tags?: string[];
  inboxThreadId?: string;
  groupEmailId?: string;
  awaitingHumanApproval?: boolean;
  category?: string;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = (await apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      property_code: input.propertyCode,
      department: input.department,
      subdepartment: input.subdepartment,
      priority: input.priority || 'medium',
      source: input.source || 'manual',
      visibility: input.visibility || 'all',
      assignee_user_ids: uuidsOnly(input.assigneeIds),
      requester_user_id: asUuidOrNull(input.requesterId),
      due_date: input.dueDate,
      due_time: input.dueTime,
      estimated_minutes: input.estimatedMinutes,
      reservation_guesty_id: input.reservationId,
      project_id: input.projectId,
      tags: input.tags || [],
      inbox_thread_id: input.inboxThreadId,
      group_email_id: input.groupEmailId,
      awaiting_human_approval: input.awaitingHumanApproval,
      category: input.category,
    }),
  })) as ServerTask;
  const task = mapTask(res);
  addTaskToCache(task);
  return task;
}

export interface UpdateTaskInput {
  taskId: string;
  patch: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    visibility: TaskVisibility;
    department: Department;
    subdepartment: Subdepartment;
    propertyCode: string;
    reservationId: string;
    assigneeIds: string[];
    dueDate: string;
    dueTime: string;
    estimatedMinutes: number;
    spentMinutes: number;
    awaitingHumanApproval: boolean;
    tags: string[];
    category: string;
  }>;
  actorId?: string;
}

export async function updateTask({ taskId, patch }: UpdateTaskInput): Promise<Task> {
  // Map camel → snake. Only include keys actually present in patch.
  const body: Record<string, unknown> = {};
  if ('title' in patch) body.title = patch.title;
  if ('description' in patch) body.description = patch.description;
  if ('status' in patch) body.status = patch.status;
  if ('priority' in patch) body.priority = patch.priority;
  if ('visibility' in patch) body.visibility = patch.visibility;
  if ('department' in patch) body.department = patch.department;
  if ('subdepartment' in patch) body.subdepartment = patch.subdepartment;
  if ('propertyCode' in patch) body.property_code = patch.propertyCode;
  if ('reservationId' in patch) body.reservation_guesty_id = patch.reservationId;
  if ('assigneeIds' in patch) body.assignee_user_ids = uuidsOnly(patch.assigneeIds);
  if ('dueDate' in patch) body.due_date = patch.dueDate;
  if ('dueTime' in patch) body.due_time = patch.dueTime;
  if ('estimatedMinutes' in patch) body.estimated_minutes = patch.estimatedMinutes;
  if ('spentMinutes' in patch) body.spent_minutes = patch.spentMinutes;
  if ('awaitingHumanApproval' in patch) body.awaiting_human_approval = patch.awaitingHumanApproval;
  if ('tags' in patch) body.tags = patch.tags;
  if ('category' in patch) body.category = patch.category;

  const res = (await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })) as ServerTask;
  const task = mapTask(res);
  replaceTaskInCache(task);
  return task;
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  removeTaskFromCache(taskId);
}

export interface AddCommentInput {
  taskId: string;
  authorId: string;
  text: string;
  mentions?: string[];
}

export async function addComment(input: AddCommentInput): Promise<TaskComment> {
  const res = (await apiFetch(`/api/tasks/${encodeURIComponent(input.taskId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      text: input.text,
      mentions: input.mentions || [],
    }),
  })) as ServerComment;
  // Refresh the cached task so consumers re-render with the new
  // comment without a manual refetch. Best-effort; the comment is
  // already in the DB.
  void fetchTask(input.taskId).then((t) => { if (t) replaceTaskInCache(t); }).catch(() => {});
  return mapComment(res);
}

export interface AddCostInput {
  taskId: string;
  type: TaskCost['type'];
  amount: number;        // major units (e.g. 12.5 = MUR 12.50)
  currency: TaskCost['currency'];
  description: string;
  ownerCharge: boolean;
  addedBy: string;       // currentUserId (kept for parity; backend reads from JWT)
}

export async function addCost(input: AddCostInput): Promise<TaskCost> {
  const res = (await apiFetch(`/api/tasks/${encodeURIComponent(input.taskId)}/costs`, {
    method: 'POST',
    body: JSON.stringify({
      type: input.type,
      amount_minor: Math.round(input.amount * 100),
      currency_code: input.currency,
      description: input.description,
      owner_charge: input.ownerCharge,
    }),
  })) as ServerCost;
  void fetchTask(input.taskId).then((t) => { if (t) replaceTaskInCache(t); }).catch(() => {});
  return mapCost(res);
}

export async function deleteCost(taskId: string, costId: string): Promise<void> {
  await apiFetch(
    `/api/tasks/${encodeURIComponent(taskId)}/costs/${encodeURIComponent(costId)}`,
    { method: 'DELETE' },
  );
  void fetchTask(taskId).then((t) => { if (t) replaceTaskInCache(t); }).catch(() => {});
}
