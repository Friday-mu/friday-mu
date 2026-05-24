'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import {
  TASK_PROPERTIES,
  TASK_USER_BY_ID,
  TASK_USERS,
  type Department,
  type Task,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
} from '../../_data/tasks';
import { useCanSee, useCurrentUserId, usePermissions } from '../usePermissions';
import { fireToast } from '../Toaster';
import { createTask, fetchTask, updateTask } from '../../_data/tasksClient';
import { useApiTasks, useApiTasksPage } from '../../_data/useApiTasks';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../_data/operationsStaffClient';
import { fetchScheduleReservations, type ScheduleReservation } from '../../_data/reservationsClient';
import { TaskDetail } from './operations/TaskDetail';
import { CreateTaskDrawer, type CreateTaskMode, type CreateTaskPrefill } from './operations/CreateTaskDrawer';
import { RosterPage } from './roster/RosterPage';
import { IconClose, IconExpand, IconFilter, IconPlus } from '../icons';
import { DAILY_BRIEF_POOL, pickDifferent, pickFromPool } from '../../_data/aiFixtures';
import { useAITelemetry } from '../ai/useAITelemetry';
import { AIBadge, AIRegenerateButton } from '../ai/AIComponents';
import { taskSourceTone, taskStatusTone, toneStyle } from '../palette';
import {
  buildManagerWorkbenchSignals,
  type ManagerWorkbenchSignals,
  type StaffLoadSignal,
  type StaleOpenTaskSignal,
  type SupplyPrepSignal,
} from '../../_data/managerWorkbench';

interface Props {
  subPage: string;
  onChangeSubPage: (id: string) => void;
}

function todayIso(): string {
  const now = new Date();
  const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localMidnight.toISOString().slice(0, 10);
}

const TODAY = todayIso();

const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: 'Manual',
  breezeway: 'Imported',
  inbox_ai: 'Inbox',
  guesty: 'Reservation',
  recurring: 'Auto workflow',
  reservation_trigger: 'Reservation',
  group_email: 'Email',
  friday: 'Friday',
  reported_issue: 'Reported',
  personal: 'Personal',
  review: 'Review',
  syndic: 'Syndic',
};

// Priority left-bar bullets resolve through palette so they read sensibly in
// dark mode and stay tied to semantic tones.
function priorityBarColor(p: TaskPriority): string {
  if (p === 'urgent') return 'var(--color-text-danger)';
  if (p === 'high' || p === 'medium') return 'var(--color-text-warning)';
  if (p === 'low') return 'var(--color-text-info)';
  return 'var(--color-text-tertiary)';
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  reported: 'Reported',
  scheduled: 'Scheduled',
  ready: 'Ready',
  in_progress: 'In progress',
  paused: 'Paused',
  blocked: 'Blocked',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

function labelCase(value: string): string {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}

const CLOSED_STATUS = new Set<TaskStatus>(['completed', 'closed', 'cancelled']);
const FIELD_EXECUTABLE_STATUS = new Set<TaskStatus>(['scheduled', 'ready', 'in_progress', 'paused']);
const INTAKE_SOURCES = new Set<TaskSource>(['inbox_ai', 'reported_issue', 'group_email', 'review']);
const TASK_DAY_MS = 86_400_000;
const OPEN_SCHEDULE_STATUSES: TaskStatus[] = ['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked'];
const UNASSIGNED_SCHEDULE_ID = '__unassigned__';

type TaskDateTab = 'today' | 'tomorrow' | 'week' | 'all';
type ReservationFilter = 'all' | 'linked' | 'unlinked';
type MyTaskSort = 'suggested' | 'due' | 'priority' | 'property';
type DashboardStatusFilter = 'all' | 'open' | TaskStatus;
type ScheduleStatusFilter = 'open' | 'unassigned' | 'all' | TaskStatus;
type SchedulePlannerMode = 'user_day' | 'user_week' | 'property_week';

interface CreateTaskIntent {
  mode: CreateTaskMode;
  prefill?: CreateTaskPrefill;
  sourceTask?: Task;
}

function addDays(date: string, days: number): string {
  const parts = dateParts(date);
  if (!parts) return date;
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const fromParts = dateParts(from);
  const toParts = dateParts(to);
  if (!fromParts || !toParts) return Number.POSITIVE_INFINITY;
  const [fromYear, fromMonth, fromDay] = fromParts;
  const [toYear, toMonth, toDay] = toParts;
  const a = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const b = new Date(Date.UTC(toYear, toMonth - 1, toDay));
  return Math.round((b.getTime() - a.getTime()) / TASK_DAY_MS);
}

function textValue(value: string | null | undefined, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return textValue(a).localeCompare(textValue(b));
}

function taskPropertyLabel(task: Task): string {
  return textValue(task.propertyCode, 'No property');
}

function taskTitle(task: Task): string {
  return textValue(task.title, 'Untitled task');
}

function taskSubdepartmentLabel(task: Task): string {
  return textValue(task.subdepartment, 'admin').replace(/_/g, ' ');
}

function taskStatusLabel(status: TaskStatus | null | undefined): string {
  return STATUS_LABEL[status as TaskStatus] || 'Reported';
}

function taskPriorityOrder(priority: TaskPriority | null | undefined): number {
  return PRIORITY_ORDER[priority as TaskPriority] ?? 99;
}

function taskRiskFlags(task: Task): string[] {
  return Array.isArray(task.riskFlags) ? task.riskFlags.filter(Boolean) : [];
}

function taskCommentCount(task: Task): number {
  return Array.isArray(task.comments) ? task.comments.length : 0;
}

function taskAttachmentCount(task: Task): number {
  return Number.isFinite(task.attachmentCount) ? Math.max(0, task.attachmentCount) : 0;
}

function taskDateKey(value: string | null | undefined): string {
  return textValue(value, '9999-99-99');
}

function taskTimestampKey(value: string | null | undefined): string {
  return textValue(value, '0000-01-01T00:00:00.000Z');
}

function withinDateTab(task: Task, tab: TaskDateTab, startDate: string, endDate: string): boolean {
  if (!task.dueDate) return false;
  if (tab === 'today') return task.dueDate <= TODAY;
  if (tab === 'tomorrow') return task.dueDate === addDays(TODAY, 1);
  if (tab === 'week') return task.dueDate <= addDays(TODAY, 6);
  return task.dueDate >= startDate && task.dueDate <= endDate;
}

function taskDueCompare(a: Task, b: Task): number {
  return (
    compareText(taskDateKey(a.dueDate), taskDateKey(b.dueDate)) ||
    compareText(a.dueTime ?? '99:99', b.dueTime ?? '99:99') ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    compareText(taskTitle(a), taskTitle(b))
  );
}

function myTaskTimeGroup(task: Task, tab: TaskDateTab): string {
  if (!task.dueDate) return 'No due date';
  if (task.dueDate < TODAY && !CLOSED_STATUS.has(task.status)) return 'Overdue';
  if (tab === 'week' || tab === 'all') return task.dueDate;
  if (!task.dueTime) return task.dueDate === addDays(TODAY, 1) ? 'Tomorrow · no time' : 'Today · no time';
  const hour = Number(task.dueTime.slice(0, 2));
  if (!Number.isFinite(hour)) return task.dueDate === addDays(TODAY, 1) ? 'Tomorrow · no time' : 'Today · no time';
  if (hour < 12) return task.dueDate === addDays(TODAY, 1) ? 'Tomorrow morning' : 'Morning';
  if (hour < 16) return task.dueDate === addDays(TODAY, 1) ? 'Tomorrow afternoon' : 'Afternoon';
  return task.dueDate === addDays(TODAY, 1) ? 'Tomorrow evening' : 'Evening';
}

function myTaskGroupRank(label: string): number {
  const fixed: Record<string, number> = {
    Overdue: 0,
    Morning: 10,
    Afternoon: 20,
    Evening: 30,
    'Today · no time': 40,
    'Tomorrow morning': 50,
    'Tomorrow afternoon': 60,
    'Tomorrow evening': 70,
    'Tomorrow · no time': 80,
    'No due date': 999,
  };
  if (fixed[label] != null) return fixed[label];
  if (isIsoDateKey(label)) return 100 + daysBetween(TODAY, label);
  return 500;
}

function taskMatchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return [
    task.title,
    task.description ?? '',
    taskPropertyLabel(task),
    task.reservationId ?? '',
    task.department,
    taskSubdepartmentLabel(task),
  ].some((value) => textValue(value).toLowerCase().includes(q));
}

function reservationState(task: Task): Exclude<ReservationFilter, 'all'> {
  return task.reservationId ? 'linked' : 'unlinked';
}

