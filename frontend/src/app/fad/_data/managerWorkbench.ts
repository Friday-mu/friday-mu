import type { Task, TaskPriority, TaskStatus } from './tasks';
import { suggestSupplyLoadout } from './supplies';

const CLOSED_STATUSES = new Set<TaskStatus>(['completed', 'closed', 'cancelled']);
const WATCHED_OPEN_STATUSES = new Set<TaskStatus>(['in_progress', 'paused', 'blocked']);
const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const STALE_OPEN_HOURS = 4;

export interface StaleOpenTaskSignal {
  task: Task;
  reason: string;
  minutesSinceUpdate?: number;
  overEstimateMinutes?: number;
}

export interface SupplyPrepSignal {
  task: Task;
  suggestedCount: number;
  reason: string;
}

export interface StaffLoadSignal {
  assigneeId: string;
  assigneeName?: string;
  openCount: number;
  urgentCount: number;
  staleCount: number;
}

export interface ManagerWorkbenchSignals {
  staleOpen: StaleOpenTaskSignal[];
  openReportedIssues: Task[];
  inboxAiReported: Task[];
  supplyPrep: SupplyPrepSignal[];
  staffLoad: StaffLoadSignal[];
  unassignedOpen: Task[];
}

export function isOpenTask(task: Task): boolean {
  return !CLOSED_STATUSES.has(task.status);
}

export function detectStaleOpenTasks(
  tasks: Task[],
  options: { now?: Date; today?: string; staleAfterHours?: number } = {},
): StaleOpenTaskSignal[] {
  const now = options.now ?? new Date();
  const today = options.today ?? isoDate(now);
  const staleAfterHours = options.staleAfterHours ?? STALE_OPEN_HOURS;

  return tasks
    .filter((task) => isOpenTask(task) && WATCHED_OPEN_STATUSES.has(task.status))
    .map((task): StaleOpenTaskSignal | null => {
      const updatedAt = Date.parse(task.updatedAt || task.createdAt);
      const minutesSinceUpdate = Number.isFinite(updatedAt)
        ? Math.max(0, Math.floor((now.getTime() - updatedAt) / 60_000))
        : undefined;
      const overEstimateMinutes = task.estimatedMinutes && task.spentMinutes
        ? task.spentMinutes - task.estimatedMinutes
        : undefined;

      if (task.riskFlags.includes('no_progress')) {
        return { task, reason: 'No progress flagged', minutesSinceUpdate, overEstimateMinutes };
      }
      if (typeof overEstimateMinutes === 'number' && overEstimateMinutes >= 30) {
        return { task, reason: `${overEstimateMinutes} min over estimate`, minutesSinceUpdate, overEstimateMinutes };
      }
      if (task.status === 'blocked' || task.riskFlags.includes('blocked_access')) {
        return { task, reason: 'Blocked and needs manager action', minutesSinceUpdate, overEstimateMinutes };
      }
      if (typeof minutesSinceUpdate === 'number' && minutesSinceUpdate >= staleAfterHours * 60) {
        return { task, reason: `No update for ${formatElapsed(minutesSinceUpdate)}`, minutesSinceUpdate, overEstimateMinutes };
      }
      if (task.dueDate && task.dueDate < today) {
        return { task, reason: 'Open past due date', minutesSinceUpdate, overEstimateMinutes };
      }
      return null;
    })
    .filter((signal): signal is StaleOpenTaskSignal => Boolean(signal))
    .sort((a, b) => sortTasks(a.task, b.task));
}

export function buildManagerWorkbenchSignals(
  tasks: Task[],
  options: { now?: Date; today?: string } = {},
): ManagerWorkbenchSignals {
  const now = options.now ?? new Date();
  const today = options.today ?? isoDate(now);
  const tomorrow = addDays(today, 1);
  const activeTasks = tasks.filter(isOpenTask);
  const staleOpen = detectStaleOpenTasks(activeTasks, { now, today });
  const staleIds = new Set(staleOpen.map((signal) => signal.task.id));

  const openReportedIssues = activeTasks
    .filter((task) => task.source === 'reported_issue' && task.status === 'reported')
    .sort(sortTasks);

  const inboxAiReported = activeTasks
    .filter((task) => task.source === 'inbox_ai' && task.status === 'reported')
    .sort(sortTasks);

  const supplyPrep = activeTasks
    .filter((task) => task.dueDate && task.dueDate <= tomorrow)
    .map((task): SupplyPrepSignal | null => {
      const hasSupplyRequirement = task.requirements?.some((requirement) => requirement.kind === 'supply') ?? false;
      const suggested = suggestSupplyLoadout(task);
      const hasRecordedSupplies = (task.supplies?.length ?? 0) > 0;
      if ((!hasSupplyRequirement && suggested.length === 0) || hasRecordedSupplies) return null;
      const reason = hasSupplyRequirement ? 'Supply requirement open' : 'Suggested loadout not recorded';
      return { task, suggestedCount: suggested.length, reason };
    })
    .filter((signal): signal is SupplyPrepSignal => Boolean(signal))
    .sort((a, b) => sortTasks(a.task, b.task));

  const unassignedOpen = activeTasks
    .filter((task) => task.assigneeIds.length === 0)
    .sort(sortTasks);

  const loadByAssignee = new Map<string, StaffLoadSignal>();
  activeTasks.forEach((task) => {
    const assigneeIds = task.assigneeIds.length ? task.assigneeIds : ['unassigned'];
    assigneeIds.forEach((assigneeId, index) => {
      const current = loadByAssignee.get(assigneeId) ?? {
        assigneeId,
        assigneeName: task.assigneeNames?.[index],
        openCount: 0,
        urgentCount: 0,
        staleCount: 0,
      };
      if (!current.assigneeName && task.assigneeNames?.[index]) {
        current.assigneeName = task.assigneeNames[index];
      }
      current.openCount += 1;
      if (task.priority === 'urgent' || task.priority === 'high') current.urgentCount += 1;
      if (staleIds.has(task.id)) current.staleCount += 1;
      loadByAssignee.set(assigneeId, current);
    });
  });

  const staffLoad = Array.from(loadByAssignee.values())
    .sort((a, b) => (
      b.staleCount - a.staleCount ||
      b.urgentCount - a.urgentCount ||
      b.openCount - a.openCount ||
      (a.assigneeName || a.assigneeId).localeCompare(b.assigneeName || b.assigneeId)
    ));

  return {
    staleOpen,
    openReportedIssues,
    inboxAiReported,
    supplyPrep,
    staffLoad,
    unassignedOpen,
  };
}

function sortTasks(a: Task, b: Task): number {
  return (
    PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
    a.dueDate.localeCompare(b.dueDate) ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    a.propertyCode.localeCompare(b.propertyCode) ||
    a.title.localeCompare(b.title)
  );
}

function isoDate(date: Date): string {
  const localMidnight = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localMidnight.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}