function formatShortDate(date: string): string {
  const parts = dateParts(date);
  if (!parts) return 'No date';
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatHistoryDate(date: string): string {
  const parts = dateParts(date);
  if (!parts) return 'No date';
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isIsoDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateParts(value: string | undefined): [number, number, number] | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

function mergeTaskSlices(...slices: Task[][]): Task[] {
  const byId = new Map<string, Task>();
  slices.flat().forEach((task) => byId.set(task.id, task));
  return [...byId.values()];
}

export function OperationsModule({ subPage, onChangeSubPage }: Props) {
  const { role } = usePermissions();
  const canSeeApprovals = useCanSee('tasks', 'approve');
  const canSeeRoster = useCanSee('hr_roster', 'read');
  const canSeeSettings = useCanSee('settings');
  const isField = role === 'field';

  const tabs = (
    isField
      ? [
          { id: 'my', label: 'My tasks' },
          { id: 'history', label: 'My history' },
        ]
      : [
          { id: 'overview', label: 'Overview' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'my', label: 'My tasks' },
          { id: 'all', label: 'All tasks' },
          { id: 'issues', label: 'Reported issues' },
          { id: 'history', label: 'My history' },
          canSeeApprovals && { id: 'approvals', label: 'Approvals' },
          canSeeRoster && { id: 'roster', label: 'Roster' },
          { id: 'insights', label: 'Insights' },
          canSeeSettings && { id: 'settings', label: 'Settings' },
        ]
  ).filter((t): t is { id: string; label: string } => Boolean(t));

  const canonicalSubPage = subPage === 'intake' || subPage === 'inbox-ai' ? 'issues' : subPage;
  const active = tabs.find((t) => t.id === canonicalSubPage)?.id ?? (isField ? 'my' : 'overview');

  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const bumpRev = () => {
    setDetailRefreshKey((n) => n + 1);
  };

  const [createIntent, setCreateIntent] = useState<CreateTaskIntent | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [remoteDetailTask, setRemoteDetailTask] = useState<Task | null>(null);
  const detailTask = detailTaskId ? (remoteDetailTask?.id === detailTaskId ? remoteDetailTask : null) : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const taskId = new URLSearchParams(window.location.search).get('task');
    if (taskId) setDetailTaskId(taskId);
  }, []);

  useEffect(() => {
    if (!detailTaskId) {
      setRemoteDetailTask(null);
      return;
    }
    let cancelled = false;
    setRemoteDetailTask((current) => (current?.id === detailTaskId ? current : null));
    void fetchTask(detailTaskId)
      .then((task) => {
        if (!cancelled) setRemoteDetailTask(task || null);
      })
      .catch((e) => {
        if (!cancelled) {
          setRemoteDetailTask(null);
          fireToast(e instanceof Error ? e.message : 'Task could not be loaded');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailTaskId, detailRefreshKey]);

  const openManagerCreate = (prefill?: CreateTaskPrefill) => {
    setCreateIntent({ mode: 'manager_schedule', prefill });
  };

  const openStandaloneReport = () => {
    setCreateIntent({
      mode: 'field_standalone_issue',
      prefill: {
        source: 'reported_issue',
        priority: 'medium',
      },
    });
  };

  const openAssignedIssueReport = (task: Task) => {
    setDetailTaskId(null);
    setCreateIntent({
      mode: 'assigned_issue',
      sourceTask: task,
      prefill: {
        title: `Issue found at ${task.propertyCode}`,
        propertyCode: task.propertyCode,
        department: task.department,
        subdepartment: task.subdepartment,
        priority: task.priority === 'urgent' ? 'high' : 'medium',
        reservationId: task.reservationId,
        source: 'reported_issue',
      },
    });
  };

  const renderSub = () => {
    switch (active) {
      case 'my':
        return (
          <MyTasksPage
            onOpenTask={setDetailTaskId}
          />
        );
      case 'history':
        return <MyHistoryPage onOpenTask={setDetailTaskId} />;
      case 'overview':
        return <OverviewPage onOpenTask={setDetailTaskId} onChangeSubPage={onChangeSubPage} canSeeRoster={canSeeRoster} />;
      case 'schedule':
        return <SchedulePage onOpenTask={setDetailTaskId} onCreate={openManagerCreate} />;
      case 'all':
        return <AllTasksPage onOpenTask={setDetailTaskId} onCreate={() => openManagerCreate()} />;
      case 'issues':
        return <ReportedIssuesPage onOpenTask={setDetailTaskId} />;
      case 'approvals':
        return canSeeApprovals ? <ApprovalsPage onOpenTask={setDetailTaskId} /> : null;
      case 'roster':
        return canSeeRoster ? <RosterPage /> : null;
      case 'insights':
        return <InsightsPage />;
      case 'settings':
        return canSeeSettings ? <SettingsPage /> : null;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Operations"
        subtitle={isField ? 'Assigned work · comments · evidence · history' : 'Tasks · reported issues · approvals · roster · insights'}
        tabs={tabs}
        activeTab={active}
        onTabChange={onChangeSubPage}
        actions={isField ? (
          <button className="btn primary sm" onClick={openStandaloneReport}>
            <IconPlus size={12} /> Report issue
          </button>
        ) : active === 'schedule' ? null : (
          <button className="btn primary sm" onClick={() => openManagerCreate()}>
            <IconPlus size={12} /> New task
          </button>
        )}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {renderSub()}
      </div>

      {detailTask && (
        <>
          <div className="fad-drawer-overlay open" onClick={() => setDetailTaskId(null)} />
          <aside className="fad-drawer open" style={{ maxWidth: 560 }}>
            <TaskDetail
              task={detailTask}
              mode="drawer"
              onClose={() => setDetailTaskId(null)}
              onExpand={() => fireToast('Full-page route would open at /fad/tasks/' + detailTask.id)}
              onBumpRev={bumpRev}
              onReportIssue={openAssignedIssueReport}
            />
          </aside>
        </>
      )}

      <CreateTaskDrawer
        open={Boolean(createIntent)}
        mode={createIntent?.mode}
        sourceTask={createIntent?.sourceTask}
        prefill={createIntent?.prefill}
        onClose={() => setCreateIntent(null)}
        onCreated={(t) => {
          setCreateIntent(null);
          setRemoteDetailTask(t);
          setDetailTaskId(t.id);
          bumpRev();
        }}
      />
    </div>
  );
}

// ───────────────── Overview ─────────────────

function OverviewPage({
  onOpenTask,
  onChangeSubPage,
  canSeeRoster,
}: {
  onOpenTask: (id: string) => void;
  onChangeSubPage: (id: string) => void;
  canSeeRoster: boolean;
}) {
  const { role } = usePermissions();
  const currentUserId = useCurrentUserId();
  const [dashboardDate, setDashboardDate] = useState(TODAY);
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatusFilter>('open');
  const [savingTimeId, setSavingTimeId] = useState<string | null>(null);
  const overviewAssignee = role === 'field' ? 'me' as const : undefined;
  const overviewDayQuery = useMemo(() => ({
    assignee: overviewAssignee,
    dueAfter: dashboardDate,
    dueBefore: dashboardDate,
    limit: 500,
    sort: 'dueDate' as const,
    dir: 'asc' as const,
  }), [dashboardDate, overviewAssignee]);
  const overviewOpenQuery = useMemo(() => ({
    assignee: overviewAssignee,
    status: OPEN_SCHEDULE_STATUSES,
    limit: 500,
    sort: 'dueDate' as const,
    dir: 'asc' as const,
  }), [overviewAssignee]);
  const dayPage = useApiTasksPage(overviewDayQuery);
  const openPage = useApiTasksPage(overviewOpenQuery);
  const TASKS = useMemo(() => mergeTaskSlices(openPage.tasks, dayPage.tasks), [dayPage.tasks, openPage.tasks]);
  const loading = (dayPage.loading && dayPage.tasks.length === 0) || (openPage.loading && openPage.tasks.length === 0);
  const error = dayPage.error || openPage.error;
  const refetch = () => {
    dayPage.refetch();
    openPage.refetch();
  };
  const scopedTasks = TASKS;
  const kpis = useMemo(() => {
    const openToday = scopedTasks.filter((t) => t.dueDate === TODAY && !CLOSED_STATUS.has(t.status)).length;
    const overdue = scopedTasks.filter((t) => t.dueDate && t.dueDate < TODAY && !CLOSED_STATUS.has(t.status)).length;
    const urgent = scopedTasks.filter((t) => t.priority === 'urgent' && !CLOSED_STATUS.has(t.status)).length;
    const awaitingApproval = scopedTasks.filter((t) => t.status === 'blocked' || t.awaitingHumanApproval).length;
    const reportedToday = scopedTasks.filter((t) => INTAKE_SOURCES.has(t.source) && t.status === 'reported' && taskTimestampKey(t.createdAt).slice(0, 10) === TODAY).length;
    return { openToday, overdue, urgent, awaitingApproval, reportedToday };
  }, [scopedTasks]);

  const dashboardTasks = useMemo(() => (
    scopedTasks
      .filter((t) => t.dueDate === dashboardDate)
      .filter((t) => {
        if (dashboardStatus === 'all') return true;
        if (dashboardStatus === 'open') return !CLOSED_STATUS.has(t.status);
        return t.status === dashboardStatus;
      })
      .sort((a, b) => compareText(a.dueTime ?? '99:99', b.dueTime ?? '99:99') || taskPriorityOrder(a.priority) - taskPriorityOrder(b.priority))
  ), [scopedTasks, dashboardDate, dashboardStatus]);

  const dashboardByProperty = useMemo(() => {
    const groups = new Map<string, Task[]>();
    dashboardTasks.forEach((task) => {
      const key = taskPropertyLabel(task);
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => compareText(a, b));
  }, [dashboardTasks]);

  const statusCounts = useMemo(() => {
    const dayTasks = scopedTasks.filter((t) => t.dueDate === dashboardDate);
    const open = dayTasks.filter((t) => !CLOSED_STATUS.has(t.status)).length;
    const counts: Record<TaskStatus, number> = {
      reported: 0,
      scheduled: 0,
      ready: 0,
      in_progress: 0,
      paused: 0,
      blocked: 0,
      completed: 0,
      closed: 0,
      cancelled: 0,
    };
    dayTasks.forEach((task) => {
      if (Object.prototype.hasOwnProperty.call(counts, task.status)) {
        counts[task.status as TaskStatus] += 1;
      }
    });
    return { open, total: dayTasks.length, counts };
  }, [scopedTasks, dashboardDate]);

  const managerSignals = useMemo(
    () => buildManagerWorkbenchSignals(scopedTasks, { today: TODAY }),
    [scopedTasks],
  );

  const updateDueTime = async (task: Task, dueTime: string) => {
    if (role === 'field') return;
    setSavingTimeId(task.id);
    try {
      await updateTask({ taskId: task.id, patch: { dueTime }, actorId: currentUserId });
      fireToast('Due time updated');
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Due time update failed');
    } finally {
      setSavingTimeId(null);
    }
  };

  const escalations = scopedTasks.filter(
    (t) => taskRiskFlags(t).includes('overdue') || taskRiskFlags(t).includes('blocked_access') || t.priority === 'urgent',
  ).slice(0, 4);

  const reservationDriven = scopedTasks.filter(
    (t) => taskRiskFlags(t).includes('reservation_imminent') && !CLOSED_STATUS.has(t.status),
  );

  const recentActivity = useMemo(() => {
    return scopedTasks.flatMap((t) =>
      (Array.isArray(t.activityLog) ? t.activityLog : []).map((a) => ({ task: t, entry: a }))
    )
      .sort((a, b) => compareText(b.entry.ts, a.entry.ts))
      .slice(0, 6);
  }, [scopedTasks]);

  const telemetry = useAITelemetry();
  const [briefIndex, setBriefIndex] = useState(() => new Date().getHours() % DAILY_BRIEF_POOL.length);
  const todaysBrief = DAILY_BRIEF_POOL[briefIndex];

  const regenerateBrief = () => {
    const next = pickDifferent(DAILY_BRIEF_POOL, briefIndex);
    setBriefIndex(next.index);
    telemetry.recordRegenerate('daily_brief');
  };
  void pickFromPool;

  return (
    <div className="ops-overview-page">
      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
          Live tasks could not load: {error}
        </div>
      )}
      {loading && TASKS.length === 0 && <LoadingState label="Loading live tasks" />}

      <section className="ops-mobile-dashboard" aria-label="Mobile operations dashboard">
        <div className="ops-mobile-dashboard-head">
          <div>
            <div className="ops-mobile-kicker">{role === 'field' ? 'My agenda' : 'Manager agenda'}</div>
            <h2>Operations dashboard</h2>
          </div>
          <label>
            <span>Date</span>
            <input type="date" value={dashboardDate} onChange={(e) => setDashboardDate(e.target.value)} />
          </label>
        </div>
        <div className="ops-status-strip" aria-label="Task status filters">
          {[
            { id: 'open' as const, label: 'Open', count: statusCounts.open },
            { id: 'reported' as const, label: 'Reported', count: statusCounts.counts.reported },
            { id: 'scheduled' as const, label: 'Scheduled', count: statusCounts.counts.scheduled },
            { id: 'ready' as const, label: 'Ready', count: statusCounts.counts.ready },
            { id: 'in_progress' as const, label: 'Active', count: statusCounts.counts.in_progress },
            { id: 'blocked' as const, label: 'Blocked', count: statusCounts.counts.blocked },
            { id: 'completed' as const, label: 'Done', count: statusCounts.counts.completed },
            { id: 'all' as const, label: 'All', count: statusCounts.total },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={'ops-status-chip' + (dashboardStatus === chip.id ? ' active' : '')}
              onClick={() => setDashboardStatus(chip.id)}
            >
              <span>{chip.label}</span>
              <strong>{chip.count}</strong>
            </button>
          ))}
        </div>
        {role !== 'field' && (
          <ManagerWorkbenchPanel
            signals={managerSignals}
            onOpenTask={onOpenTask}
            onChangeSubPage={onChangeSubPage}
            canSeeRoster={canSeeRoster}
          />
        )}
        <div className="ops-agenda-list">
          {dashboardByProperty.map(([propertyCode, tasks]) => (
            <div className="ops-agenda-property" key={propertyCode}>
              <div className="ops-agenda-property-title">
                <span className="mono">{propertyCode}</span>
                <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
              </div>
              {tasks.map((task) => (
                <button className="ops-agenda-row" type="button" key={task.id} onClick={() => onOpenTask(task.id)}>
                  <span className="ops-agenda-priority" style={{ background: priorityBarColor(task.priority) }} />
                  <span className="ops-agenda-main">
                    <strong>{taskTitle(task)}</strong>
                    <small>
                      {taskStatusLabel(task.status)} · {task.department} · {task.reservationId ? 'reservation linked' : 'no reservation'}
                    </small>
                  </span>
                  <span className="ops-agenda-indicators">
                    {taskAttachmentCount(task) > 0 && <span>{taskAttachmentCount(task)} files</span>}
                    {taskCommentCount(task) > 0 && <span>{taskCommentCount(task)} comments</span>}
                  </span>
                  <span className="ops-agenda-time" onClick={(e) => e.stopPropagation()}>
                    {role === 'field' ? (
                      <span>{task.dueTime ?? 'Any time'}</span>
                    ) : (
                      <input
                        type="time"
                        value={task.dueTime ?? ''}
                        aria-label={`Due time for ${taskTitle(task)}`}
                        disabled={savingTimeId === task.id}
                        onChange={(e) => updateDueTime(task, e.target.value)}
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {dashboardByProperty.length === 0 && <Empty>No agenda tasks for {formatShortDate(dashboardDate)}.</Empty>}
        </div>
      </section>

      {/* KPI strip */}
      <div className="ops-kpi-strip">
        <KpiCard label="Open today" value={kpis.openToday} accent="var(--color-text-info)" />
        <KpiCard label="Overdue" value={kpis.overdue} accent="var(--color-text-danger)" />
        <KpiCard label="Urgent" value={kpis.urgent} accent="var(--color-text-warning)" />
        <KpiCard label="Awaiting approval" value={kpis.awaitingApproval} accent="var(--color-brand-accent)" />
        <KpiCard label="Reported today" value={kpis.reportedToday} accent="var(--color-text-success)" />
      </div>

      {/* AI Daily Brief — hidden when DAILY_BRIEF_POOL is empty */}
      {todaysBrief && (
        <div
          className="ops-daily-brief"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AIBadge size="md" prefix="" />
            <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand-accent)' }}>
              Friday Daily Brief
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <AIRegenerateButton onClick={regenerateBrief} />
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{todaysBrief}</div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="ops-overview-grid">
        <Section title={`Escalations · ${escalations.length}`}>
          {escalations.map((t) => (
            <TaskRowMini key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))}
          {escalations.length === 0 && <Empty>No escalations.</Empty>}
        </Section>

        <Section title={`Reservation-driven urgent · ${reservationDriven.length}`}>
          {reservationDriven.map((t) => (
            <TaskRowMini key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))}
          {reservationDriven.length === 0 && <Empty>No reservation-driven urgent tasks.</Empty>}
        </Section>

        <Section title="Recent activity (last 24h)">
          {recentActivity.map(({ task, entry }, i) => {
            const actor = TASK_USER_BY_ID[entry.actorId];
            return (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderBottom: '0.5px dashed var(--color-border-tertiary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                onClick={() => onOpenTask(task.id)}
              >
                <span style={{ color: 'var(--color-brand-accent)', fontWeight: 500 }}>
                  {textValue(entry.kind, 'activity').replace('_', ' ')}
                </span>
                <span style={{ marginLeft: 6 }}>{taskTitle(task).slice(0, 50)}</span>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {actor?.name.split(' ')[0] ?? 'system'} · {entry.detail || ''}
                </div>
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
}

function ManagerWorkbenchPanel({
  signals,
  onOpenTask,
  onChangeSubPage,
  canSeeRoster,
}: {
  signals: ManagerWorkbenchSignals;
  onOpenTask: (id: string) => void;
  onChangeSubPage: (id: string) => void;
  canSeeRoster: boolean;
}) {
  const staleOpen = signals.staleOpen.slice(0, 3);
  const supplyPrep = signals.supplyPrep.slice(0, 3);
  const staffLoad = signals.staffLoad.slice(0, 5);
  const exceptionCount =
    signals.staleOpen.length +
    signals.openReportedIssues.length +
    signals.inboxAiReported.length +
    signals.supplyPrep.length +
    signals.unassignedOpen.length;

  return (
    <section className="ops-manager-workbench" aria-labelledby="ops-manager-workbench-title">
      <div className="ops-workbench-head">
        <div>
          <div className="ops-mobile-kicker">Manager workbench</div>
          <h3 id="ops-manager-workbench-title">Fix today</h3>
        </div>
        <div className="ops-workbench-counts" role="status" aria-live="polite">
          <span><strong>{signals.staleOpen.length}</strong> stale open</span>
          <span><strong>{signals.openReportedIssues.length + signals.inboxAiReported.length}</strong> reported</span>
          <span><strong>{signals.supplyPrep.length}</strong> supply prep</span>
        </div>
      </div>

      <div className="ops-workbench-lanes">
        <WorkbenchLane
          title={`Stale-open reminders · ${signals.staleOpen.length}`}
          actionLabel="All tasks"
          onAction={() => onChangeSubPage('all')}
          defaultOpen={signals.staleOpen.length > 0}
        >
          {staleOpen.map((signal) => (
            <StaleOpenRow key={signal.task.id} signal={signal} onOpenTask={onOpenTask} />
          ))}
          {signals.staleOpen.length === 0 && <WorkbenchEmpty>No stale open work.</WorkbenchEmpty>}
        </WorkbenchLane>

        <WorkbenchLane
          title={`Reported issues · ${signals.openReportedIssues.length + signals.inboxAiReported.length}`}
          defaultOpen={signals.openReportedIssues.length + signals.inboxAiReported.length > 0}
        >
          <button type="button" className="ops-workbench-row" onClick={() => onChangeSubPage('issues')}>
            <span>
              <strong>Reported issues and Inbox proposals</strong>
              <small>{signals.openReportedIssues.length + signals.inboxAiReported.length} real task records need accept/dismiss/link</small>
            </span>
            <span className="ops-workbench-badge">{signals.openReportedIssues.length + signals.inboxAiReported.length}</span>
          </button>
          <button type="button" className="ops-workbench-row" onClick={() => onChangeSubPage('all')}>
            <span>
              <strong>Unassigned open tasks</strong>
              <small>{signals.unassignedOpen.length} should be assigned or scheduled</small>
            </span>
            <span className="ops-workbench-badge">{signals.unassignedOpen.length}</span>
          </button>
        </WorkbenchLane>

        <WorkbenchLane
          title={`Supplies and loadouts · ${signals.supplyPrep.length}`}
          actionLabel="Review tasks"
          onAction={() => onChangeSubPage('all')}
          defaultOpen={signals.supplyPrep.length > 0}
        >
          {supplyPrep.map((signal) => (
            <SupplyPrepRow key={signal.task.id} signal={signal} onOpenTask={onOpenTask} />
          ))}
          {signals.supplyPrep.length === 0 && <WorkbenchEmpty>No supply prep flags.</WorkbenchEmpty>}
        </WorkbenchLane>

        <WorkbenchLane
          title={`Staff load · ${staffLoad.length}`}
          actionLabel={canSeeRoster ? 'Roster' : undefined}
          onAction={canSeeRoster ? () => onChangeSubPage('roster') : undefined}
          defaultOpen={false}
        >
          {staffLoad.map((signal) => (
            <StaffLoadRow key={signal.assigneeId} signal={signal} />
          ))}
          {staffLoad.length === 0 && <WorkbenchEmpty>No open staff load.</WorkbenchEmpty>}
        </WorkbenchLane>
      </div>

      {exceptionCount === 0 && (
        <div className="ops-workbench-clear">No manager exceptions detected for the selected Operations queue.</div>
      )}
    </section>
  );
}

function WorkbenchLane({
  title,
  actionLabel,
  onAction,
  defaultOpen,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(Boolean(defaultOpen));

  useEffect(() => {
    setIsOpen(Boolean(defaultOpen));
  }, [defaultOpen, title]);

  return (
    <details className="ops-workbench-lane" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="ops-workbench-lane-head">
        <h4>{title}</h4>
        {actionLabel && onAction && (
          <button type="button" onClick={(event) => { event.preventDefault(); onAction(); }}>
            {actionLabel}
          </button>
        )}
      </summary>
      <div className="ops-workbench-list">{children}</div>
    </details>
  );
}

function StaleOpenRow({ signal, onOpenTask }: { signal: StaleOpenTaskSignal; onOpenTask: (id: string) => void }) {
  return (
    <button type="button" className="ops-workbench-row urgent" onClick={() => onOpenTask(signal.task.id)}>
      <span>
        <strong>{taskTitle(signal.task)}</strong>
        <small>{taskPropertyLabel(signal.task)} · {taskStatusLabel(signal.task.status)} · {signal.reason}</small>
      </span>
      <span className="ops-workbench-badge">{textValue(signal.task.priority, 'medium')}</span>
    </button>
  );
}

function SupplyPrepRow({ signal, onOpenTask }: { signal: SupplyPrepSignal; onOpenTask: (id: string) => void }) {
  const supplyLabel = signal.suggestedCount > 0
    ? `${signal.suggestedCount} suggested item${signal.suggestedCount === 1 ? '' : 's'}`
    : 'Supply capture required';

  return (
    <button type="button" className="ops-workbench-row" onClick={() => onOpenTask(signal.task.id)}>
      <span>
        <strong>{taskPropertyLabel(signal.task)} · {taskTitle(signal.task)}</strong>
        <small>{supplyLabel} · {signal.reason}</small>
      </span>
      <span className="ops-workbench-badge">{signal.task.dueDate === TODAY ? 'today' : formatShortDate(textValue(signal.task.dueDate))}</span>
    </button>
  );
}

function StaffLoadRow({ signal }: { signal: StaffLoadSignal }) {
  const user = signal.assigneeId === 'unassigned' ? null : TASK_USER_BY_ID[signal.assigneeId];
  const label = signal.assigneeId === 'unassigned'
    ? 'Unassigned'
    : signal.assigneeName || user?.name || 'Assigned user';

  return (
    <div className={'ops-workbench-row static' + (signal.staleCount > 0 ? ' urgent' : '')}>
      <span>
        <strong>{label}</strong>
        <small>{signal.urgentCount} high/urgent · {signal.staleCount} stale</small>
      </span>
      <span className="ops-workbench-badge">{signal.openCount}</span>
    </div>
  );
}

function WorkbenchEmpty({ children }: { children: React.ReactNode }) {
  return <div className="ops-workbench-empty">{children}</div>;
}

// ───────────────── Schedule ─────────────────

type ScheduleBucketId = 'all_day' | 'before_8' | '8_10' | '10_12' | '12_14' | '14_16' | '16_18' | '18_20' | 'after_20';

interface ScheduleTimeBucket {
  id: ScheduleBucketId;
  label: string;
  subLabel?: string;
  startHour: number | null;
  endHour: number | null;
  defaultTime: string;
}

interface ScheduleStaffRow {
  id: string;
  name: string;
  initials: string;
  role?: string | null;
  tasks: Task[];
}

interface SchedulePropertyRow {
  id: string;
  label: string;
  subLabel?: string;
  tasks: Task[];
  reservations: ScheduleReservation[];
}

interface PlannerDropTarget {
  mode: SchedulePlannerMode;
  rowType: 'staff' | 'property';
  rowId: string;
  date: string;
  bucketId?: ScheduleBucketId;
  propertyCode?: string;
}

const SCHEDULE_TIME_BUCKETS: ScheduleTimeBucket[] = [
  { id: 'all_day', label: 'All day tasks', subLabel: 'No exact time', startHour: null, endHour: null, defaultTime: '' },
  { id: 'before_8', label: 'Before 8am', startHour: 0, endHour: 8, defaultTime: '07:00' },
  { id: '8_10', label: '8 - 10am', startHour: 8, endHour: 10, defaultTime: '08:00' },
  { id: '10_12', label: '10 - 12pm', startHour: 10, endHour: 12, defaultTime: '10:00' },
  { id: '12_14', label: '12 - 2pm', startHour: 12, endHour: 14, defaultTime: '12:00' },
  { id: '14_16', label: '2 - 4pm', startHour: 14, endHour: 16, defaultTime: '14:00' },
  { id: '16_18', label: '4 - 6pm', startHour: 16, endHour: 18, defaultTime: '16:00' },
  { id: '18_20', label: '6 - 8pm', startHour: 18, endHour: 20, defaultTime: '18:00' },
  { id: 'after_20', label: 'After 8pm', startHour: 20, endHour: 24, defaultTime: '20:00' },
];

const COMPACT_CELL_LIMIT = 6;

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function formatScheduleDate(date: string): string {
  const parts = dateParts(date);
  if (!parts) return 'No date';
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatScheduleRange(start: string, end: string): string {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatTimeLabel(time?: string): string {
  if (!time) return 'Any time';
  const match = time.match(/^(\d{2}):(\d{2})/);
  if (!match) return time;
  return `${match[1]}:${match[2]}`;
}

function timeBucketForTask(task: Task): ScheduleBucketId {
  if (!task.dueTime) return 'all_day';
  const match = task.dueTime.match(/^(\d{2}):/);
  const hour = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(hour)) return 'all_day';
  const bucket = SCHEDULE_TIME_BUCKETS.find((item) => (
    item.startHour != null &&
    item.endHour != null &&
    hour >= item.startHour &&
    hour < item.endHour
  ));
  return bucket?.id || 'all_day';
}

function taskTimeSortKey(task: Task): string {
  return `${task.dueTime || '99:99'}-${PRIORITY_ORDER[task.priority] ?? 99}-${textValue(task.title, 'Untitled task')}`;
}

function taskAssigneeName(task: Task, assigneeId: string, index: number): string {
  return task.assigneeNames?.[index]
    || TASK_USER_BY_ID[assigneeId]?.name
    || 'Assigned user';
}

function taskAssigneePeople(task: Task): Array<{ id: string; name: string; initials: string; avatarColor: string }> {
  return task.assigneeIds.map((id, index) => {
    const fixture = TASK_USER_BY_ID[id];
    const name = taskAssigneeName(task, id, index);
    return {
      id,
      name,
      initials: fixture?.initials || initialsForName(name),
      avatarColor: fixture?.avatarColor || '#64748b',
    };
  });
}

function taskScheduleMatchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (taskMatchesSearch(task, q)) return true;
  return (task.assigneeNames || []).some((name) => textValue(name).toLowerCase().includes(q));
}

function scheduleStatusMatches(task: Task, status: ScheduleStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return OPEN_SCHEDULE_STATUSES.includes(task.status);
  if (status === 'unassigned') return OPEN_SCHEDULE_STATUSES.includes(task.status) && task.assigneeIds.length === 0;
  return task.status === status;
}

function mergeScheduleStaff(directoryUsers: OperationsStaffUser[], tasks: Task[]): OperationsStaffUser[] {
  const byId = new Map<string, OperationsStaffUser>();
  directoryUsers
    .filter((user) => user.canAssign && !/(external|guest|owner)/i.test(user.role || ''))
    .forEach((user) => byId.set(user.id, user));

  tasks.forEach((task) => {
    task.assigneeIds.forEach((id, index) => {
      if (byId.has(id)) return;
      const name = taskAssigneeName(task, id, index);
      byId.set(id, {
        id,
        name,
        initials: initialsForName(name),
        role: null,
        canAssign: true,
      });
    });
  });

  return Array.from(byId.values()).sort((a, b) => compareText(a.name, b.name));
}

function normalizeScheduleProperty(value: string | undefined): string {
  return value?.trim() || 'No property';
}

function reservationMatchesSearch(reservation: ScheduleReservation, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return [
    reservation.propertyCode,
    reservation.listingNickname,
    reservation.guestName,
    reservation.confirmationCode,
    reservation.channel,
  ].some((value) => textValue(value).toLowerCase().includes(q));
}

function reservationOverlapsDay(reservation: ScheduleReservation, day: string): boolean {
  return reservation.checkInDate <= day && reservation.checkOutDate >= day;
}

function buildVisibleDays(startDate: string, mode: SchedulePlannerMode): string[] {
  const days = mode === 'user_day' ? 1 : 7;
  return Array.from({ length: days }, (_, index) => addDays(startDate, index));
}

function canUseNativeDrag(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(pointer: fine) and (min-width: 769px)').matches;
}

function SchedulePage({
  onOpenTask,
  onCreate,
}: {
  onOpenTask: (id: string) => void;
  onCreate: (prefill?: CreateTaskPrefill) => void;
}) {
  const currentUserId = useCurrentUserId();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>('all');
  const [plannerMode, setPlannerMode] = useState<SchedulePlannerMode>('user_day');
  const [search, setSearch] = useState('');
  const [staffUsers, setStaffUsers] = useState<OperationsStaffUser[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  // 2026-05-23 (Ishant): smooth 15-min snap when dragging on user_day.
  // Tracks which bucket the cursor is over + the precise time + the
  // x-percentage so we can render a vertical tick at the drop point.
  // Live updates on every onDragOver event.
  const [dragPreview, setDragPreview] = useState<{
    bucketId: ScheduleBucketId;
    time: string;
    leftPct: number;
  } | null>(null);
  const [reservations, setReservations] = useState<ScheduleReservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);

  const visibleDays = useMemo(() => buildVisibleDays(selectedDate, plannerMode), [plannerMode, selectedDate]);
  const rangeStart = visibleDays[0] || selectedDate;
  const rangeEnd = visibleDays[visibleDays.length - 1] || selectedDate;
  const rangeStep = plannerMode === 'user_day' ? 1 : 7;

  const scheduleQuery = useMemo(() => ({
    dueAfter: rangeStart,
    dueBefore: rangeEnd,
    limit: 500,
    sort: 'dueDate' as const,
    dir: 'asc' as const,
  }), [rangeEnd, rangeStart]);
  const unscheduledQuery = useMemo(() => ({
    status: OPEN_SCHEDULE_STATUSES,
    unscheduled: true,
    limit: 50,
    sort: 'updatedAt' as const,
    dir: 'desc' as const,
  }), []);
  const taskPage = useApiTasksPage(scheduleQuery);
  const unscheduledPage = useApiTasksPage(unscheduledQuery);

  useEffect(() => {
    let cancelled = false;
    void loadOperationsStaffUsers()
      .then((users) => {
        if (!cancelled) {
          setStaffUsers(users);
          setStaffError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setStaffUsers([]);
          setStaffError(e instanceof Error ? e.message : 'Staff directory unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => setDragEnabled(canUseNativeDrag());
    refresh();
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(pointer: fine) and (min-width: 769px)');
    mq.addEventListener?.('change', refresh);
    return () => mq.removeEventListener?.('change', refresh);
  }, []);

  useEffect(() => {
    if (plannerMode !== 'property_week') return;
    let cancelled = false;
    setReservationsLoading(true);
    setReservationsError(null);
    void fetchScheduleReservations({ from: rangeStart, to: rangeEnd, limit: 500 })
      .then((items) => {
        if (!cancelled) setReservations(items);
      })
      .catch((e) => {
        if (!cancelled) {
          setReservations([]);
          setReservationsError(e instanceof Error ? e.message : 'Reservation overlays unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setReservationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plannerMode, rangeEnd, rangeStart]);

  const rawScheduleTasks = taskPage.tasks;
  const scheduleTasks = useMemo(() => (
    rawScheduleTasks
      .filter((task) => scheduleStatusMatches(task, statusFilter))
      .filter((task) => taskScheduleMatchesSearch(task, search))
      .sort((a, b) => compareText(taskTimeSortKey(a), taskTimeSortKey(b)))
  ), [rawScheduleTasks, search, statusFilter]);

  const unscheduledTasks = useMemo(() => (
    unscheduledPage.tasks
      .filter((task) => !task.dueDate && OPEN_SCHEDULE_STATUSES.includes(task.status))
      .filter((task) => taskScheduleMatchesSearch(task, search))
      .slice(0, 50)
  ), [unscheduledPage.tasks, search]);

  const staffOptions = useMemo(
    () => mergeScheduleStaff(staffUsers, [...rawScheduleTasks, ...unscheduledPage.tasks]),
    [rawScheduleTasks, staffUsers, unscheduledPage.tasks],
  );

  const allKnownTasks = useMemo(
    () => mergeTaskSlices(rawScheduleTasks, unscheduledPage.tasks),
    [rawScheduleTasks, unscheduledPage.tasks],
  );

  const selectedEditTask = useMemo(
    () => allKnownTasks.find((task) => task.id === editingTaskId) || null,
    [allKnownTasks, editingTaskId],
  );

  const staffRows = useMemo<ScheduleStaffRow[]>(() => {
    const byAssignee = new Map<string, Task[]>();
    const unassigned: Task[] = [];
    scheduleTasks.forEach((task) => {
      if (task.assigneeIds.length === 0) {
        unassigned.push(task);
        return;
      }
      task.assigneeIds.forEach((id) => {
        const list = byAssignee.get(id) || [];
        list.push(task);
        byAssignee.set(id, list);
      });
    });

    const rows: ScheduleStaffRow[] = [];
    rows.push({
      id: UNASSIGNED_SCHEDULE_ID,
      name: 'Unassigned',
      initials: '--',
      role: null,
      tasks: unassigned.sort((a, b) => compareText(taskTimeSortKey(a), taskTimeSortKey(b))),
    });

    staffOptions.forEach((user) => {
      rows.push({
        id: user.id,
        name: user.name,
        initials: user.initials,
        role: user.role,
        tasks: (byAssignee.get(user.id) || []).sort((a, b) => compareText(taskTimeSortKey(a), taskTimeSortKey(b))),
      });
    });

    return rows;
  }, [scheduleTasks, staffOptions]);

  const propertyRows = useMemo<SchedulePropertyRow[]>(() => {
    const groups = new Map<string, SchedulePropertyRow>();
    const ensure = (key: string, subLabel?: string) => {
      const normalized = normalizeScheduleProperty(key);
      const existing = groups.get(normalized);
      if (existing) {
        if (!existing.subLabel && subLabel) existing.subLabel = subLabel;
        return existing;
      }
      const row: SchedulePropertyRow = {
        id: normalized,
        label: normalized,
        subLabel,
        tasks: [],
        reservations: [],
      };
      groups.set(normalized, row);
      return row;
    };

    scheduleTasks.forEach((task) => {
      ensure(taskPropertyLabel(task)).tasks.push(task);
    });
    reservations
      .filter((reservation) => reservationMatchesSearch(reservation, search))
      .forEach((reservation) => {
        ensure(reservation.propertyCode, reservation.listingNickname).reservations.push(reservation);
      });
    return Array.from(groups.values())
      .filter((row) => row.tasks.length > 0 || row.reservations.length > 0)
      .sort((a, b) => compareText(a.label, b.label));
  }, [reservations, scheduleTasks, search]);

  const counts = useMemo(() => {
    const open = rawScheduleTasks.filter((task) => OPEN_SCHEDULE_STATUSES.includes(task.status)).length;
    const unassigned = rawScheduleTasks.filter((task) => OPEN_SCHEDULE_STATUSES.includes(task.status) && task.assigneeIds.length === 0).length;
    const active = rawScheduleTasks.filter((task) => task.status === 'in_progress' || task.status === 'paused').length;
    const completed = rawScheduleTasks.filter((task) => task.status === 'completed' || task.status === 'closed').length;
    return { open, unassigned, active, completed, total: rawScheduleTasks.length };
  }, [rawScheduleTasks]);

  const patchTask = async (task: Task, patch: Parameters<typeof updateTask>[0]['patch'], success: string) => {
    setSavingTaskId(task.id);
    try {
      await updateTask({ taskId: task.id, patch, actorId: currentUserId });
      fireToast(success);
      taskPage.refetch();
      unscheduledPage.refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Task schedule update failed');
    } finally {
      setSavingTaskId(null);
    }
  };

  const scheduleToday = (task: Task) => {
    void patchTask(task, { dueDate: selectedDate, status: task.status === 'reported' ? 'scheduled' : task.status }, 'Task added to schedule');
  };

  const patchForDropTarget = (task: Task, target: PlannerDropTarget): Parameters<typeof updateTask>[0]['patch'] | null => {
    const patch: Parameters<typeof updateTask>[0]['patch'] = {};
    if (target.rowType === 'property') {
      const taskProperty = normalizeScheduleProperty(taskPropertyLabel(task));
      if (taskProperty !== target.propertyCode) {
        fireToast('Open the task to change property before moving it to another property row.');
        return null;
      }
      patch.dueDate = target.date;
    } else {
      patch.dueDate = target.date;
      patch.assigneeIds = target.rowId === UNASSIGNED_SCHEDULE_ID ? [] : [target.rowId];
      if (target.mode === 'user_day') {
        const bucket = SCHEDULE_TIME_BUCKETS.find((item) => item.id === target.bucketId);
        // 2026-05-23 (Ishant): smooth 15-min snap. If the operator
        // hovered to a specific time inside the bucket (dragPreview),
        // use that. Otherwise fall back to the bucket's default time
        // for the all_day / before_8 / after_20 edges where finer snap
        // isn't useful.
        const previewTime = dragPreview && dragPreview.bucketId === target.bucketId ? dragPreview.time : null;
        patch.dueTime = previewTime || bucket?.defaultTime || '';
      }
    }
    if (task.status === 'reported') patch.status = 'scheduled';
    return patch;
  };

  // Compute a 15-min snap time from the cursor's x-position within a
  // bucket cell. Returns null for the all_day bucket (no time) and the
  // edge buckets (before_8 / after_20) where we keep the existing
  // coarser snap.
  const computeBucketDragPreview = (
    bucket: ScheduleTimeBucket,
    event: React.DragEvent<HTMLElement>,
  ): { time: string; leftPct: number } | null => {
    if (bucket.startHour == null || bucket.endHour == null) return null;
    const totalMinutes = (bucket.endHour - bucket.startHour) * 60;
    if (totalMinutes <= 0) return null;
    const slotMinutes = bucket.id === 'before_8' || bucket.id === 'after_20' ? 60 : 15;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const slotIndex = Math.min(
      Math.floor((totalMinutes - 1) / slotMinutes),
      Math.floor(rel * (totalMinutes / slotMinutes)),
    );
    const offsetMinutes = slotIndex * slotMinutes;
    const totalMin = bucket.startHour * 60 + offsetMinutes;
    const hour = Math.floor(totalMin / 60) % 24;
    const minute = totalMin % 60;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const leftPct = ((slotIndex * slotMinutes) / totalMinutes) * 100;
    return { time, leftPct };
  };

  const moveTask = (task: Task, target: PlannerDropTarget) => {
    const patch = patchForDropTarget(task, target);
    if (!patch) return;
    void patchTask(task, patch, 'Task schedule updated');
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, task: Task) => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }
    setDragTaskId(task.id);
    setDragPreview(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  };

  // Global dragend listener so the preview tick clears even when the
  // operator releases the card outside any drop zone.
  useEffect(() => {
    if (!dragTaskId) return;
    const onEnd = () => {
      setDragTaskId(null);
      setDragPreview(null);
    };
    window.addEventListener('dragend', onEnd);
    return () => window.removeEventListener('dragend', onEnd);
  }, [dragTaskId]);

  const handleDrop = (event: React.DragEvent<HTMLElement>, target: PlannerDropTarget) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain') || dragTaskId;
    setDragTaskId(null);
    const task = allKnownTasks.find((item) => item.id === taskId);
    if (!task) {
      setDragPreview(null);
      return;
    }
    moveTask(task, target);
    setDragPreview(null);
  };

  const allowDrop = (event: React.DragEvent<HTMLElement>) => {
    if (dragTaskId && dragEnabled) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const shiftDate = (direction: -1 | 1) => setSelectedDate(addDays(selectedDate, direction * rangeStep));

  const scheduleChips: Array<{ id: ScheduleStatusFilter; label: string; count: number }> = [
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'unassigned', label: 'Unassigned', count: counts.unassigned },
    { id: 'in_progress', label: 'Active', count: counts.active },
    { id: 'completed', label: 'Done', count: counts.completed },
    { id: 'all', label: 'All', count: counts.total },
  ];

  return (
    <div className="ops-schedule" aria-label="Operations task schedule">
      <div className="ops-schedule-toolbar">
        <div>
          <div className="ops-mobile-kicker">Schedule planner</div>
          <h2>{plannerMode === 'user_day' ? formatScheduleDate(selectedDate) : formatScheduleRange(rangeStart, rangeEnd)}</h2>
        </div>
        <div className="ops-schedule-date-controls">
          <button className="btn ghost sm" type="button" onClick={() => shiftDate(-1)}>
            Previous
          </button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="Schedule date" />
          <button className="btn ghost sm" type="button" onClick={() => setSelectedDate(TODAY)}>
            Today
          </button>
          <button className="btn ghost sm" type="button" onClick={() => shiftDate(1)}>
            Next
          </button>
          <button className="btn primary sm" type="button" onClick={() => onCreate({ dueDate: selectedDate })}>
            <IconPlus size={12} />
            <span className="ops-schedule-label-full">New task</span>
            <span className="ops-schedule-label-short">Task</span>
          </button>
        </div>
      </div>

      <div className="ops-schedule-filters">
        <input
          type="search"
          placeholder="Search property, task, assignee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ops-schedule-segment" role="group" aria-label="Schedule view">
          <button type="button" className={plannerMode === 'user_day' ? 'active' : ''} onClick={() => setPlannerMode('user_day')}>
            User day
          </button>
          <button type="button" className={plannerMode === 'user_week' ? 'active' : ''} onClick={() => setPlannerMode('user_week')}>
            User week
          </button>
          <button type="button" className={plannerMode === 'property_week' ? 'active' : ''} onClick={() => setPlannerMode('property_week')}>
            Property week
          </button>
        </div>
      </div>

      <div className="ops-status-strip" aria-label="Schedule status filters">
        {scheduleChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={'ops-status-chip' + (statusFilter === chip.id ? ' active' : '')}
            onClick={() => setStatusFilter(chip.id)}
          >
            <span>{chip.label}</span>
            <strong>{chip.count}</strong>
          </button>
        ))}
      </div>

      {staffError && (
        <div className="ops-schedule-warning">
          Staff directory could not load; showing assignees already present on tasks.
        </div>
      )}
      {taskPage.error && (
        <div className="ops-schedule-warning">Schedule tasks could not load: {taskPage.error}</div>
      )}
      {reservationsError && plannerMode === 'property_week' && (
        <div className="ops-schedule-warning">Reservation overlays could not load: {reservationsError}</div>
      )}
      {taskPage.total > taskPage.tasks.length && (
        <div className="ops-schedule-warning">
          Showing {taskPage.tasks.length} of {taskPage.total} scheduled tasks. Narrow the date range or filters to avoid hidden rows.
        </div>
      )}

      {selectedEditTask && (
        <PlannerEditPanel
          task={selectedEditTask}
          staffOptions={staffOptions}
          saving={savingTaskId === selectedEditTask.id}
          onOpenTask={onOpenTask}
          onClose={() => setEditingTaskId(null)}
          onPatch={patchTask}
        />
      )}

      <MobileScheduleAgenda
        mode={plannerMode}
        tasks={scheduleTasks}
        propertyRows={propertyRows}
        visibleDays={visibleDays}
        staffOptions={staffOptions}
        loading={taskPage.loading || (plannerMode === 'property_week' && reservationsLoading)}
        savingTaskId={savingTaskId}
        onOpenTask={onOpenTask}
        onEdit={setEditingTaskId}
      />

      {plannerMode === 'user_day' ? (
        <div className="ops-planner-scroll" aria-busy={taskPage.loading}>
          <div className="ops-planner-grid user-day" role="grid" aria-label="User day planner">
            <div className="ops-planner-corner" role="columnheader">Users</div>
            {SCHEDULE_TIME_BUCKETS.map((bucket) => (
              <div className="ops-planner-col-head" role="columnheader" key={bucket.id}>
                <strong>{bucket.label}</strong>
                {bucket.subLabel && <small>{bucket.subLabel}</small>}
              </div>
            ))}
            {staffRows.map((row) => (
              <div className="ops-planner-row-fragment" role="row" key={row.id}>
                <div className="ops-planner-row-head" role="rowheader">
                  <span className="ops-schedule-avatar">{row.initials}</span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.role || (row.id === UNASSIGNED_SCHEDULE_ID ? 'Needs owner' : 'Staff')}</small>
                  </span>
                  <em>{row.tasks.length}</em>
                </div>
                {SCHEDULE_TIME_BUCKETS.map((bucket) => {
                  const cellTasks = row.tasks.filter((task) => timeBucketForTask(task) === bucket.id);
                  const showPreview = !!dragTaskId
                    && dragPreview?.bucketId === bucket.id;
                  return (
                    <div
                      className={'ops-planner-cell' + (showPreview ? ' has-drag-preview' : '')}
                      role="gridcell"
                      key={`${row.id}-${bucket.id}`}
                      onDragOver={(event) => {
                        allowDrop(event);
                        // 2026-05-23 (Ishant): live 15-min snap. Update
                        // dragPreview with the cursor position so the
                        // overlay tick + label render at the drop spot.
                        if (!dragTaskId) return;
                        const preview = computeBucketDragPreview(bucket, event);
                        if (preview) {
                          setDragPreview({
                            bucketId: bucket.id,
                            time: preview.time,
                            leftPct: preview.leftPct,
                          });
                        } else {
                          setDragPreview(null);
                        }
                      }}
                      onDragLeave={(event) => {
                        // Only clear if leaving the cell entirely (not
                        // a child element).
                        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                        setDragPreview((prev) => prev?.bucketId === bucket.id ? null : prev);
                      }}
                      onDrop={(event) => {
                        handleDrop(event, {
                          mode: 'user_day',
                          rowType: 'staff',
                          rowId: row.id,
                          date: selectedDate,
                          bucketId: bucket.id,
                        });
                        setDragPreview(null);
                      }}
                    >
                      {cellTasks.map((task) => (
                        <PlannerTaskCard
                          key={`${row.id}-${bucket.id}-${task.id}`}
                          task={task}
                          staffOptions={staffOptions}
                          saving={savingTaskId === task.id}
                          dragEnabled={dragEnabled}
                          onDragStart={handleDragStart}
                          onOpenTask={onOpenTask}
                          onEdit={setEditingTaskId}
                        />
                      ))}
                      {showPreview && dragPreview && (
                        <>
                          <div
                            className="ops-planner-drop-tick"
                            style={{ left: `${dragPreview.leftPct}%` }}
                            aria-hidden
                          />
                          <div
                            className="ops-planner-drop-label"
                            style={{ left: `${dragPreview.leftPct}%` }}
                          >
                            Drop at {dragPreview.time}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {staffRows.every((row) => row.tasks.length === 0) && <div className="ops-schedule-empty">No scheduled tasks match this day.</div>}
        </div>
      ) : plannerMode === 'user_week' ? (
        <div className="ops-planner-scroll" aria-busy={taskPage.loading}>
          <div className="ops-planner-grid week" role="grid" aria-label="User week planner">
            <div className="ops-planner-corner" role="columnheader">Users</div>
            {visibleDays.map((day) => (
              <div className="ops-planner-col-head" role="columnheader" key={day}>
                <strong>{formatShortDate(day)}</strong>
                <small>{formatScheduleDate(day).split(',')[0]}</small>
              </div>
            ))}
            {staffRows.map((row) => (
              <div className="ops-planner-row-fragment" role="row" key={row.id}>
                <div className="ops-planner-row-head" role="rowheader">
                  <span className="ops-schedule-avatar">{row.initials}</span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.role || (row.id === UNASSIGNED_SCHEDULE_ID ? 'Needs owner' : 'Staff')}</small>
                  </span>
                  <em>{row.tasks.length}</em>
                </div>
                {visibleDays.map((day) => {
                  const cellTasks = row.tasks.filter((task) => task.dueDate === day);
                  return (
                    <PlannerCompactCell
                      key={`${row.id}-${day}`}
                      tasks={cellTasks}
                      dropTarget={{ mode: 'user_week', rowType: 'staff', rowId: row.id, date: day }}
                      dragEnabled={dragEnabled}
                      savingTaskId={savingTaskId}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onDragOver={allowDrop}
                      onOpenTask={onOpenTask}
                      onEdit={setEditingTaskId}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {staffRows.every((row) => row.tasks.length === 0) && <div className="ops-schedule-empty">No scheduled tasks match this week.</div>}
        </div>
      ) : (
        <div className="ops-planner-scroll" aria-busy={taskPage.loading || reservationsLoading}>
          <div className="ops-planner-grid week property-week" role="grid" aria-label="Property week planner">
            <div className="ops-planner-corner" role="columnheader">Properties</div>
            {visibleDays.map((day) => (
              <div className="ops-planner-col-head" role="columnheader" key={day}>
                <strong>{formatShortDate(day)}</strong>
                <small>{formatScheduleDate(day).split(',')[0]}</small>
              </div>
            ))}
            {propertyRows.map((row) => (
              <div className="ops-planner-row-fragment" role="row" key={row.id}>
                <div className="ops-planner-row-head" role="rowheader">
                  <span className="ops-property-dot" />
                  <span>
                    <strong className="mono">{row.label}</strong>
                    <small>{row.subLabel || `${row.tasks.length} scheduled`}</small>
                  </span>
                  <em>{row.tasks.length}</em>
                </div>
                {visibleDays.map((day) => {
                  const cellTasks = row.tasks.filter((task) => task.dueDate === day);
                  const cellReservations = row.reservations.filter((reservation) => reservationOverlapsDay(reservation, day));
                  return (
                    <PlannerCompactCell
                      key={`${row.id}-${day}`}
                      tasks={cellTasks}
                      reservations={cellReservations}
                      propertyCode={row.label}
                      dropTarget={{ mode: 'property_week', rowType: 'property', rowId: row.id, date: day, propertyCode: row.label }}
                      dragEnabled={dragEnabled}
                      savingTaskId={savingTaskId}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onDragOver={allowDrop}
                      onOpenTask={onOpenTask}
                      onEdit={setEditingTaskId}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {propertyRows.length === 0 && <Empty>No scheduled tasks or reservation overlays match this view.</Empty>}
        </div>
      )}

      <section className="ops-schedule-backlog">
        <div className="ops-schedule-backlog-head">
          <div>
            <div className="ops-mobile-kicker">Unscheduled queue</div>
            <h3>Open work without a date</h3>
          </div>
          <span>{unscheduledTasks.length} shown</span>
        </div>
        <div className="ops-schedule-backlog-list" aria-busy={unscheduledPage.loading}>
          {unscheduledTasks.map((task) => (
            <div
              className="ops-schedule-backlog-row"
              key={task.id}
              role="button"
              tabIndex={0}
              draggable={dragEnabled && savingTaskId !== task.id}
              onDragStart={(event) => handleDragStart(event, task)}
              onDragEnd={() => setDragTaskId(null)}
              onClick={() => onOpenTask(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onOpenTask(task.id);
              }}
            >
              <span>
                <strong>{task.title}</strong>
                <small>{task.propertyCode || 'No property'} · {formatTaskDue(task.dueDate, task.dueTime, task.status)} · {STATUS_LABEL[task.status]}</small>
              </span>
              <span onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost sm" type="button" disabled={savingTaskId === task.id} onClick={() => scheduleToday(task)}>
                  Add to {formatShortDate(selectedDate)}
                </button>
                <button className="btn ghost sm" type="button" disabled={savingTaskId === task.id} onClick={() => setEditingTaskId(task.id)}>
                  Edit
                </button>
              </span>
            </div>
          ))}
          {unscheduledTasks.length === 0 && <div className="ops-schedule-empty">No unscheduled open tasks in the current queue.</div>}
        </div>
      </section>
    </div>
  );
}

function MobileScheduleAgenda({
  mode,
  tasks,
  propertyRows,
  visibleDays,
  staffOptions,
  loading,
  savingTaskId,
  onOpenTask,
  onEdit,
}: {
  mode: SchedulePlannerMode;
  tasks: Task[];
  propertyRows: SchedulePropertyRow[];
  visibleDays: string[];
  staffOptions: OperationsStaffUser[];
  loading: boolean;
  savingTaskId: string | null;
  onOpenTask: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const assigneeLabel = (task: Task) => {
    const assigneeId = task.assigneeIds[0];
    if (!assigneeId) return 'Unassigned';
    return staffOptions.find((user) => user.id === assigneeId)?.name
      || task.assigneeNames?.[0]
      || 'Assigned';
  };

  if (mode === 'property_week') {
    return (
      <section className="ops-mobile-schedule-agenda" aria-label="Mobile property schedule" aria-busy={loading}>
        {propertyRows.map((row) => (
          <div className="ops-mobile-schedule-group" key={row.id}>
            <div className="ops-mobile-schedule-group-head">
              <span>
                <strong>{row.label}</strong>
                {row.subLabel && <small>{row.subLabel}</small>}
              </span>
              <em>{row.tasks.length} tasks</em>
            </div>
            <div className="ops-mobile-schedule-list">
              {row.reservations.slice(0, 3).map((reservation) => (
                <div className="ops-mobile-reservation-row" key={`${row.id}-${reservation.id}`}>
                  <span>{reservation.guestName}</span>
                  <small>{reservation.checkInDate} - {reservation.checkOutDate}</small>
                </div>
              ))}
              {[...row.tasks]
                .sort((a, b) => compareText(taskTimeSortKey(a), taskTimeSortKey(b)))
                .map((task) => (
                  <MobileScheduleTaskRow
                    key={`${row.id}-${task.id}`}
                    task={task}
                    assignee={assigneeLabel(task)}
                    saving={savingTaskId === task.id}
                    onOpenTask={onOpenTask}
                    onEdit={onEdit}
                  />
                ))}
            </div>
          </div>
        ))}
        {propertyRows.length === 0 && <div className="ops-schedule-empty">No scheduled tasks or reservation overlays match this view.</div>}
      </section>
    );
  }

  const groups = mode === 'user_day'
    ? SCHEDULE_TIME_BUCKETS.map((bucket) => ({
      key: bucket.id,
      label: bucket.label,
      hint: bucket.subLabel,
      tasks: tasks.filter((task) => timeBucketForTask(task) === bucket.id),
    })).filter((group) => group.tasks.length > 0)
    : visibleDays.map((day) => ({
      key: day,
      label: formatScheduleDate(day),
      hint: formatShortDate(day),
      tasks: tasks.filter((task) => task.dueDate === day),
    })).filter((group) => group.tasks.length > 0);

  return (
    <section className="ops-mobile-schedule-agenda" aria-label="Mobile task schedule" aria-busy={loading}>
      {groups.map((group) => (
        <div className="ops-mobile-schedule-group" key={group.key}>
          <div className="ops-mobile-schedule-group-head">
            <span>
              <strong>{group.label}</strong>
              {group.hint && <small>{group.hint}</small>}
            </span>
            <em>{group.tasks.length}</em>
          </div>
          <div className="ops-mobile-schedule-list">
            {group.tasks.map((task) => (
              <MobileScheduleTaskRow
                key={`${group.key}-${task.id}`}
                task={task}
                assignee={assigneeLabel(task)}
                saving={savingTaskId === task.id}
                onOpenTask={onOpenTask}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <div className="ops-schedule-empty">No scheduled tasks match this view.</div>}
    </section>
  );
}

function MobileScheduleTaskRow({
  task,
  assignee,
  saving,
  onOpenTask,
  onEdit,
}: {
  task: Task;
  assignee: string;
  saving: boolean;
  onOpenTask: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const statusSwatch = toneStyle(taskStatusTone(task.status));
  return (
    <article
      className="ops-mobile-schedule-row"
      data-status={task.status}
      style={{ borderLeftColor: statusSwatch.color }}
    >
      <button type="button" className="ops-mobile-schedule-row-main" onClick={() => onOpenTask(task.id)}>
        <span className="ops-mobile-schedule-time">{formatTimeLabel(task.dueTime)}</span>
        <span>
          <strong>{task.title}</strong>
          <small>{taskPropertyLabel(task)} · {assignee} · {task.priority}</small>
        </span>
      </button>
      <span className="ops-mobile-schedule-side">
        <em style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</em>
        <button className="btn ghost sm" type="button" disabled={saving} onClick={() => onEdit(task.id)}>
          Edit
        </button>
      </span>
    </article>
  );
}

function PlannerTaskCard({
  task,
  staffOptions,
  saving,
  dragEnabled,
  onDragStart,
  onOpenTask,
  onEdit,
}: {
  task: Task;
  staffOptions: OperationsStaffUser[];
  saving: boolean;
  dragEnabled: boolean;
  onDragStart: (event: React.DragEvent<HTMLElement>, task: Task) => void;
  onOpenTask: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const statusSwatch = toneStyle(taskStatusTone(task.status));
  const selectedAssignee = task.assigneeIds[0] || '';

  return (
    <div
      className="ops-schedule-task"
      data-status={task.status}
      style={{ borderLeftColor: statusSwatch.color }}
      draggable={dragEnabled && !saving}
      onDragStart={(event) => onDragStart(event, task)}
    >
      <button type="button" className="ops-schedule-task-main" onClick={() => onOpenTask(task.id)}>
        <span className="ops-schedule-time">{formatTimeLabel(task.dueTime)}</span>
        <span>
          <strong>{task.title}</strong>
          <small>
            {task.propertyCode || 'No property'} · {taskStatusLabel(task.status)} · {task.reservationId ? 'reservation' : task.department}
          </small>
        </span>
        <em style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</em>
      </button>
      <div className="ops-schedule-task-controls compact">
        <span>{selectedAssignee ? staffOptions.find((user) => user.id === selectedAssignee)?.name || 'Assigned' : 'Unassigned'}</span>
        <button className="btn ghost sm" type="button" disabled={saving} onClick={() => onEdit(task.id)}>
          Edit schedule
        </button>
      </div>
    </div>
  );
}

function PlannerCompactCell({
  tasks,
  reservations,
  propertyCode,
  dropTarget,
  dragEnabled,
  savingTaskId,
  onDragStart,
  onDrop,
  onDragOver,
  onOpenTask,
  onEdit,
}: {
  tasks: Task[];
  reservations?: ScheduleReservation[];
  propertyCode?: string;
  dropTarget: PlannerDropTarget;
  dragEnabled: boolean;
  savingTaskId: string | null;
  onDragStart: (event: React.DragEvent<HTMLElement>, task: Task) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, target: PlannerDropTarget) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onOpenTask: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const visibleTasks = tasks.slice(0, COMPACT_CELL_LIMIT);
  const overflow = tasks.length - visibleTasks.length;

  return (
    <div
      className="ops-planner-cell compact"
      role="gridcell"
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, dropTarget)}
    >
      {(reservations || []).slice(0, 2).map((reservation) => (
        <div className="ops-reservation-bar" key={`${propertyCode || 'row'}-${reservation.id}`} title={`${reservation.guestName} · ${reservation.confirmationCode}`}>
          <span>{reservation.guestName}</span>
        </div>
      ))}
      <div className="ops-planner-chip-row">
        {visibleTasks.map((task) => {
          const statusSwatch = toneStyle(taskStatusTone(task.status));
          const assignee = taskAssigneePeople(task)[0]?.name.split(' ')[0] || 'Unassigned';
          const meta = [task.dueTime ? formatTimeLabel(task.dueTime) : null, STATUS_LABEL[task.status], assignee].filter(Boolean).join(' · ');
          return (
            <div className="ops-planner-chip-wrap" key={`${dropTarget.rowId}-${dropTarget.date}-${task.id}`}>
              <button
                type="button"
                className="ops-planner-chip"
                data-status={task.status}
                style={{ borderLeftColor: statusSwatch.color }}
                title={`${task.title} · ${task.propertyCode || 'No property'} · ${STATUS_LABEL[task.status]}`}
                draggable={dragEnabled && savingTaskId !== task.id}
                onDragStart={(event) => onDragStart(event, task)}
                onClick={() => onOpenTask(task.id)}
              >
                <span className="ops-planner-chip-title">{task.title}</span>
                <span className="ops-planner-chip-meta">
                  <span className="ops-planner-chip-status-dot" style={{ background: statusSwatch.color }} />
                  {meta}
                </span>
              </button>
              <button
                type="button"
                className="ops-planner-chip-edit"
                disabled={savingTaskId === task.id}
                onClick={() => onEdit(task.id)}
              >
                Edit
              </button>
            </div>
          );
        })}
        {overflow > 0 && <span className="ops-planner-overflow">+{overflow}</span>}
      </div>
    </div>
  );
}

function PlannerEditPanel({
  task,
  staffOptions,
  saving,
  onOpenTask,
  onClose,
  onPatch,
}: {
  task: Task;
  staffOptions: OperationsStaffUser[];
  saving: boolean;
  onOpenTask: (id: string) => void;
  onClose: () => void;
  onPatch: (task: Task, patch: Parameters<typeof updateTask>[0]['patch'], success: string) => Promise<void>;
}) {
  const selectedAssignee = task.assigneeIds[0] || '';
  return (
    <div className="ops-planner-edit" aria-label="Edit selected scheduled task">
      <div>
        <div className="ops-mobile-kicker">Selected task</div>
        <strong>{task.title}</strong>
        <small>{task.propertyCode || 'No property'} · {STATUS_LABEL[task.status]}</small>
      </div>
      <label>
        <span>Date</span>
        <input
          type="date"
          value={task.dueDate || ''}
          disabled={saving}
          onChange={(e) => void onPatch(task, { dueDate: e.target.value, status: task.status === 'reported' ? 'scheduled' : task.status }, 'Task date updated')}
        />
      </label>
      <label>
        <span>Time</span>
        <input
          type="time"
          value={task.dueTime?.slice(0, 5) || ''}
          disabled={saving}
          onChange={(e) => void onPatch(task, { dueTime: e.target.value }, 'Task time updated')}
        />
      </label>
      <label>
        <span>Assignee</span>
        <select
          value={selectedAssignee}
          disabled={saving}
          onChange={(e) => void onPatch(task, { assigneeIds: e.target.value ? [e.target.value] : [] }, 'Task assignee updated')}
        >
          <option value="">Unassigned</option>
          {staffOptions.filter((user) => user.canAssign).map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn ghost sm" type="button" onClick={() => onOpenTask(task.id)}>
        Detail
      </button>
      <button className="btn ghost sm" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="ops-kpi-card"
      style={{ borderTopColor: accent }}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

// ───────────────── My Tasks / History ─────────────────

function MyTasksPage({
  onOpenTask,
}: {
  onOpenTask: (id: string) => void;
}) {
  const currentUserId = useCurrentUserId();
  const { role } = usePermissions();
  const myTaskFilter = useMemo(() => ({ assignee: 'me' as const }), []);
  const { tasks: assignedTasks, loading, error, refetch } = useApiTasks(myTaskFilter);
  const [dateTab, setDateTab] = useState<TaskDateTab>('today');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | 'all'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [reservation, setReservation] = useState<ReservationFilter>('all');
  const [sort, setSort] = useState<MyTaskSort>('due');
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState(addDays(TODAY, 13));
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const visibleTasks = useMemo(() => {
    const tasks = assignedTasks
      .filter((task) => !CLOSED_STATUS.has(task.status))
      .filter((task) => withinDateTab(task, dateTab, startDate, endDate))
      .filter((task) => department === 'all' || task.department === department)
      .filter((task) => priority === 'all' || task.priority === priority)
      .filter((task) => reservation === 'all' || reservationState(task) === reservation)
      .filter((task) => taskMatchesSearch(task, search));
    return [...tasks].sort((a, b) => {
      if (sort === 'property') return compareText(taskPropertyLabel(a), taskPropertyLabel(b)) || taskDueCompare(a, b);
      if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || taskDueCompare(a, b);
      if (sort === 'due') return taskDueCompare(a, b);
      return (
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        taskDueCompare(a, b)
      );
    });
  }, [assignedTasks, dateTab, department, endDate, priority, reservation, search, sort, startDate]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    visibleTasks.forEach((task) => {
      const key = myTaskTimeGroup(task, dateTab);
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => myTaskGroupRank(a) - myTaskGroupRank(b) || compareText(a, b));
  }, [dateTab, visibleTasks]);

  const counts = useMemo(() => {
    const active = assignedTasks.filter((task) => task.status === 'in_progress').length;
    const due = assignedTasks.filter((task) => task.dueDate && task.dueDate <= TODAY && !CLOSED_STATUS.has(task.status)).length;
    const blocked = assignedTasks.filter((task) => task.status === 'blocked').length;
    const completed = assignedTasks.filter((task) => task.status === 'completed' || task.status === 'closed').length;
    return { active, due, blocked, completed };
  }, [assignedTasks]);

  const setTaskStatus = async (task: Task, status: TaskStatus) => {
    setUpdatingId(task.id);
    try {
      await updateTask({ taskId: task.id, patch: { status }, actorId: currentUserId });
      fireToast(status === 'completed' ? 'Task marked completed' : `Task moved to ${STATUS_LABEL[status].toLowerCase()}`);
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Task update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="ops-my-tasks">
      <div className="ops-my-header">
        <div>
          <div className="ops-mobile-kicker">{role === 'field' ? 'Assigned only' : 'Assigned to me'}</div>
          <h2>My tasks</h2>
          <p>{role === 'field' ? 'Start, comment, attach evidence, and complete only work assigned to you.' : 'Your own execution queue inside the manager board.'}</p>
        </div>
        <div className="ops-my-header-side">
          <div className="ops-my-counts" aria-label="My task counts">
            <span><strong>{counts.active}</strong> active</span>
            <span><strong>{counts.due}</strong> due</span>
            <span><strong>{counts.blocked}</strong> blocked</span>
            <span><strong>{counts.completed}</strong> done</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="ops-my-alert">
          Live tasks could not load: {error}. Offline queue is not enabled yet, so failed actions stay visible here instead of disappearing.
        </div>
      )}
      {loading && assignedTasks.length === 0 && <LoadingState label="Loading assigned tasks" />}

      <div className="ops-my-tabs" role="tablist" aria-label="Task date range">
        {[
          ['today', 'Today'],
          ['tomorrow', 'Tomorrow'],
          ['week', 'Week'],
          ['all', 'All'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={dateTab === id ? 'active' : ''}
            onClick={() => setDateTab(id as TaskDateTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ops-my-filterbar">
        <input
          type="search"
          placeholder="Search property, title, reservation..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as MyTaskSort)} aria-label="Sort my tasks">
          <option value="suggested">Suggested</option>
          <option value="due">Due time</option>
          <option value="priority">Priority</option>
          <option value="property">Property</option>
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value as Department | 'all')} aria-label="Department">
          <option value="all">All departments</option>
          <option value="cleaning">Cleaning</option>
          <option value="inspection">Inspection</option>
          <option value="maintenance">Maintenance</option>
          <option value="office">Office</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | 'all')} aria-label="Priority">
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="lowest">Lowest</option>
        </select>
        <select value={reservation} onChange={(e) => setReservation(e.target.value as ReservationFilter)} aria-label="Reservation state">
          <option value="all">Any reservation</option>
          <option value="linked">Linked reservation</option>
          <option value="unlinked">No reservation</option>
        </select>
        {dateTab === 'all' && (
          <>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" />
          </>
        )}
      </div>

      <div className="ops-my-resultline">
        <span>{visibleTasks.length} assigned task{visibleTasks.length === 1 ? '' : 's'}</span>
        <span>{error ? 'Sync issue visible' : 'Live sync'}</span>
      </div>

      <div className="ops-my-groups">
        {groupedTasks.map(([label, tasks]) => (
          <section key={label} className="ops-my-group">
            <div className="ops-my-group-title">
              <span>{isIsoDateKey(label) ? formatHistoryDate(label) : label}</span>
              <span>{tasks.length}</span>
            </div>
            <div className="ops-my-list">
              {tasks.map((task) => (
                <MyTaskCard
                  key={task.id}
                  task={task}
                  busy={updatingId === task.id}
                  syncLabel={error ? 'Not synced' : 'Live'}
                  onOpen={() => onOpenTask(task.id)}
                  onSetStatus={(status) => setTaskStatus(task, status)}
                />
              ))}
            </div>
          </section>
        ))}
        {visibleTasks.length === 0 && <Empty>No assigned tasks match this view.</Empty>}
      </div>
    </div>
  );
}

function MyTaskCard({
  task,
  busy,
  syncLabel,
  onOpen,
  onSetStatus,
}: {
  task: Task;
  busy: boolean;
  syncLabel: string;
  onOpen: () => void;
  onSetStatus: (status: TaskStatus) => void;
}) {
  const statusSwatch = toneStyle(taskStatusTone(task.status));
  const isOverdue = Boolean(task.dueDate) && task.dueDate < TODAY && !CLOSED_STATUS.has(task.status);
  const daysUntil = daysBetween(TODAY, task.dueDate);
  const comments = taskCommentCount(task);
  const attachments = taskAttachmentCount(task);
  const meta = [
    task.department,
    task.reservationId ? 'Reservation linked' : 'No reservation',
    comments > 0 ? `${comments} comment${comments === 1 ? '' : 's'}` : null,
    attachments > 0 ? `${attachments} file${attachments === 1 ? '' : 's'}` : null,
    syncLabel,
  ].filter(Boolean).join(' · ');
  const primaryAction =
    task.status === 'scheduled' || task.status === 'ready'
      ? { label: 'Start', status: 'in_progress' as TaskStatus }
      : task.status === 'in_progress'
        ? { label: 'Pause', status: 'paused' as TaskStatus }
        : task.status === 'paused'
          ? { label: 'Resume', status: 'in_progress' as TaskStatus }
          : null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={'ops-my-card' + (isOverdue ? ' overdue' : '')}
      data-status={task.status}
      style={{ borderLeftColor: statusSwatch.color }}
      title={task.description || taskTitle(task)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="ops-my-card-top">
        <span className="mono">{taskPropertyLabel(task)}</span>
        <span className={isOverdue ? 'ops-my-due overdue' : 'ops-my-due'}>{formatTaskDue(task.dueDate, task.dueTime, task.status)}</span>
      </div>
      <h3>{taskTitle(task)}</h3>
      <div className="ops-my-card-meta">{meta}</div>
      <div className="ops-my-card-chips">
        <span style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</span>
        <PriorityLabel priority={task.priority} />
        {isOverdue && <span>overdue</span>}
        {!isOverdue && daysUntil >= 0 && daysUntil <= 1 && <span>{daysUntil === 0 ? 'today' : 'tomorrow'}</span>}
      </div>
      <div className="ops-my-card-actions">
        {primaryAction && (
          <button
            type="button"
            className="btn primary sm"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              onSetStatus(primaryAction.status);
            }}
          >
            {busy ? 'Saving...' : primaryAction.label}
          </button>
        )}
        {FIELD_EXECUTABLE_STATUS.has(task.status) && (
          <button
            type="button"
            className="btn primary sm"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              onSetStatus('completed');
            }}
          >
            Complete
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={(e) => { stop(e); onOpen(); }}>
          Comment
        </button>
      </div>
    </article>
  );
}

function MyHistoryPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const myTaskFilter = useMemo(() => ({ assignee: 'me' as const }), []);
  const { tasks: TASKS, loading, error } = useApiTasks(myTaskFilter);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month');

  const historyTasks = useMemo(() => {
    const oldest =
      range === 'week' ? addDays(TODAY, -7) :
      range === 'month' ? addDays(TODAY, -31) :
      '0000-01-01';
    return TASKS
      .filter((task) => task.status === 'completed' || task.status === 'closed')
      .filter((task) => {
        const done = (task.completedAt ?? task.updatedAt).slice(0, 10);
        return done >= oldest;
      })
      .filter((task) => taskMatchesSearch(task, search))
      .sort((a, b) => compareText(taskTimestampKey(b.completedAt ?? b.updatedAt), taskTimestampKey(a.completedAt ?? a.updatedAt)));
  }, [TASKS, range, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Task[]>();
    historyTasks.forEach((task) => {
      const day = taskTimestampKey(task.completedAt ?? task.updatedAt).slice(0, 10);
      const list = groups.get(day) ?? [];
      list.push(task);
      groups.set(day, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => compareText(b, a));
  }, [historyTasks]);

  return (
    <div className="ops-history">
      <div className="ops-my-header">
        <div>
          <div className="ops-mobile-kicker">Completion proof</div>
          <h2>My history</h2>
          <p>Completed and closed tasks grouped by completion date, with duration and evidence counts visible.</p>
        </div>
      </div>
      {error && <div className="ops-my-alert">Live history could not load: {error}</div>}
      {loading && TASKS.length === 0 && <LoadingState label="Loading task history" />}
      <div className="ops-my-filterbar">
        <input
          type="search"
          placeholder="Search completed tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="History range">
          <option value="week">Last 7 days</option>
          <option value="month">Last 31 days</option>
          <option value="all">All history</option>
        </select>
      </div>
      <div className="ops-history-groups">
        {grouped.map(([date, tasks]) => (
          <section className="ops-history-group" key={date}>
            <div className="ops-my-group-title">
              <span>{formatHistoryDate(date)}</span>
              <span>{tasks.length}</span>
            </div>
            {tasks.map((task) => (
              <button className="ops-history-row" key={task.id} type="button" onClick={() => onOpenTask(task.id)}>
                <span className="mono">{taskPropertyLabel(task)}</span>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {task.spentMinutes ? `${task.spentMinutes} min` : 'Duration not captured'} · {task.comments.length} comments · {task.attachmentCount} files
                  </small>
                </span>
                <span>{STATUS_LABEL[task.status]}</span>
              </button>
            ))}
          </section>
        ))}
        {!loading && historyTasks.length === 0 && <Empty>No completed tasks match this history view.</Empty>}
      </div>
    </div>
  );
}

function TaskRowMini({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px',
        borderBottom: '0.5px dashed var(--color-border-tertiary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <span
        style={{
          width: 4,
          alignSelf: 'stretch',
          background: priorityBarColor(task.priority),
          borderRadius: 2,
          marginRight: 4,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{task.title}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {taskPropertyLabel(task)} · {taskSubdepartmentLabel(task)} · due {formatTaskDue(task.dueDate, task.dueTime, task.status)}
        </div>
      </div>
    </div>
  );
}

// ───────────────── All Tasks ─────────────────

interface AllTasksFilters {
  department: Department | 'all';
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  property: string | 'all';
  assignee: string | 'all';
  mine: boolean;
  due: 'all' | 'today' | 'this_week' | 'overdue';
  source: TaskSource | 'all';
}

type TaskSortKey =
  | 'propertyCode'
  | 'title'
  | 'subdepartment'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'source';

const STATUS_ORDER: Record<TaskStatus, number> = {
  reported: 0,
  scheduled: 1,
  ready: 2,
  in_progress: 3,
  paused: 4,
  blocked: 5,
  completed: 6,
  closed: 7,
  cancelled: 8,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

function AllTasksPage({ onOpenTask, onCreate }: { onOpenTask: (id: string) => void; onCreate: () => void }) {
  const { role } = usePermissions();

  const [filters, setFilters] = useState<AllTasksFilters>({
    department: 'all',
    status: 'all',
    priority: 'all',
    property: 'all',
    assignee: 'all',
    mine: false,
    due: 'all',
    source: 'all',
  });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: TaskSortKey; dir: 'asc' | 'desc' } | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [staffUsers, setStaffUsers] = useState<OperationsStaffUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadOperationsStaffUsers()
      .then((users) => {
        if (!cancelled) setStaffUsers(users.filter((user) => user.canAssign));
      })
      .catch(() => {
        if (!cancelled) setStaffUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSort = (key: TaskSortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  useEffect(() => {
    setOffset(0);
  }, [filters, search, sort, pageSize]);

  const pageQuery = useMemo(() => {
    const dueToday = filters.due === 'today';
    const dueThisWeek = filters.due === 'this_week';
    return {
      department: filters.department !== 'all' ? filters.department : undefined,
      status: filters.status !== 'all' ? [filters.status] : undefined,
      priority: filters.priority !== 'all' ? filters.priority : undefined,
      property: filters.property !== 'all' ? filters.property : undefined,
      assignee: filters.mine || role === 'field'
        ? 'me'
        : (filters.assignee !== 'all' ? filters.assignee : undefined),
      source: filters.source !== 'all' ? filters.source : undefined,
      overdue: filters.due === 'overdue',
      dueAfter: dueToday ? TODAY : (dueThisWeek ? TODAY : undefined),
      dueBefore: dueToday ? TODAY : (dueThisWeek ? addDays(TODAY, 6) : undefined),
      search: search.trim() || undefined,
      sort: sort?.key,
      dir: sort?.dir,
      limit: pageSize,
      offset,
    };
  }, [filters, offset, pageSize, role, search, sort]);

  const {
    tasks: visibleTasks,
    total,
    limit,
    offset: pageOffset,
    hasMore,
    loading,
    error,
  } = useApiTasksPage(pageQuery);
  const propertyFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    TASK_PROPERTIES.forEach((property) => seen.set(property.code, property.code));
    visibleTasks.forEach((task) => {
      const code = task.propertyCode?.trim();
      if (code) seen.set(code, code);
    });
    if (filters.property !== 'all' && filters.property) seen.set(filters.property, filters.property);
    return [...seen.values()].sort((a, b) => a.localeCompare(b)).map((code) => ({ value: code, label: code }));
  }, [filters.property, visibleTasks]);

  const activeFilterCount =
    (filters.department !== 'all' ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.property !== 'all' ? 1 : 0) +
    (filters.assignee !== 'all' ? 1 : 0) +
    (filters.due !== 'all' ? 1 : 0) +
    (filters.source !== 'all' ? 1 : 0) +
    (filters.mine ? 1 : 0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const pageStart = total === 0 ? 0 : pageOffset + 1;
  const pageEnd = Math.min(pageOffset + visibleTasks.length, total);
  const canPrev = pageOffset > 0;
  const canNext = hasMore;
  const clearAllFilters = () =>
    setFilters({
      department: 'all',
      status: 'all',
      priority: 'all',
      property: 'all',
      assignee: 'all',
      mine: false,
      due: 'all',
      source: 'all',
    });

  const filterChips = (
    <>
      <FilterChip
        value={filters.department}
        options={[
          { value: 'all', label: 'All depts' },
          { value: 'cleaning', label: 'Cleaning' },
          { value: 'inspection', label: 'Inspection' },
          { value: 'maintenance', label: 'Maintenance' },
          { value: 'office', label: 'Office' },
        ]}
        onChange={(v) => setFilters({ ...filters, department: v as Department | 'all' })}
      />
      <FilterChip
        value={filters.status}
        options={[
          { value: 'all', label: 'All statuses' },
          { value: 'reported', label: 'Reported' },
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'ready', label: 'Ready' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'paused', label: 'Paused' },
          { value: 'blocked', label: 'Blocked' },
          { value: 'completed', label: 'Completed' },
          { value: 'closed', label: 'Closed' },
        ]}
        onChange={(v) => setFilters({ ...filters, status: v as TaskStatus | 'all' })}
      />
      <FilterChip
        value={filters.priority}
        options={[
          { value: 'all', label: 'All priorities' },
          { value: 'urgent', label: 'Urgent' },
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ]}
        onChange={(v) => setFilters({ ...filters, priority: v as TaskPriority | 'all' })}
      />
      <FilterChip
        value={filters.property}
        options={[
          { value: 'all', label: 'All properties' },
          ...propertyFilterOptions,
        ]}
        onChange={(v) => setFilters({ ...filters, property: v })}
      />
      <FilterChip
        value={filters.assignee}
        options={[
          { value: 'all', label: 'All assignees' },
          ...(staffUsers.length > 0
            ? staffUsers.map((u) => ({ value: u.id, label: u.name.split(' ')[0] }))
            : TASK_USERS.filter((u) => u.role !== 'external').map((u) => ({
                value: u.id,
                label: u.name.split(' ')[0],
              }))),
        ]}
        onChange={(v) => setFilters({ ...filters, assignee: v })}
      />
      <FilterChip
        value={filters.due}
        options={[
          { value: 'all', label: 'Any time' },
          { value: 'today', label: 'Today' },
          { value: 'this_week', label: 'This week' },
          { value: 'overdue', label: 'Overdue' },
        ]}
        onChange={(v) => setFilters({ ...filters, due: v as AllTasksFilters['due'] })}
      />
      <FilterChip
        value={filters.source}
        options={[
          { value: 'all', label: 'Any source' },
          { value: 'manual', label: 'Manual' },
          { value: 'breezeway', label: 'Imported' },
          { value: 'inbox_ai', label: 'Inbox' },
          { value: 'syndic', label: 'Syndic' },
          { value: 'friday', label: 'Friday' },
          { value: 'guesty', label: 'Guesty' },
          { value: 'recurring', label: 'Recurring' },
          { value: 'reservation_trigger', label: 'Reservation' },
          { value: 'reported_issue', label: 'Issue' },
          { value: 'group_email', label: 'Email' },
          { value: 'personal', label: 'Personal' },
          { value: 'review', label: 'Review' },
        ]}
        onChange={(v) => setFilters({ ...filters, source: v as TaskSource | 'all' })}
      />
      <button
        className={'inbox-chip' + (filters.mine ? ' active' : '')}
        onClick={() => setFilters({ ...filters, mine: !filters.mine })}
      >
        Mine only
      </button>
    </>
  );

  return (
    <div className="ops-all-tasks">
      <div className="ops-all-toolbar">
        {error && (
          <div style={{ marginBottom: 10, padding: 10, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
            Live tasks could not load: {error}
          </div>
        )}
        <div className="all-tasks-search-row">
          <input
            type="search"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: 8, fontSize: 13 }}
          />
          <div className="all-tasks-filter-trigger" style={{ position: 'relative' }}>
            <button
              type="button"
              className={'btn ghost sm' + (activeFilterCount > 0 || mobileFiltersOpen ? ' active' : '')}
              onClick={(e) => {
                e.stopPropagation();
                setMobileFiltersOpen(!mobileFiltersOpen);
              }}
              aria-haspopup="dialog"
              aria-expanded={mobileFiltersOpen}
              style={{
                background: activeFilterCount > 0 ? 'var(--color-background-tertiary)' : undefined,
                color: activeFilterCount > 0 ? 'var(--color-brand-accent)' : undefined,
                whiteSpace: 'nowrap',
              }}
            >
              <IconFilter size={14} /> Filters
              {activeFilterCount > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    marginLeft: 4,
                    padding: '0 5px',
                    borderRadius: 8,
                    background: 'var(--color-brand-accent)',
                    color: 'white',
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            {mobileFiltersOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                  onClick={() => setMobileFiltersOpen(false)}
                />
                <div
                  className="fad-dropdown all-tasks-filter-sheet"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px 10px',
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Filters</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={clearAllFilters}
                        style={{ fontSize: 11 }}
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn primary sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setMobileFiltersOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {filterChips}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="all-tasks-filter-bar-desktop" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {filterChips}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          <span>
            {loading && visibleTasks.length === 0
              ? <LoadingInline label="Loading task page" />
              : `${pageStart}-${pageEnd} of ${total} tasks`}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Tasks per page"
              style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={200}>200 / page</option>
            </select>
            <button className="btn ghost sm" disabled={!canPrev || loading} onClick={() => setOffset(Math.max(0, pageOffset - limit))}>
              Prev
            </button>
            <button className="btn ghost sm" disabled={!canNext || loading} onClick={() => setOffset(pageOffset + limit)}>
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="ops-all-results">
        <table className="fad-tasks-table ops-task-table">
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--color-background-primary)', zIndex: 1 }}>
              <Th></Th>
              <SortableTh sortKey="propertyCode" sort={sort} onToggle={toggleSort}>Property</SortableTh>
              <SortableTh sortKey="title" sort={sort} onToggle={toggleSort}>Title</SortableTh>
              <SortableTh sortKey="subdepartment" sort={sort} onToggle={toggleSort}>Dept</SortableTh>
              <SortableTh sortKey="status" sort={sort} onToggle={toggleSort}>Status</SortableTh>
              <SortableTh sortKey="priority" sort={sort} onToggle={toggleSort}>Priority</SortableTh>
              <Th>Assignees</Th>
              <SortableTh sortKey="dueDate" sort={sort} onToggle={toggleSort}>Due</SortableTh>
              <SortableTh sortKey="source" sort={sort} onToggle={toggleSort}>Origin</SortableTh>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <TaskTableRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
            ))}
          </tbody>
        </table>
        {loading && visibleTasks.length === 0 && <LoadingState label="Loading live tasks" />}
        {loading && visibleTasks.length > 0 && (
          <div style={{ padding: '10px 0' }}>
            <LoadingInline label="Refreshing task page" />
          </div>
        )}
        <div className="fad-tasks-cards">
          {visibleTasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))}
        </div>
        {visibleTasks.length === 0 && <Empty>No tasks match the filters.</Empty>}
      </div>
    </div>
  );
}

function FilterChip({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '4px 8px',
        fontSize: 11,
        borderRadius: 4,
        border: '0.5px solid var(--color-border-tertiary)',
        background: value === options[0].value ? 'var(--color-background-secondary)' : 'var(--color-brand-accent-soft)',
        cursor: 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
        fontWeight: 500,
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function SortableTh({
  sortKey,
  sort,
  onToggle,
  children,
}: {
  sortKey: TaskSortKey;
  sort: { key: TaskSortKey; dir: 'asc' | 'desc' } | null;
  onToggle: (key: TaskSortKey) => void;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const indicator = active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      style={{
        textAlign: 'left',
        padding: 0,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: active ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)',
        fontWeight: 500,
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '8px 10px',
          background: 'transparent',
          border: 0,
          color: 'inherit',
          font: 'inherit',
          textTransform: 'inherit',
          letterSpacing: 'inherit',
          cursor: 'pointer',
        }}
      >
        {children}
        <span aria-hidden="true">{indicator}</span>
      </button>
    </th>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const swatch = toneStyle(taskStatusTone(status));
  return (
    <span
      className="ops-status-pill-strong"
      style={{ background: swatch.background, color: swatch.color }}
    >
      {STATUS_LABEL[status] || 'Reported'}
    </span>
  );
}

function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span className={'ops-priority-label' + (priority === 'urgent' ? ' urgent' : '')}>
      {labelCase(priority)}
    </span>
  );
}

function TaskTableRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const sourceSwatch = toneStyle(taskSourceTone(task.source));
  const sourceLabel = SOURCE_LABEL[task.source] || 'Task';
  const assignees = taskAssigneePeople(task);
  const isClosed = CLOSED_STATUS.has(task.status);
  return (
    <tr
      className="ops-task-row"
      data-closed={isClosed ? 'true' : undefined}
      onClick={onClick}
    >
      <td className="ops-task-priority-cell">
        <span className="ops-task-priority-bar" style={{ background: priorityBarColor(task.priority) }} />
      </td>
      <td className="ops-task-property-cell">
        <span className="mono">{taskPropertyLabel(task)}</span>
      </td>
      <td className="ops-task-title-cell">
        <div className="ops-task-title-line">{task.title}</div>
        {task.riskFlags.length > 0 && (
          <div className="ops-task-risk-line">
            ⚠ {task.riskFlags.slice(0, 2).join(', ')}
            {task.riskFlags.length > 2 && ` +${task.riskFlags.length - 2}`}
          </div>
        )}
      </td>
      <td className="ops-task-muted-cell">{taskSubdepartmentLabel(task)}</td>
      <td className="ops-task-chip-cell">
        <StatusPill status={task.status} />
      </td>
      <td className="ops-task-chip-cell">
        <PriorityLabel priority={task.priority} />
      </td>
      <td className="ops-task-assignees-cell">
        <div style={{ display: 'flex', gap: 0 }}>
          {assignees.slice(0, 3).map((u, i) => {
            return (
              <span
                key={u.id}
                title={u.name}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: u.avatarColor,
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: i === 0 ? 0 : -6,
                  border: '1.5px solid var(--color-background-primary)',
                }}
              >
                {u.initials}
              </span>
            );
          })}
          {assignees.length === 0 && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>—</span>}
        </div>
      </td>
      <td className="ops-task-due-cell">{formatTaskDue(task.dueDate, task.dueTime, task.status)}</td>
      <td className="ops-task-origin-cell">
        <span
          className="ops-source-label"
          style={{
            background: sourceSwatch.background,
            color: sourceSwatch.color,
          }}
        >
          {sourceLabel}
        </span>
      </td>
      <td className="ops-task-files-cell">
        {task.attachmentCount > 0 && `Files ${task.attachmentCount}`}
      </td>
    </tr>
  );
}

function formatTaskDue(dueDate: string, dueTime?: string, status?: TaskStatus): string {
  if (!dueDate) return 'No due date';
  const time = dueTime ? `, ${formatTimeLabel(dueTime)}` : '';
  if (dueDate === TODAY) return `Today${time}`;
  const parts = dateParts(dueDate);
  const todayParts = dateParts(TODAY);
  if (!parts || !todayParts) return `No due date${dueTime ? `, ${formatTimeLabel(dueTime)}` : ''}`;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  const [todayYear, todayMonth, todayDay] = todayParts;
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const sameYear = year === todayYear;
  const fmt = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  if (diff === 1) return `Tomorrow${time}`;
  if (diff < 0 && (!status || !CLOSED_STATUS.has(status))) return `${fmt}${time} · overdue`;
  return `${fmt}${time}`;
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const sourceSwatch = toneStyle(taskSourceTone(task.source));
  const assignees = taskAssigneePeople(task);
  const chipBase: React.CSSProperties = {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };
  return (
    <button type="button" onClick={onClick} className="fad-task-card">
      <span className="fad-task-card-bar" style={{ background: priorityBarColor(task.priority) }} />
      <div className="fad-task-card-body">
        <div className="fad-task-card-row1">
          <span className="fad-task-card-title">{task.title}</span>
          {task.attachmentCount > 0 && (
            <span className="fad-task-card-attach">📎 {task.attachmentCount}</span>
          )}
        </div>
        <div className="fad-task-card-meta">
          <span className="mono">{taskPropertyLabel(task)}</span>
          <span>·</span>
          <span>{taskSubdepartmentLabel(task)}</span>
          <span>·</span>
          <span>{formatTaskDue(task.dueDate, task.dueTime, task.status)}</span>
        </div>
        {task.riskFlags.length > 0 && (
          <div className="fad-task-card-risk">
            ⚠ {task.riskFlags.slice(0, 2).join(', ')}
            {task.riskFlags.length > 2 && ` +${task.riskFlags.length - 2}`}
          </div>
        )}
        <div className="fad-task-card-row2">
          <div className="fad-task-card-chips">
            <StatusPill status={task.status} />
            <PriorityLabel priority={task.priority} />
            <span style={{ ...chipBase, background: sourceSwatch.background, color: sourceSwatch.color }}>
              {SOURCE_LABEL[task.source] || 'Task'}
            </span>
          </div>
          <div className="fad-task-card-avatars">
            {assignees.slice(0, 3).map((u, i) => {
              return (
                <span
                  key={u.id}
                  title={u.name}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: u.avatarColor,
                    color: 'white',
                    fontSize: 9,
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: i === 0 ? 0 : -6,
                    border: '1.5px solid var(--color-background-primary)',
                  }}
                >
                  {u.initials}
                </span>
              );
            })}
            {assignees.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ───────────────── Intake Triage ─────────────────

type IntakeTriageAction = 'accept' | 'dismiss' | 'duplicate' | 'stale' | 'link';

const TRIAGE_CHIP_STYLE: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 4,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: 0,
  whiteSpace: 'nowrap',
};

function addTags(existing: string[], ...next: string[]): string[] {
  return Array.from(new Set([...existing, ...next].filter(Boolean)));
}

function sourceRefLabel(task: Task): string {
  if (task.externalRef?.startsWith('pending_action:')) {
    return 'Pending action';
  }
  if (task.externalRef) return `Ref ${task.externalRef}`;
  if (task.inboxThreadId) return 'Conversation linked';
  if (task.reservationId) return 'Reservation linked';
  return intakeSourceLabel(task);
}

function intakeSourceLabel(task: Task): string {
  if (task.source === 'reported_issue') return 'Field report';
  if (task.source === 'inbox_ai') return 'Inbox proposal';
  if (task.source === 'group_email') return 'Team message';
  if (task.source === 'review') return 'Review follow-up';
  return SOURCE_LABEL[task.source] || 'Task intake';
}

function appendTriageNote(task: Task, note: string): string {
  return [task.description, `Triage: ${note}`].filter(Boolean).join('\n\n');
}

function ReportedIssuesPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const currentUserId = useCurrentUserId();
  const reportedTaskFilter = useMemo(() => ({ status: ['reported'] as TaskStatus[] }), []);
  const linkableTaskFilter = useMemo(() => ({ status: OPEN_SCHEDULE_STATUSES }), []);
  const { tasks: TASKS, loading, error, refetch } = useApiTasks(reportedTaskFilter);
  const { tasks: linkableTasks, refetch: refetchLinkableTasks } = useApiTasks(linkableTaskFilter);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState('');

  const intakeTasks = useMemo(() => (
    TASKS
      .filter((task) => INTAKE_SOURCES.has(task.source) && task.status === 'reported')
      .sort((a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        compareText(taskDateKey(a.dueDate), taskDateKey(b.dueDate)) ||
        compareText(taskTimestampKey(b.createdAt), taskTimestampKey(a.createdAt))
      )
  ), [TASKS]);

  const selectedTask = intakeTasks.find((task) => task.id === selectedId) ?? intakeTasks[0] ?? null;

  useEffect(() => {
    const available = new Set(intakeTasks.map((task) => task.id));
    setSelectedIds((ids) => ids.filter((id) => available.has(id)));
    if (selectedId && !available.has(selectedId)) {
      setSelectedId(intakeTasks[0]?.id ?? null);
      setDetailOpen(Boolean(intakeTasks[0]));
    }
  }, [intakeTasks, selectedId]);

  const linkTargets = useMemo(() => (
    linkableTasks
      .filter((task) => task.id !== selectedTask?.id && !CLOSED_STATUS.has(task.status))
      .sort((a, b) => compareText(taskPropertyLabel(a), taskPropertyLabel(b)) || compareText(a.title, b.title))
      .slice(0, 40)
  ), [linkableTasks, selectedTask?.id]);

  const refetchReportedIssues = () => {
    refetch();
    refetchLinkableTasks();
  };

  const toggleSelected = (taskId: string) => {
    setSelectedIds((ids) => (
      ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId]
    ));
  };

  const applyTriage = async (
    task: Task,
    action: IntakeTriageAction,
    options?: { linkTarget?: string; silent?: boolean },
  ) => {
    const linkedTask = options?.linkTarget
      ? [...TASKS, ...linkableTasks].find((t) => t.id === options.linkTarget)
      : undefined;
    const patch: Partial<{
      status: TaskStatus;
      tags: string[];
      description: string;
    }> = {};

    if (action === 'accept') {
      patch.status = 'scheduled';
      patch.tags = addTags(task.tags, 'intake:accepted', `${task.source}:accepted`);
    } else if (action === 'dismiss') {
      patch.status = 'cancelled';
      patch.tags = addTags(task.tags, 'intake:dismissed', `${task.source}:dismissed`);
      patch.description = appendTriageNote(task, `Dismissed by ${currentUserId}.`);
    } else if (action === 'duplicate') {
      patch.status = 'cancelled';
      patch.tags = addTags(task.tags, 'intake:duplicate', `${task.source}:duplicate`);
      patch.description = appendTriageNote(task, `Marked duplicate by ${currentUserId}.`);
    } else if (action === 'stale') {
      patch.status = 'cancelled';
      patch.tags = addTags(task.tags, 'intake:stale', `${task.source}:stale`);
      patch.description = appendTriageNote(task, `Marked stale by ${currentUserId}.`);
    } else if (action === 'link' && linkedTask) {
      patch.status = 'cancelled';
      patch.tags = addTags(task.tags, 'intake:linked-existing', `${task.source}:linked-existing`, `linked-existing:${linkedTask.id}`);
      patch.description = appendTriageNote(task, `Linked to existing task ${linkedTask.id} (${linkedTask.title}) by ${currentUserId}.`);
    }

    if (!patch.status) return;
    await updateTask({ taskId: task.id, patch, actorId: currentUserId });
    if (!options?.silent) {
      fireToast(action === 'accept' ? 'Task accepted into schedule' : 'Reported issue triaged');
    }
  };

  const runSingle = async (task: Task, action: IntakeTriageAction, linkTarget?: string) => {
    if (action === 'link' && !linkTarget) {
      fireToast('Choose an existing task to link');
      return;
    }
    setBusyKey(`${action}:${task.id}`);
    try {
      await applyTriage(task, action, { linkTarget });
      setSelectedIds((ids) => ids.filter((id) => id !== task.id));
      refetchReportedIssues();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Reported issue triage failed');
    } finally {
      setBusyKey(null);
    }
  };

  const runBulk = async (action: Extract<IntakeTriageAction, 'accept' | 'dismiss' | 'stale'>) => {
    const tasks = intakeTasks.filter((task) => selectedIds.includes(task.id));
    if (tasks.length === 0) return;
    setBusyKey(`bulk:${action}`);
    try {
      for (const task of tasks) {
        await applyTriage(task, action, { silent: true });
      }
      fireToast(`${tasks.length} reported item${tasks.length === 1 ? '' : 's'} triaged`);
      setSelectedIds([]);
      refetchReportedIssues();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Bulk triage failed');
    } finally {
      setBusyKey(null);
    }
  };

  const selectedSourceLabel = selectedTask ? intakeSourceLabel(selectedTask) : '';
  const selectedRefLabel = selectedTask ? sourceRefLabel(selectedTask) : '';
  const emptyReportedIssues = !loading && intakeTasks.length === 0;

  return (
    <div className={'fad-split-pane ops-reported-pane' + (detailOpen ? ' detail-open' : '') + (emptyReportedIssues ? ' empty' : '')}>
      <div
        className="fad-split-list"
        style={{
          width: emptyReportedIssues ? '100%' : 380,
          borderRight: emptyReportedIssues ? 0 : '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {error && (
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
              Reported issues could not load: {error}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0 }}>
                Reported issues
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{intakeTasks.length} reported</div>
            </div>
            <button
              className="btn ghost sm"
              type="button"
              style={{ minHeight: 34 }}
              onClick={() => {
                if (selectedIds.length === intakeTasks.length) setSelectedIds([]);
                else setSelectedIds(intakeTasks.map((task) => task.id));
              }}
              disabled={intakeTasks.length === 0}
            >
              {selectedIds.length === intakeTasks.length && intakeTasks.length > 0 ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn secondary sm" type="button" style={{ minHeight: 34 }} disabled={selectedIds.length === 0 || Boolean(busyKey)} onClick={() => runBulk('accept')}>
              Accept
            </button>
            <button className="btn ghost sm" type="button" style={{ minHeight: 34 }} disabled={selectedIds.length === 0 || Boolean(busyKey)} onClick={() => runBulk('dismiss')}>
              Dismiss
            </button>
            <button className="btn ghost sm" type="button" style={{ minHeight: 34 }} disabled={selectedIds.length === 0 || Boolean(busyKey)} onClick={() => runBulk('stale')}>
              Stale
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && intakeTasks.length === 0 && <LoadingState label="Loading reported issues" />}
          {intakeTasks.map((task) => {
            const isSelected = selectedTask?.id === task.id;
            const sourceSwatch = toneStyle(taskSourceTone(task.source));
            const sourceLabel = intakeSourceLabel(task);
            const refLabel = sourceRefLabel(task);
            return (
              <div
                key={task.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0, 1fr)',
                  gap: 6,
                  padding: '8px 10px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                }}
              >
                <label style={{ minHeight: 34, width: 34, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 1, cursor: 'pointer', position: 'relative' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(task.id)}
                    onChange={() => toggleSelected(task.id)}
                    aria-label={`Select ${task.title}`}
                    style={{ position: 'absolute', inset: 0, width: 34, height: 34, margin: 0, opacity: 0, cursor: 'pointer' }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: '1px solid var(--color-border-secondary)',
                      background: selectedIds.includes(task.id) ? 'var(--color-brand-accent)' : 'var(--color-background-primary)',
                      color: 'white',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    {selectedIds.includes(task.id) ? '✓' : ''}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => { setSelectedId(task.id); setDetailOpen(true); }}
                  style={{
                    border: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    padding: 0,
                    minWidth: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{task.propertyCode || 'No property'}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{formatRelative(task.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{taskTitle(task)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                    <span style={{ ...TRIAGE_CHIP_STYLE, background: sourceSwatch.background, color: sourceSwatch.color }}>{sourceLabel}</span>
                    <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>{task.priority}</span>
                    {refLabel !== sourceLabel && (
                      <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>{refLabel}</span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
          {!loading && intakeTasks.length === 0 && <Empty>No reported issues need triage.</Empty>}
        </div>
      </div>

      {!emptyReportedIssues && (
      <div className="fad-split-detail" style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          style={{ minHeight: 34 }}
          onClick={() => setDetailOpen(false)}
        >
          ← Back to reported issues
        </button>
        {selectedTask ? (
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  {selectedTask.propertyCode || 'No property'} · {selectedSourceLabel}
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{taskTitle(selectedTask)}</h2>
              </div>
              <button className="btn ghost sm" type="button" style={{ minHeight: 34 }} onClick={() => onOpenTask(selectedTask.id)}>
                Open task
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ ...TRIAGE_CHIP_STYLE, background: toneStyle(taskStatusTone(selectedTask.status)).background, color: toneStyle(taskStatusTone(selectedTask.status)).color }}>
                {STATUS_LABEL[selectedTask.status] || 'Reported'}
              </span>
              <span style={{ ...TRIAGE_CHIP_STYLE, background: toneStyle(taskSourceTone(selectedTask.source)).background, color: toneStyle(taskSourceTone(selectedTask.source)).color }}>
                {selectedSourceLabel}
              </span>
              <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
                {selectedTask.priority}
              </span>
              {selectedRefLabel !== selectedSourceLabel && !selectedTask.reservationId && !selectedTask.inboxThreadId && (
                <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
                  {selectedRefLabel}
                </span>
              )}
              {selectedTask.reservationId && (
                <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
                  reservation linked
                </span>
              )}
              {selectedTask.inboxThreadId && (
                <span style={{ ...TRIAGE_CHIP_STYLE, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
                  conversation linked
                </span>
              )}
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                marginBottom: 16,
              }}
            >
              {selectedTask.description || 'No source summary attached.'}
            </div>

            <div className="ops-inbox-ai-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              <button
                className="btn primary"
                type="button"
                style={{ minHeight: 36 }}
                disabled={Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'accept')}
              >
                Accept task
              </button>
              <button
                className="btn ghost"
                type="button"
                style={{ minHeight: 36 }}
                disabled={Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'duplicate')}
              >
                Duplicate
              </button>
              <button
                className="btn ghost"
                type="button"
                style={{ minHeight: 36 }}
                disabled={Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'stale')}
              >
                Stale
              </button>
              <button
                className="btn ghost"
                type="button"
                style={{ minHeight: 36 }}
                disabled={Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'dismiss')}
              >
                Dismiss
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 8,
                alignItems: 'end',
                maxWidth: 620,
              }}
            >
              <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Link existing task
                <select
                  value={linkTargetId}
                  onChange={(e) => setLinkTargetId(e.target.value)}
                  style={{
                    minHeight: 42,
                    borderRadius: 6,
                    border: '1px solid var(--color-border-secondary)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)',
                    padding: '0 10px',
                    minWidth: 0,
                  }}
                >
                  <option value="">Choose task</option>
                  {linkTargets.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.propertyCode || 'No property'} · {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn secondary"
                type="button"
                style={{ minHeight: 36 }}
                disabled={!linkTargetId || Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'link', linkTargetId)}
              >
                Link
              </button>
            </div>
          </div>
        ) : (
          <Empty>Select a reported task to triage.</Empty>
        )}
      </div>
      )}
    </div>
  );
}

// ───────────────── Approvals ─────────────────

function ApprovalsPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { tasks: TASKS, loading, error } = useApiTasks();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'blocked' | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    let tasks = TASKS.filter((task) => task.awaitingHumanApproval || task.status === 'blocked' || task.tags.some((tag) => tag.includes('approval')));
    if (statusFilter === 'pending') tasks = tasks.filter((task) => task.awaitingHumanApproval);
    if (statusFilter === 'blocked') tasks = tasks.filter((task) => task.status === 'blocked');
    return tasks.sort((a, b) => compareText(taskTimestampKey(b.updatedAt), taskTimestampKey(a.updatedAt)));
  }, [TASKS, statusFilter]);

  const selected = visible.find((task) => task.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      <div className="fad-split-list" style={{ width: 380, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {error && (
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
              Approval tasks could not load: {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['pending', 'blocked', 'all'] as const).map((s) => (
              <button
                key={s}
                className={'inbox-chip' + (statusFilter === s ? ' active' : '')}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && visible.length === 0 && <LoadingState label="Loading approval queue" />}
          {visible.map((task) => {
            const isSelected = selected?.id === task.id;
            const requester = task.requesterId ? TASK_USER_BY_ID[task.requesterId] : null;
            return (
              <button
                key={task.id}
                onClick={() => { setSelectedId(task.id); setDetailOpen(true); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  border: 0,
                  background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{task.propertyCode || 'No property'}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{formatRelative(task.updatedAt)}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{task.title}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {task.awaitingHumanApproval ? 'Awaiting approval' : STATUS_LABEL[task.status]}
                  {requester ? ` · ${requester.name.split(' ')[0]}` : ''}
                </div>
              </button>
            );
          })}
          {!loading && visible.length === 0 && <Empty>No live approval requests.</Empty>}
        </div>
      </div>

      <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          onClick={() => setDetailOpen(false)}
        >
          ← Back to approvals
        </button>
        {selected ? <ApprovalDetail task={selected} onOpenTask={onOpenTask} /> : <Empty>Select a request.</Empty>}
      </div>
    </div>
  );
}

function ApprovalDetail({
  task,
  onOpenTask,
}: {
  task: Task;
  onOpenTask: (id: string) => void;
}) {
  const requester = task.requesterId ? TASK_USER_BY_ID[task.requesterId] : null;
  const totalOwnerCharge = task.costs
    .filter((cost) => cost.ownerCharge)
    .reduce((sum, cost) => sum + cost.amount, 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>
        {task.title}
      </h2>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        {task.propertyCode || 'No property'} · {requester?.name ?? 'Unknown requester'} · updated {formatRelative(task.updatedAt)}
      </div>

      {totalOwnerCharge > 0 && (
        <div
          style={{
            padding: 16,
            background: 'var(--color-background-secondary)',
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 500 }}>
            {totalOwnerCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MUR
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>Owner-charge costs attached to this task.</div>
        </div>
      )}

      <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Context:</strong> {task.description || 'No approval context has been captured yet.'}
      </div>

      {task.attachmentCount > 0 && (
        <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {task.attachmentCount} attachment{task.attachmentCount === 1 ? '' : 's'} linked
        </div>
      )}

      <button className="btn primary" onClick={() => onOpenTask(task.id)}>
        Open task
      </button>
    </div>
  );
}

// ───────────────── Insights ─────────────────

function InsightsPage() {
  const { tasks: TASKS, loading, error } = useApiTasks();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6)), []);
  const inWindow = (date?: string) => Boolean(date && date.slice(0, 10) >= days[0] && date.slice(0, 10) <= days[6]);
  const completedTasks = TASKS.filter((task) => (task.status === 'completed' || task.status === 'closed') && inWindow(task.completedAt || task.updatedAt));
  const createdTasks = TASKS.filter((task) => inWindow(task.createdAt));
  const completed = days.map((day) => completedTasks.filter((task) => (task.completedAt || task.updatedAt).slice(0, 10) === day).length);
  const created = days.map((day) => createdTasks.filter((task) => task.createdAt.slice(0, 10) === day).length);
  const avgCompletionMinutes = (() => {
    const values = completedTasks
      .map((task) => {
        if (task.spentMinutes && task.spentMinutes > 0) return task.spentMinutes;
        const end = new Date(task.completedAt || task.updatedAt).getTime();
        const start = new Date(task.createdAt).getTime();
        if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
        return Math.round((end - start) / 60000);
      })
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  })();
  const top = Object.values(completedTasks.reduce<Record<string, { label: string; completed: number; minutes: number }>>((acc, task) => {
    task.assigneeIds.forEach((id, index) => {
      const label = taskAssigneeName(task, id, index).split(' ')[0];
      const row = acc[id] || { label, completed: 0, minutes: 0 };
      row.completed += 1;
      row.minutes += task.spentMinutes || task.estimatedMinutes || 0;
      acc[id] = row;
    });
    return acc;
  }, {}))
    .map((row) => ({
      label: row.label,
      completed: row.completed,
      avgMinutes: row.completed === 0 ? 0 : Math.round(row.minutes / row.completed),
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);
  const dept = (['cleaning', 'inspection', 'maintenance', 'office'] as Department[]).map((department) => {
    const done = completedTasks.filter((task) => task.department === department);
    const avg = done.length === 0 ? 0 : Math.round(done.reduce((sum, task) => sum + (task.spentMinutes || task.estimatedMinutes || 0), 0) / done.length);
    return { dept: department, count: done.length, avgMinutes: avg };
  }).filter((row) => row.count > 0);
  const props = Object.entries(
    TASKS
      .filter((task) => INTAKE_SOURCES.has(task.source))
      .reduce<Record<string, number>>((acc, task) => {
        const key = task.propertyCode || 'No property';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
  )
    .map(([code, issues]) => ({ code, issues }))
    .sort((a, b) => b.issues - a.issues)
    .slice(0, 5);
  const escalations = days.map((day) => TASKS.filter((task) => task.updatedAt.slice(0, 10) === day && (task.status === 'blocked' || task.priority === 'urgent')).length);
  const openTasks = TASKS.filter((task) => !CLOSED_STATUS.has(task.status));
  const attentionRows = [
    {
      label: 'Open today',
      value: openTasks.filter((task) => task.dueDate === TODAY).length,
      sub: 'due now',
      tone: 'neutral',
    },
    {
      label: 'Overdue',
      value: openTasks.filter((task) => task.dueDate && task.dueDate < TODAY).length,
      sub: 'needs action',
      tone: 'danger',
    },
    {
      label: 'Blocked',
      value: openTasks.filter((task) => task.status === 'blocked' || task.awaitingHumanApproval).length,
      sub: 'manager queue',
      tone: 'warning',
    },
    {
      label: 'Unassigned',
      value: openTasks.filter((task) => task.assigneeIds.length === 0).length,
      sub: 'open tasks',
      tone: 'warning',
    },
    {
      label: 'Reported',
      value: TASKS.filter((task) => INTAKE_SOURCES.has(task.source) && task.status === 'reported').length,
      sub: 'triage intake',
      tone: 'neutral',
    },
    {
      label: 'Active',
      value: TASKS.filter((task) => task.status === 'in_progress' || task.status === 'paused').length,
      sub: 'in field',
      tone: 'success',
    },
  ];
  // T1.13 (2026-05-25) — drop the blocking 5s loading skeleton. The
  // cards already render with zero values + empty-state copy when
  // TASKS is empty, so we can show the page shape instantly and let
  // the data paint in when the fetch resolves. Stale-while-revalidate
  // pattern (subscribers fire) means subsequent re-renders pick up
  // the data without operator-visible jank.
  const initialLoading = loading && TASKS.length === 0;

  return (
    <div className="ops-insights-page">
      {error && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
          Insights could not load live tasks: {error}
        </div>
      )}
      {initialLoading && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-brand-accent)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          Loading live task metrics…
        </div>
      )}
      <>
        <Section title="Attention now">
            <div className="ops-insight-attention">
              {attentionRows.map((row) => (
                <div key={row.label} className="ops-insight-attention-row" data-tone={row.tone}>
                  <strong>{row.value}</strong>
                  <span>{row.label}</span>
                  <small>{row.sub}</small>
                </div>
              ))}
            </div>
          </Section>

          <div className="ops-insights-grid">
            <Section title="Completed last 7 days">
              <div className="ops-insight-number">{completedTasks.length}</div>
              <Sparkline values={completed} color="#10b981" />
            </Section>

        <Section title="Created last 7 days">
          <div className="ops-insight-number">{createdTasks.length}</div>
          <Sparkline values={created} color="#7c3aed" />
        </Section>

        <Section title="Avg completion time">
          <div className="ops-insight-number">{avgCompletionMinutes}m</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>across all departments</div>
        </Section>

        <Section title="Top assignees">
          {top.length > 0 ? <BarList rows={top.map((r) => ({ label: r.label, value: r.completed, sub: `${r.avgMinutes}m avg` }))} /> : <Empty>No completions yet.</Empty>}
        </Section>

        <Section title="By department">
          {dept.length > 0 ? <BarList rows={dept.map((d) => ({ label: d.dept, value: d.count, sub: `${d.avgMinutes}m avg` }))} /> : <Empty>No department completions yet.</Empty>}
        </Section>

        <Section title="Properties with most issues">
          {props.length > 0 ? <BarList rows={props.map((p) => ({ label: p.code, value: p.issues, sub: `${p.issues} issue${p.issues === 1 ? '' : 's'}` }))} /> : <Empty>No reported issues yet.</Empty>}
        </Section>

        <Section title="Escalations · last 7 days">
          <Sparkline values={escalations} color="#ef4444" />
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {escalations[escalations.length - 1]} today vs {escalations[0]} 7 days ago
          </div>
        </Section>

        <Section title="AI accuracy">
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            No live AI acceptance telemetry has been recorded yet.
          </div>
        </Section>
          </div>
        </>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <span>{r.label}</span>
            <span className="mono">{r.value}</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-background-secondary)', borderRadius: 3 }}>
            <div
              style={{
                width: `${(r.value / max) * 100}%`,
                height: '100%',
                background: 'var(--color-brand-accent)',
                borderRadius: 3,
              }}
            />
          </div>
          {r.sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ops-sparkline">
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: color,
            borderRadius: 2,
            minHeight: v > 0 ? 4 : 0,
          }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}

// ───────────────── Settings ─────────────────

// @demo:config — Tag: PROD-CONFIG-10 — see frontend/DEMO_CRUFT.md
const SETTINGS_TEMPLATES = [
  { id: 'std-clean', name: 'Standard cleaning', route: 'cleaning > standard_clean', estimate: '2h', state: 'Manual selection; checkout trigger pending' },
  { id: 'post-clean', name: 'Post-clean inspection', route: 'inspection > post_clean', estimate: '30m', state: 'Manual selection; checkout trigger pending' },
  { id: 'pre-arrival', name: 'Pre-arrival inspection', route: 'inspection > pre_arrival', estimate: '45m', state: 'Manual selection; check-in trigger pending' },
  { id: 'deep-clean', name: 'Deep clean', route: 'cleaning > deep_clean', estimate: '6h', state: 'Manual selection' },
  { id: 'pool', name: 'Pool clarity check', route: 'maintenance > pool', estimate: '45m', state: 'Manual selection' },
];

const SETTINGS_BOOKING_POLICIES = [
  { trigger: 'Checkout received', actions: ['Create standard cleaning for checkout day', 'Create post-clean inspection after cleaning is due', 'Current state: trigger pending backend verification'] },
  {
    trigger: 'Two days before check-in',
    actions: [
      'If property is empty more than 3 days or flagged, create pre-arrival inspection',
      'Otherwise skip to avoid noise',
      'Current state: trigger pending backend verification',
    ],
  },
];

const SETTINGS_RECURRING_RULES = [
  { trigger: 'Pest control per property', actions: ['Every 3 months'] },
  { trigger: 'AC servicing per property', actions: ['Every 6 months'] },
  { trigger: 'Preventative maintenance', actions: ['Monthly - all properties'] },
  { trigger: 'Aesthetic check', actions: ['Monthly - all properties'] },
  { trigger: 'Amenities form gap analysis', actions: ['Monthly - sequential'] },
];

function SettingsPage() {
  return (
    <div className="ops-settings-page">
      <div className="ops-settings-head">
        <h2>Settings</h2>
      </div>

      <div className="ops-settings-policy-note">
        Manual task creation is live. Booking-trigger automation below is policy only until the backend trigger job is wired and verified.
      </div>

      <Section title="Templates">
        <div className="ops-settings-grid-row head">
          <span>Template</span>
          <span>Route</span>
          <span>Estimate</span>
          <span>Current state</span>
        </div>
        {SETTINGS_TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="ops-settings-grid-row"
          >
            <span className="ops-settings-template" data-label="Template">{t.name}</span>
            <span className="ops-settings-route" data-label="Route">{t.route}</span>
            <span className="mono ops-settings-estimate" data-label="Estimate">{t.estimate}</span>
            <span className="ops-settings-state" data-label="State">{t.state}</span>
          </div>
        ))}
      </Section>

      <Section title="Booking-trigger policy">
        {SETTINGS_BOOKING_POLICIES.map((workflow) => (
          <Workflow key={workflow.trigger} trigger={workflow.trigger} actions={workflow.actions} />
        ))}
      </Section>

      <Section title="Recurring rules">
        {SETTINGS_RECURRING_RULES.map((workflow) => (
          <Workflow key={workflow.trigger} trigger={workflow.trigger} actions={workflow.actions} />
        ))}
      </Section>
    </div>
  );
}

function Workflow({ trigger, actions }: { trigger: string; actions: string[] }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{trigger}</div>
      {actions.map((a, i) => (
        <div key={i} style={{ paddingLeft: 16, color: 'var(--color-text-secondary)' }}>
          - {a}
        </div>
      ))}
    </div>
  );
}

// ───────────────── Shared ─────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ops-section">
      <div className="ops-section-title">{title}</div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      {children}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="fad-loading-state" role="status" aria-live="polite">
      <span className="fad-loading-mark" aria-hidden="true">F</span>
      <span>{label}</span>
    </div>
  );
}

function LoadingInline({ label }: { label: string }) {
  return (
    <span className="fad-loading-inline" role="status" aria-live="polite">
      <span className="fad-loading-mark mini" aria-hidden="true">F</span>
      <span>{label}</span>
    </span>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (!Number.isFinite(diffMin)) return '';
  if (diffMin < 0) return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
