'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
// FAD V2 Manager/GM desktop screens (Claude Design retrofit). Rendered for
// manager/director on the Operations sub-pages; they bring their own refined
// header+tabs (GmShell), so ModuleHeader is skipped for those sub-pages.
import { ScreenOps } from '../gm/screens/ops';
import { ScreenApprovals as GmApprovals } from '../gm/screens/approvals';
import { ScreenSchedule as GmSchedule } from '../gm/screens/schedule';
import { ScreenRoster as GmRoster } from '../gm/screens/roster';
import { GmShell, type GmTab } from '../gm/kit';
import { DI } from '../gm/icons';
import { useT } from '../../_i18n/useT';
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
import {
  sendOperationsConsultMessage,
  type OperationsConsultActionSuggestion,
  type OperationsConsultHistoryMessage,
  type OperationsConsultPlanItem,
} from '../../_data/operationsConsultClient';
import { fetchScheduleReservations, type ScheduleReservation } from '../../_data/reservationsClient';
import { OPS_STAFF_POLICY } from '../../_data/opsPolicy';
import { TaskDetail } from './operations/TaskDetail';
import { CreateTaskDrawer, type CreateTaskMode, type CreateTaskPrefill } from './operations/CreateTaskDrawer';
import { RosterPage } from './roster/RosterPage';
import { IconClose, IconExpand, IconFilter, IconPlus, IconRefresh, IconSend, IconSparkle } from '../icons';
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

function taskOriginLabel(task: Task): string {
  if (task.source === 'breezeway') return task.bzId ? `Imported #${task.bzId}` : 'Imported task';
  if (task.source === 'reported_issue') return 'Reported issue';
  if (task.source === 'inbox_ai') return 'Inbox proposal';
  if (task.source === 'reservation_trigger') return 'Reservation task';
  return SOURCE_LABEL[task.source] || 'Task';
}

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
  // T3.15 — localised chrome strings. Tab labels are field-staff-visible
  // (My tasks / My history), so they get translation keys too.
  const { t: i18nT } = useT();

  const tabs = (
    isField
      ? [
          { id: 'my', label: i18nT('operations.tabs.my', 'My tasks') },
          { id: 'history', label: i18nT('operations.tabs.history', 'My history') },
          { id: 'issues', label: i18nT('operations.tabs.issues', 'Reported issues') },
          { id: 'roster', label: i18nT('operations.tabs.roster', 'Roster') },
        ]
      : [
          { id: 'overview', label: i18nT('operations.tabs.overview', 'Overview') },
          { id: 'schedule', label: i18nT('operations.tabs.schedule', 'Schedule') },
          { id: 'my', label: i18nT('operations.tabs.my', 'My tasks') },
          { id: 'all', label: i18nT('operations.tabs.all', 'All tasks') },
          { id: 'issues', label: i18nT('operations.tabs.issues', 'Reported issues') },
          { id: 'history', label: i18nT('operations.tabs.history', 'My history') },
          canSeeApprovals && { id: 'approvals', label: i18nT('operations.tabs.approvals', 'Approvals') },
          canSeeRoster && { id: 'roster', label: i18nT('operations.tabs.roster', 'Roster') },
          { id: 'insights', label: i18nT('operations.tabs.insights', 'Insights') },
          canSeeSettings && { id: 'settings', label: i18nT('operations.tabs.settings', 'Settings') },
        ]
  ).filter((tab): tab is { id: string; label: string } => Boolean(tab));

  const canonicalSubPage = subPage === 'intake' || subPage === 'inbox-ai' ? 'issues' : subPage;
  const active = tabs.find((t) => t.id === canonicalSubPage)?.id ?? (isField ? 'my' : 'overview');

  // Manager/GM desktop retrofit: these sub-pages render the FAD V2 GM screens
  // (own header+tabs via GmShell) → skip ModuleHeader. Field role keeps the
  // existing pages. gmNav normalises the GM screens' tab ids to ours.
  const GM_SUBS = ['overview', 'schedule', 'approvals', 'roster', 'all', 'my'];
  const isGm = !isField && GM_SUBS.includes(active);
  const gmNav = (s: string) => onChangeSubPage(s === 'reported' ? 'approvals' : s);

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
            onNav={gmNav}
          />
        );
      case 'history':
        return <MyHistoryPage onOpenTask={setDetailTaskId} />;
      case 'overview':
        return isField
          ? <OverviewPage onOpenTask={setDetailTaskId} onChangeSubPage={onChangeSubPage} canSeeRoster={canSeeRoster} />
          : <ScreenOps subPage={active} onChangeSubPage={gmNav} onCreate={() => openManagerCreate()} />;
      case 'schedule':
        return isField
          ? <SchedulePage onOpenTask={setDetailTaskId} onCreate={openManagerCreate} />
          : <GmSchedule subPage={active} onChangeSubPage={gmNav} />;
      case 'all':
        return <AllTasksPage onOpenTask={setDetailTaskId} onCreate={() => openManagerCreate()} onNav={gmNav} />;
      case 'issues':
        return <ReportedIssuesPage onOpenTask={setDetailTaskId} />;
      case 'approvals':
        return canSeeApprovals ? <GmApprovals subPage={active} onChangeSubPage={gmNav} /> : null;
      case 'roster':
        return isField ? <RosterPage /> : (canSeeRoster ? <GmRoster subPage={active} onChangeSubPage={gmNav} /> : null);
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
      {!isGm && <ModuleHeader
        title={i18nT('module.operations', 'Operations')}
        subtitle={isField
          ? i18nT('operations.subtitle.field', 'Assigned work · comments · evidence · history')
          : i18nT('operations.subtitle.manager', 'Tasks · reported issues · approvals · roster · insights')}
        tabs={tabs}
        activeTab={active}
        onTabChange={onChangeSubPage}
        actions={isField ? (
          <button className="btn primary sm" onClick={openStandaloneReport}>
            <IconPlus size={12} /> {i18nT('operations.reportIssue', 'Report issue')}
          </button>
        ) : active === 'schedule' ? null : (
          <button className="btn primary sm" onClick={() => openManagerCreate()}>
            <IconPlus size={12} /> {i18nT('operations.newTask', 'New task')}
          </button>
        )}
      />}
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

  const { t } = useT();
  return (
    <div className="ops-overview-page">
      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
          {t('operations.overview.loadError', { error: String(error) })}
        </div>
      )}
      {loading && TASKS.length === 0 && <LoadingState label={t('operations.overview.loadingLive')} />}

      <section className="ops-mobile-dashboard" aria-label={t('operations.overview.mobileDashboardAria')}>
        <div className="ops-mobile-dashboard-head">
          <div>
            <div className="ops-mobile-kicker">{role === 'field' ? t('operations.overview.fieldAgenda') : t('operations.overview.managerAgenda')}</div>
            <h2>{t('operations.overview.title')}</h2>
          </div>
          <label>
            <span>{t('operations.overview.dateLabel')}</span>
            <input type="date" value={dashboardDate} onChange={(e) => setDashboardDate(e.target.value)} />
          </label>
        </div>
        <div className="ops-status-strip" aria-label={t('operations.overview.statusFiltersAria')}>
          {[
            { id: 'open' as const, label: t('operations.status.open'), count: statusCounts.open },
            { id: 'reported' as const, label: t('operations.status.reported'), count: statusCounts.counts.reported },
            { id: 'scheduled' as const, label: t('operations.status.scheduled'), count: statusCounts.counts.scheduled },
            { id: 'ready' as const, label: t('operations.status.ready'), count: statusCounts.counts.ready },
            { id: 'in_progress' as const, label: t('operations.status.active'), count: statusCounts.counts.in_progress },
            { id: 'blocked' as const, label: t('operations.status.blocked'), count: statusCounts.counts.blocked },
            { id: 'completed' as const, label: t('operations.status.done'), count: statusCounts.counts.completed },
            { id: 'all' as const, label: t('operations.status.all'), count: statusCounts.total },
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
                <span>{tasks.length === 1
                  ? t('operations.overview.taskCountOne')
                  : t('operations.overview.taskCountMany', { n: tasks.length })}</span>
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
                    {taskAttachmentCount(task) > 0 && <span>{t('operations.overview.filesCount', { n: taskAttachmentCount(task) })}</span>}
                    {taskCommentCount(task) > 0 && <span>{t('operations.overview.commentsCount', { n: taskCommentCount(task) })}</span>}
                  </span>
                  <span className="ops-agenda-time" onClick={(e) => e.stopPropagation()}>
                    {role === 'field' ? (
                      <span>{task.dueTime ?? t('operations.overview.anyTime')}</span>
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
          {dashboardByProperty.length === 0 && <Empty>{t('operations.overview.emptyAgendaForDate', { date: formatShortDate(dashboardDate) })}</Empty>}
        </div>
      </section>

      {/* KPI strip */}
      <div className="ops-kpi-strip">
        <KpiCard label={t('operations.overview.kpi.openToday')} value={kpis.openToday} accent="var(--color-text-info)" />
        <KpiCard label={t('operations.overview.kpi.overdue')} value={kpis.overdue} accent="var(--color-text-danger)" />
        <KpiCard label={t('operations.overview.kpi.urgent')} value={kpis.urgent} accent="var(--color-text-warning)" />
        <KpiCard label={t('operations.overview.kpi.awaitingApproval')} value={kpis.awaitingApproval} accent="var(--color-brand-accent)" />
        <KpiCard label={t('operations.overview.kpi.reportedToday')} value={kpis.reportedToday} accent="var(--color-text-success)" />
      </div>

      {/* AI Daily Brief — hidden when DAILY_BRIEF_POOL is empty */}
      {todaysBrief && (
        <div
          className="ops-daily-brief"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AIBadge size="md" prefix="" />
            <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand-accent)' }}>
              {t('operations.overview.dailyBrief')}
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
        <Section title={t('operations.overview.escalationsCount', { n: escalations.length })}>
          {escalations.map((task) => (
            <TaskRowMini key={task.id} task={task} onClick={() => onOpenTask(task.id)} />
          ))}
          {escalations.length === 0 && <Empty>{t('operations.overview.noEscalations')}</Empty>}
        </Section>

        <Section title={t('operations.overview.reservationUrgentCount', { n: reservationDriven.length })}>
          {reservationDriven.map((task) => (
            <TaskRowMini key={task.id} task={task} onClick={() => onOpenTask(task.id)} />
          ))}
          {reservationDriven.length === 0 && <Empty>{t('operations.overview.noReservationUrgent')}</Empty>}
        </Section>

        <Section title={t('operations.overview.recentActivity')}>
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
type ScheduleTimelineScale = 'readable' | 'actual';

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
  dueTime?: string;
  propertyCode?: string;
}

interface ScheduleAgentSuggestion {
  taskId: string;
  title: string;
  propertyCode: string;
  dueDate: string;
  dueTime: string;
  assigneeIds: string[];
  reason: string;
}

interface SchedulePlanAudit {
  targetTasks: Task[];
  unplannedTasks: Task[];
  occupancyBlockedTasks: Task[];
  unassignedAfterApplyTasks: Task[];
  untimedAfterApplyTasks: Task[];
}

interface ScheduleUndoTaskState {
  taskId: string;
  title: string;
  dueDate: string;
  dueTime: string;
  assigneeIds: string[];
  status: TaskStatus;
}

interface ScheduleUndoEntry {
  id: string;
  label: string;
  tasks: ScheduleUndoTaskState[];
}

interface OpsConsultMessage extends OperationsConsultHistoryMessage {
  id: string;
  actions?: OperationsConsultActionSuggestion[];
  meta?: string;
}

interface OpsFridayConsultPanelProps {
  selectedDate: string;
  rangeStart: string;
  rangeEnd: string;
  plannerMode: SchedulePlannerMode;
  timelineScale: ScheduleTimelineScale;
  scheduledTasks: Task[];
  unscheduledTasks: Task[];
  staffOptions: OperationsStaffUser[];
  reservations: ScheduleReservation[];
  agentPlan: ScheduleAgentSuggestion[];
  agentApplying: boolean;
  bulkApplying: boolean;
  undoApplying: boolean;
  undoStack: ScheduleUndoEntry[];
  clearTimeTargetCount: number;
  clearAllTargetCount: number;
  onGenerateDraft: () => ScheduleAgentSuggestion[];
  onApplyDraft: () => Promise<void>;
  onDiscardDraft: () => void;
  onClearTimes: () => void;
  onClearTimesAndAssignees: () => void;
  onUndo: () => Promise<void>;
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
const SCHEDULE_TIMELINE_LANE_HEIGHT = 34;
const READABLE_TASK_DURATION_MINUTES = 120;
const SCHEDULE_DAY_START_MINUTES = 8 * 60;
const SCHEDULE_DAY_END_MINUTES = 17 * 60;
const SCHEDULE_TASK_GAP_MINUTES = 15;
const STAFF_LUNCH_WINDOWS = [
  { label: '12:00-13:00', start: 12 * 60, end: 13 * 60 },
  { label: '11:00-12:00', start: 11 * 60, end: 12 * 60 },
  { label: '13:00-14:00', start: 13 * 60, end: 14 * 60 },
] as const;
type StaffLunchWindow = (typeof STAFF_LUNCH_WINDOWS)[number];

interface UserDayTimelineModel {
  laneByTaskId: Map<string, number>;
  laneCount: number;
  rowMinHeight: number;
}

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

function timeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, Math.round(totalMinutes / 15) * 15));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function taskDurationMinutes(task: Task): number {
  const raw = Number(task.estimatedMinutes || 60);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(480, Math.max(15, Math.ceil(raw / 15) * 15));
}

function intervalOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function reservationStatusBlocksOps(status: string | null | undefined): boolean {
  return ['confirmed', 'checked_in', 'reserved', 'booked'].includes(textValue(status).toLowerCase());
}

function reservationOccupiesDay(reservation: ScheduleReservation, day: string): boolean {
  if (!reservationStatusBlocksOps(reservation.status)) return false;
  if (!reservation.checkInDate || !reservation.checkOutDate || !day) return false;
  return reservation.checkInDate <= day && day < reservation.checkOutDate;
}

function isGuestUrgentTask(task: Task): boolean {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const guestLinked = Boolean(task.reservationId)
    || ['reported_issue', 'inbox_ai', 'reservation_trigger', 'guesty'].includes(task.source)
    || taskRiskFlags(task).some((flag) => /guest|reservation|access|blocked/i.test(flag))
    || /guest|client|arrival|blocked|leak|no water|no power|lock|access/.test(text);
  return guestLinked && (task.priority === 'urgent' || task.priority === 'high');
}

function propertyOccupiedOnDate(propertyCode: string | null | undefined, day: string, reservations: ScheduleReservation[]): ScheduleReservation | null {
  const code = normalizeScheduleProperty(propertyCode || '');
  if (!code || code === 'No property') return null;
  return reservations.find((reservation) =>
    normalizeScheduleProperty(reservation.propertyCode) === code && reservationOccupiesDay(reservation, day),
  ) || null;
}

function taskFitsOccupancyPolicy(task: Task, day: string, reservations: ScheduleReservation[]): boolean {
  const occupied = propertyOccupiedOnDate(task.propertyCode, day, reservations);
  return !occupied || isGuestUrgentTask(task);
}

function formatMinorAmount(minor: number | null | undefined, currencyCode?: string | null): string | null {
  if (minor == null || !Number.isFinite(Number(minor))) return null;
  const currency = currencyCode || 'MUR';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}

function reservationPricingSummary(reservation: ScheduleReservation): string | null {
  const pricing = reservation.calendarPricing;
  if (!pricing) return null;
  const total = formatMinorAmount(pricing.totalMinor, pricing.currencyCode);
  const min = formatMinorAmount(pricing.minPriceMinor, pricing.currencyCode);
  const max = formatMinorAmount(pricing.maxPriceMinor, pricing.currencyCode);
  const nightly = min && max && min !== max ? `${min}-${max}/night` : (min || max ? `${min || max}/night` : null);
  return [total ? `${total} stay` : null, nightly, pricing.syncedAt ? `synced ${pricing.syncedAt.slice(0, 10)}` : null]
    .filter(Boolean)
    .join(', ') || null;
}

function reservationOverlayNoteForTask(task: Task, day: string, reservations: ScheduleReservation[]): string | null {
  const code = normalizeScheduleProperty(task.propertyCode || taskPropertyLabel(task));
  if (!code || code === 'No property') return null;
  const matching = reservations.filter((reservation) => (
    normalizeScheduleProperty(reservation.propertyCode) === code && reservationOverlapsDay(reservation, day)
  ));
  if (matching.length === 0) return null;
  const occupied = matching.find((reservation) => reservationOccupiesDay(reservation, day)) || null;
  const priced = matching.find((reservation) => reservationPricingSummary(reservation)) || null;
  const priceSummary = priced ? reservationPricingSummary(priced) : null;
  if (occupied && priceSummary) return `Reservation/price overlay: ${occupied.guestName} in-house; ${priceSummary}.`;
  if (occupied) return `Reservation overlay: ${occupied.guestName} in-house; price cache not loaded.`;
  if (priceSummary) return `Calendar price cache visible: ${priceSummary}.`;
  return null;
}

function opsPolicyForUser(user: OperationsStaffUser) {
  return OPS_STAFF_POLICY.find((item) =>
    item.id === user.id || item.fullName.toLowerCase() === textValue(user.name).toLowerCase(),
  );
}

function taskSkillScore(task: Task, user: OperationsStaffUser): number {
  const role = `${user.role || ''} ${user.department || ''}`.toLowerCase();
  const policy = opsPolicyForUser(user);
  const policyRoles = [
    ...(policy?.primaryRoles || []),
    ...(policy?.backupRoles || []),
  ].join(' ').toLowerCase();
  const avoidRoles = (policy?.avoidRoles || []).join(' ').toLowerCase();
  const text = `${task.department} ${task.subdepartment || ''} ${task.title} ${task.description || ''}`.toLowerCase();
  let score = 0;

  if (/maintenance|repair|fix|aircon|a\/c|\bac\b|plumb|leak|lock|electrical|wifi/.test(text)) {
    if (/maintenance|quick_maintenance_reset|electrical|plumb|lockbox/.test(policyRoles)) score += 30;
    if (/director|escalations|west_backup|procurement_with_car/.test(policyRoles)) score += 10;
    if (/maintenance|ops|field/.test(role)) score += 10;
    if (/maintenance|field_work|routine_field_work/.test(avoidRoles)) score -= 25;
  }

  if (/clean|inspection|post-clean|arrival|turnover|amenit|welcome/.test(text)) {
    if (/cleaning|inspection|amenities_report|aesthetic_check|home_buildout/.test(policyRoles)) score += 24;
    if (/field/.test(role)) score += 8;
    if (/field_cleaning|field_work|routine_field_work/.test(avoidRoles)) score -= 18;
  }

  if (/owner|approval|admin|guest|reservation|message|follow/.test(text)) {
    if (/ops_manager|owner_comms|guest_services|reservations|admin_follow_up/.test(policyRoles)) score += 22;
    if (/director|escalations/.test(policyRoles)) score += 8;
  }

  if (/field|clean|ops|maintenance/.test(role)) score += 5;
  return score;
}

function isOfficeRosterStaff(user: OperationsStaffUser): boolean {
  const policy = opsPolicyForUser(user);
  const roles = [
    user.role || '',
    user.department || '',
    ...(policy?.primaryRoles || []),
  ].join(' ').toLowerCase();
  return /admin|guest_services|reservations|marketing|owner_comms|ops_manager|director|night_shift/.test(roles)
    && !/field|cleaning|maintenance/.test(roles);
}

function buildLunchPreferences(staff: OperationsStaffUser[]): Map<string, StaffLunchWindow> {
  const officeStaff = staff
    .filter(isOfficeRosterStaff)
    .sort((a, b) => compareText(a.name, b.name));
  const officeLunchById = new Map<string, StaffLunchWindow>();
  officeStaff.forEach((user, index) => {
    officeLunchById.set(user.id, STAFF_LUNCH_WINDOWS[index % STAFF_LUNCH_WINDOWS.length]);
  });
  return new Map(staff.map((user) => [user.id, officeLunchById.get(user.id) || STAFF_LUNCH_WINDOWS[0]]));
}

function chooseLunchWindow(
  intervals: Array<{ start: number; end: number }>,
  preferredWindow: StaffLunchWindow,
): StaffLunchWindow | null {
  const ordered = [
    preferredWindow,
    ...STAFF_LUNCH_WINDOWS.filter((window) => window.label !== preferredWindow.label),
  ];
  return ordered.find((window) =>
    intervals.every((interval) => !intervalOverlaps(interval.start, interval.end, window.start, window.end)),
  ) || null;
}

function nextAvailableStart(
  intervals: Array<{ start: number; end: number }>,
  earliestStart: number,
  duration: number,
  preferredLunchWindow: StaffLunchWindow,
): number | null {
  let cursor = Math.max(SCHEDULE_DAY_START_MINUTES, earliestStart);
  const lunch = chooseLunchWindow(intervals, preferredLunchWindow);
  if (!lunch) return null;
  while (cursor + duration <= SCHEDULE_DAY_END_MINUTES) {
    const end = cursor + duration;
    const hitsTask = intervals.some((interval) => intervalOverlaps(cursor, end, interval.start, interval.end));
    const hitsLunch = intervalOverlaps(cursor, end, lunch.start, lunch.end);
    if (!hitsTask && !hitsLunch) return cursor;
    cursor += 15;
  }
  return null;
}

function staffDisplayName(staffOptions: OperationsStaffUser[], id: string): string {
  return staffOptions.find((user) => user.id === id)?.name || TASK_USER_BY_ID[id]?.name || 'Assigned staff';
}

function visualTaskDurationMinutes(task: Task, scale: ScheduleTimelineScale): number {
  return scale === 'readable' ? READABLE_TASK_DURATION_MINUTES : taskDurationMinutes(task);
}

function buildUserDayTimelineModel(tasks: Task[], scale: ScheduleTimelineScale): UserDayTimelineModel {
  const laneByTaskId = new Map<string, number>();
  const allDayTasks = tasks
    .filter((task) => timeToMinutes(task.dueTime) == null)
    .sort((a, b) => compareText(taskTimeSortKey(a), taskTimeSortKey(b)));
  allDayTasks.forEach((task, index) => laneByTaskId.set(task.id, index));

  const laneEnds: number[] = [];
  tasks
    .map((task) => ({ task, start: timeToMinutes(task.dueTime) }))
    .filter((item): item is { task: Task; start: number } => item.start != null)
    .sort((a, b) => (
      a.start - b.start ||
      PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority] ||
      compareText(taskTitle(a.task), taskTitle(b.task))
    ))
    .forEach(({ task, start }) => {
      const end = start + visualTaskDurationMinutes(task, scale);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      laneByTaskId.set(task.id, lane);
    });

  const laneCount = Math.max(1, allDayTasks.length, laneEnds.length);
  return {
    laneByTaskId,
    laneCount,
    rowMinHeight: Math.max(58, laneCount * SCHEDULE_TIMELINE_LANE_HEIGHT + 8),
  };
}

function taskOffsetPctInBucket(task: Task, bucket: ScheduleTimeBucket): number {
  if (bucket.startHour == null || bucket.endHour == null) return 0;
  const start = timeToMinutes(task.dueTime);
  if (start == null) return 0;
  const bucketStart = bucket.startHour * 60;
  const bucketMinutes = Math.max(1, (bucket.endHour - bucket.startHour) * 60);
  return Math.max(0, Math.min(100, ((start - bucketStart) / bucketMinutes) * 100));
}

function taskWidthPctInBucket(task: Task, bucket: ScheduleTimeBucket, scale: ScheduleTimelineScale): number {
  if (bucket.startHour == null || bucket.endHour == null) return 100;
  const bucketMinutes = Math.max(1, (bucket.endHour - bucket.startHour) * 60);
  return (visualTaskDurationMinutes(task, scale) / bucketMinutes) * 100;
}

function userDayTaskSlotStyle(
  task: Task,
  bucket: ScheduleTimeBucket,
  scale: ScheduleTimelineScale,
  timeline: UserDayTimelineModel,
): CSSProperties {
  const lane = timeline.laneByTaskId.get(task.id) || 0;
  const top = 4 + lane * SCHEDULE_TIMELINE_LANE_HEIGHT;
  if (bucket.startHour == null || bucket.endHour == null || !task.dueTime) {
    return {
      top,
      left: 4,
      width: 'calc(100% - 8px)',
    };
  }
  return {
    top,
    left: `calc(${taskOffsetPctInBucket(task, bucket)}% + 2px)`,
    width: `calc(${taskWidthPctInBucket(task, bucket, scale)}% - 4px)`,
  };
}

function buildScheduleAgentPlan(input: {
  selectedDate: string;
  scheduledTasks: Task[];
  unscheduledTasks: Task[];
  staffOptions: OperationsStaffUser[];
  reservations: ScheduleReservation[];
}): ScheduleAgentSuggestion[] {
  const assignable = input.staffOptions.filter((user) => user.canAssign);
  if (assignable.length === 0) return [];
  const staffLoad = new Map(assignable.map((user) => [user.id, 0]));
  const staffTaskCount = new Map(assignable.map((user) => [user.id, 0]));
  const staffIntervals = new Map(assignable.map((user) => [user.id, [] as Array<{ start: number; end: number }>]));
  const staffLunchPreferences = buildLunchPreferences(assignable);
  for (const task of input.scheduledTasks) {
    const duration = taskDurationMinutes(task);
    const start = task.dueDate === input.selectedDate ? timeToMinutes(task.dueTime) : null;
    for (const id of task.assigneeIds) {
      staffLoad.set(id, (staffLoad.get(id) || 0) + duration);
      staffTaskCount.set(id, (staffTaskCount.get(id) || 0) + 1);
      if (start != null && staffIntervals.has(id)) {
        staffIntervals.get(id)?.push({ start, end: start + duration });
      }
    }
  }

  const candidates = mergeTaskSlices(
    input.scheduledTasks.filter((task) => (
      task.dueDate === input.selectedDate
      && OPEN_SCHEDULE_STATUSES.includes(task.status)
      && (!task.dueTime || task.assigneeIds.length === 0)
    )),
    input.unscheduledTasks.filter((task) => OPEN_SCHEDULE_STATUSES.includes(task.status)),
  )
    .filter((task) => !CLOSED_STATUS.has(task.status))
    .filter((task) => taskFitsOccupancyPolicy(task, input.selectedDate, input.reservations))
    .sort((a, b) => (
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      compareText(taskPropertyLabel(a), taskPropertyLabel(b)) ||
      compareText(taskTitle(a), taskTitle(b))
    ));

  return candidates.flatMap((task) => {
    const duration = taskDurationMinutes(task);
    const existingPrimaryId = task.assigneeIds.find((id) => staffIntervals.has(id)) || task.assigneeIds[0] || null;
    const existingIntervals = existingPrimaryId ? (staffIntervals.get(existingPrimaryId) || []) : [];
    const existingLunchWindow = existingPrimaryId ? staffLunchPreferences.get(existingPrimaryId) || STAFF_LUNCH_WINDOWS[0] : STAFF_LUNCH_WINDOWS[0];
    const existingRequestedStart = timeToMinutes(task.dueTime);
    const existingLunch = chooseLunchWindow(existingIntervals, existingLunchWindow);
    const existingCanKeepRequestedStart = existingPrimaryId && existingRequestedStart != null
      && existingRequestedStart >= SCHEDULE_DAY_START_MINUTES
      && existingRequestedStart + duration <= SCHEDULE_DAY_END_MINUTES
      && existingLunch
      && !existingIntervals.some((interval) => intervalOverlaps(existingRequestedStart, existingRequestedStart + duration, interval.start, interval.end))
      && !intervalOverlaps(existingRequestedStart, existingRequestedStart + duration, existingLunch.start, existingLunch.end);
    const existingEarliest = existingIntervals.length > 0
      ? Math.max(...existingIntervals.map((item) => item.end + SCHEDULE_TASK_GAP_MINUTES))
      : SCHEDULE_DAY_START_MINUTES;
    const existingStart = existingPrimaryId
      ? existingCanKeepRequestedStart
        ? existingRequestedStart
        : nextAvailableStart(existingIntervals, existingEarliest, duration, existingLunchWindow)
      : null;

    const bestCandidate = task.assigneeIds.length > 0 && existingPrimaryId && existingStart != null
      ? {
        id: existingPrimaryId,
        start: existingStart,
        lunchWindow: existingLunchWindow,
        rank: 999,
      }
      : assignable
        .map((user) => {
          const intervals = staffIntervals.get(user.id) || [];
          const lunchWindow = staffLunchPreferences.get(user.id) || STAFF_LUNCH_WINDOWS[0];
          const requestedStart = timeToMinutes(task.dueTime);
          const lunch = chooseLunchWindow(intervals, lunchWindow);
          const canKeepRequestedStart = requestedStart != null
            && requestedStart >= SCHEDULE_DAY_START_MINUTES
            && requestedStart + duration <= SCHEDULE_DAY_END_MINUTES
            && lunch
            && !intervals.some((interval) => intervalOverlaps(requestedStart, requestedStart + duration, interval.start, interval.end))
            && !intervalOverlaps(requestedStart, requestedStart + duration, lunch.start, lunch.end);
          const earliest = intervals.length > 0 ? Math.max(...intervals.map((item) => item.end + SCHEDULE_TASK_GAP_MINUTES)) : SCHEDULE_DAY_START_MINUTES;
          const start = canKeepRequestedStart
            ? requestedStart
            : nextAvailableStart(intervals, earliest, duration, lunchWindow);
          const load = staffLoad.get(user.id) || 0;
          const count = staffTaskCount.get(user.id) || 0;
          return {
            id: user.id,
            start,
            lunchWindow,
            rank: taskSkillScore(task, user) - (load / 45) - (count * 4),
            load,
            count,
          };
        })
        .filter((item): item is {
          id: string;
          start: number;
          lunchWindow: StaffLunchWindow;
          rank: number;
          load: number;
          count: number;
        } => item.start != null)
        .sort((a, b) => (
          b.rank - a.rank ||
          a.load - b.load ||
          a.count - b.count ||
          compareText(staffDisplayName(input.staffOptions, a.id), staffDisplayName(input.staffOptions, b.id))
        ))[0] || null;

    if (!bestCandidate) return [];
    const chosenAssignees = task.assigneeIds.length > 0 ? task.assigneeIds : [bestCandidate.id];
    const primaryAssigneeId = bestCandidate.id;
    const intervals = staffIntervals.get(primaryAssigneeId) || [];
    const lunchWindow = bestCandidate.lunchWindow;
    const start = bestCandidate.start;
    if (start == null) return [];
    chosenAssignees.forEach((id) => {
      staffLoad.set(id, (staffLoad.get(id) || 0) + duration);
      staffTaskCount.set(id, (staffTaskCount.get(id) || 0) + 1);
    });
    intervals.push({ start, end: start + duration });
    const occupied = propertyOccupiedOnDate(task.propertyCode, input.selectedDate, input.reservations);
    const overlayNote = reservationOverlayNoteForTask(task, input.selectedDate, input.reservations);
    return [{
      taskId: task.id,
      title: taskTitle(task),
      propertyCode: task.propertyCode || 'No property',
      dueDate: input.selectedDate,
      dueTime: minutesToTime(start),
      assigneeIds: chosenAssignees,
      reason: [
        task.dueDate
          ? task.dueTime
            ? 'Already timed on the selected day; assigning feasible staff.'
            : 'No exact time on the selected day.'
          : 'Unscheduled open work pulled into the selected day.',
        chosenAssignees.length > 0 ? `Assigned to ${chosenAssignees.map((id) => staffDisplayName(input.staffOptions, id)).join(', ')}.` : 'No eligible staff loaded.',
        `Lunch protected outside the task window (${lunchWindow.label} preferred).`,
        occupied ? `Allowed during occupancy because this is urgent guest-linked work for ${occupied.guestName}.` : null,
        overlayNote,
      ].filter(Boolean).join(' '),
    }];
  });
}

function taskNeedsSchedulePlanning(task: Task, selectedDate: string): boolean {
  if (!OPEN_SCHEDULE_STATUSES.includes(task.status)) return false;
  if (!task.dueDate) return true;
  return task.dueDate === selectedDate && (!task.dueTime || task.assigneeIds.length === 0);
}

function auditScheduleAgentPlan(input: {
  selectedDate: string;
  scheduledTasks: Task[];
  unscheduledTasks: Task[];
  reservations: ScheduleReservation[];
  agentPlan: ScheduleAgentSuggestion[];
}): SchedulePlanAudit {
  const planByTaskId = new Map(input.agentPlan.map((item) => [item.taskId, item]));
  const targetTasks = mergeTaskSlices(input.scheduledTasks, input.unscheduledTasks)
    .filter((task) => taskNeedsSchedulePlanning(task, input.selectedDate));
  const occupancyBlockedTasks = targetTasks
    .filter((task) => !taskFitsOccupancyPolicy(task, input.selectedDate, input.reservations));
  const occupancyBlockedIds = new Set(occupancyBlockedTasks.map((task) => task.id));
  const unplannedTasks = targetTasks
    .filter((task) => !occupancyBlockedIds.has(task.id))
    .filter((task) => !planByTaskId.has(task.id));
  const unassignedAfterApplyTasks = targetTasks
    .filter((task) => {
      const plan = planByTaskId.get(task.id);
      const plannedAssignees = plan?.assigneeIds || [];
      return task.assigneeIds.length === 0 && plannedAssignees.length === 0;
    });
  const untimedAfterApplyTasks = targetTasks
    .filter((task) => {
      const plan = planByTaskId.get(task.id);
      return !task.dueTime && !plan?.dueTime;
    });
  return {
    targetTasks,
    unplannedTasks,
    occupancyBlockedTasks,
    unassignedAfterApplyTasks,
    untimedAfterApplyTasks,
  };
}

function summarizeTaskList(tasks: Task[], limit = 3): string {
  const labels = tasks.slice(0, limit).map((task) => `${taskTitle(task)} (${taskPropertyLabel(task)})`);
  const extra = tasks.length > limit ? ` +${tasks.length - limit} more` : '';
  return `${labels.join(', ')}${extra}`;
}

function buildScheduleUndoEntry(label: string, tasks: Task[]): ScheduleUndoEntry | null {
  const seen = new Set<string>();
  const states = tasks
    .filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    })
    .map((task) => ({
      taskId: task.id,
      title: taskTitle(task),
      dueDate: task.dueDate || '',
      dueTime: task.dueTime || '',
      assigneeIds: [...task.assigneeIds],
      status: task.status,
    }));

  if (states.length === 0) return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    tasks: states,
  };
}

function OpsFridayConsultPanel({
  selectedDate,
  rangeStart,
  rangeEnd,
  plannerMode,
  timelineScale,
  scheduledTasks,
  unscheduledTasks,
  staffOptions,
  reservations,
  agentPlan,
  agentApplying,
  bulkApplying,
  undoApplying,
  undoStack,
  clearTimeTargetCount,
  clearAllTargetCount,
  onGenerateDraft,
  onApplyDraft,
  onDiscardDraft,
  onClearTimes,
  onClearTimesAndAssignees,
  onUndo,
}: OpsFridayConsultPanelProps) {
  const [messages, setMessages] = useState<OpsConsultMessage[]>([
    {
      id: 'welcome',
      role: 'friday',
      text: 'I can help draft this schedule, explain roster constraints, clear or undo schedule moves, and flag owner-approval risks before work is assigned.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const appendMessage = (message: Omit<OpsConsultMessage, 'id'>) => {
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
  };

  const appendFriday = (text: string, extra?: Partial<OpsConsultMessage>) => {
    appendMessage({ role: 'friday', text, ...extra });
  };

  const runLocalAction = async (type: OperationsConsultActionSuggestion['type']) => {
    if (type === 'draft_schedule') {
      const next = onGenerateDraft();
      appendFriday(
        next.length > 0
          ? `Drafted ${next.length} schedule move${next.length === 1 ? '' : 's'} for ${formatShortDate(selectedDate)}. Review the rows below, then apply when ready.`
          : 'I did not find any visible no-time or unscheduled tasks that fit the current staff, occupancy, and lunch constraints.',
      );
      return;
    }

    if (type === 'apply_schedule_draft') {
      if (agentPlan.length === 0) {
        appendFriday('There is no visible schedule draft to apply yet.');
        return;
      }
      await onApplyDraft();
      appendFriday(`Applied the visible draft. Undo is available if the result needs to be reverted.`);
      return;
    }

    if (type === 'clear_schedule_times') {
      if (clearTimeTargetCount === 0) {
        appendFriday('No visible scheduled tasks currently have exact times to clear.');
        return;
      }
      onClearTimes();
      appendFriday(`Clearing exact times for ${clearTimeTargetCount} visible task${clearTimeTargetCount === 1 ? '' : 's'}.`);
      return;
    }

    if (type === 'clear_times_and_assignees') {
      if (clearAllTargetCount === 0) {
        appendFriday('No visible scheduled tasks currently have exact times or assignees to clear.');
        return;
      }
      onClearTimesAndAssignees();
      appendFriday(`Clearing exact times and assignees for ${clearAllTargetCount} visible task${clearAllTargetCount === 1 ? '' : 's'}.`);
      return;
    }

    if (type === 'undo_last_schedule_step') {
      if (undoStack.length === 0) {
        appendFriday('There is no reversible schedule step in this session yet.');
        return;
      }
      await onUndo();
      appendFriday('Undid the latest reversible schedule step.');
      return;
    }

    const prompt = type === 'request_owner_approval'
      ? 'Draft the owner approval step needed for the selected Operations issue. Include the approval threshold logic and what evidence we need.'
      : 'Draft the task we should create from the current Operations context, but do not create it yet.';
    await submitConsultPrompt(prompt);
  };

  const submitConsultPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || loading) return;
    const history = messages
      .filter((message) => message.id !== 'welcome')
      .slice(-8)
      .map(({ role, text: messageText }) => ({ role, text: messageText }));

    appendMessage({ role: 'user', text });
    setLoading(true);
    try {
      const response = await sendOperationsConsultMessage({
        text,
        context: 'schedule',
        selectedDate,
        rangeStart,
        rangeEnd,
        plannerMode,
        timelineScale,
        scheduledTasks,
        unscheduledTasks,
        staff: staffOptions,
        reservations,
        currentPlan: agentPlan as OperationsConsultPlanItem[],
        history,
        notes: [
          `${clearTimeTargetCount} visible tasks have exact times.`,
          `${clearAllTargetCount} visible tasks have exact times or assignees.`,
          `Assignable staff loaded: ${staffOptions.filter((user) => user.canAssign).map((user) => user.name).join(', ') || 'none'}.`,
          `${scheduledTasks.concat(unscheduledTasks).filter((task) => OPEN_SCHEDULE_STATUSES.includes(task.status) && task.assigneeIds.length === 0).length} visible open tasks are currently unassigned.`,
          `${reservations.filter((reservation) => reservation.calendarPricing).length} reservation overlays include cached calendar pricing; missing pricing means availability/price is not proved.`,
          undoStack.length > 0 ? `Last reversible step: ${undoStack[undoStack.length - 1]?.label}` : 'No reversible schedule step yet.',
        ].join(' '),
      });
      appendFriday(response.response, {
        actions: response.action_suggestions || [],
        meta: response.metadata?.tokenEstimate ? `KB context ~${response.metadata.tokenEstimate.toLocaleString()} tokens` : undefined,
      });
    } catch (e) {
      appendFriday(e instanceof Error ? e.message : 'Friday Consult could not read the Operations context.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    setInput('');
    void submitConsultPrompt(text);
  };

  const disabled = loading || agentApplying || bulkApplying || undoApplying;
  const quickActions: Array<{
    type: OperationsConsultActionSuggestion['type'];
    label: string;
    disabled?: boolean;
    title?: string;
  }> = [
    { type: 'draft_schedule', label: 'Draft schedule' },
    { type: 'apply_schedule_draft', label: 'Apply draft', disabled: agentPlan.length === 0 || agentApplying },
    { type: 'clear_schedule_times', label: 'Clear times', disabled: clearTimeTargetCount === 0 || bulkApplying },
    { type: 'clear_times_and_assignees', label: 'Clear + assignees', disabled: clearAllTargetCount === 0 || bulkApplying },
    { type: 'undo_last_schedule_step', label: 'Undo', disabled: undoStack.length === 0 || undoApplying },
    { type: 'request_owner_approval', label: 'Owner approval' },
  ];

  return (
    <section className="ops-consult-panel" aria-label="Friday Consult for Operations">
      <div className="ops-consult-head">
        <div>
          <div className="ops-mobile-kicker">Friday Consult</div>
          <h3>Ops schedule + roster agent</h3>
          <small>{plannerMode === 'user_day' ? formatScheduleDate(selectedDate) : formatScheduleRange(rangeStart, rangeEnd)}</small>
        </div>
        <span>
          <IconSparkle size={13} />
          {agentPlan.length > 0 ? `${agentPlan.length} moves drafted` : 'Knowledge loaded'}
        </span>
      </div>

      <div className="ops-consult-actions" aria-label="Friday Consult quick actions">
        {quickActions.map((action) => (
          <button
            key={action.type}
            className="btn ghost sm"
            type="button"
            disabled={disabled || action.disabled}
            onClick={() => void runLocalAction(action.type)}
            title={action.title}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="ops-consult-thread" aria-live="polite">
        {messages.map((message) => (
          <div className={`ops-consult-message ${message.role}`} key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'Friday Consult'}</strong>
            <p>{message.text}</p>
            {message.meta && <small>{message.meta}</small>}
            {message.actions && message.actions.length > 0 && (
              <div className="ops-consult-action-suggestions">
                {message.actions.map((action) => (
                  <button
                    key={`${message.id}-${action.type}-${action.label}`}
                    className="btn secondary sm"
                    type="button"
                    disabled={disabled}
                    onClick={() => void runLocalAction(action.type)}
                    title={action.reason || undefined}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {agentPlan.length > 0 && (
          <div className="ops-consult-draft">
            {agentPlan.map((item) => (
              <div className="ops-schedule-backlog-row" key={item.taskId}>
                <span>
                  <strong>{item.dueTime} · {item.title}</strong>
                  <small>{item.propertyCode} · {item.reason}</small>
                </span>
                <span>
                  {item.assigneeIds.length > 0
                    ? item.assigneeIds.map((id) => staffDisplayName(staffOptions, id)).join(', ')
                    : 'unassigned'}
                </span>
              </div>
            ))}
            <button className="btn ghost sm" type="button" disabled={agentApplying} onClick={onDiscardDraft}>
              Discard draft
            </button>
          </div>
        )}
      </div>

      <form className="ops-consult-compose" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Talk to Friday Consult about this schedule, roster, task timing, owner approval, or what to move next..."
          rows={2}
        />
        <button className="btn primary sm" type="submit" disabled={loading || !input.trim()}>
          <IconSend size={12} />
          {loading ? 'Reading...' : 'Send'}
        </button>
      </form>

      {undoStack.length > 0 && (
        <div className="ops-schedule-undo-note">
          Last reversible step: {undoStack[undoStack.length - 1]?.label} · {undoStack[undoStack.length - 1]?.tasks.length} task{undoStack[undoStack.length - 1]?.tasks.length === 1 ? '' : 's'}
        </div>
      )}
    </section>
  );
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
  const [timelineScale, setTimelineScale] = useState<ScheduleTimelineScale>('readable');
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
  const [agentPlan, setAgentPlan] = useState<ScheduleAgentSuggestion[]>([]);
  const [agentApplying, setAgentApplying] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [undoApplying, setUndoApplying] = useState(false);
  const [undoStack, setUndoStack] = useState<ScheduleUndoEntry[]>([]);
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
  }, [rangeEnd, rangeStart]);

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
  const plannerLunchPreferences = useMemo(
    () => buildLunchPreferences(staffOptions.filter((user) => user.canAssign)),
    [staffOptions],
  );

  const allKnownTasks = useMemo(
    () => mergeTaskSlices(rawScheduleTasks, unscheduledPage.tasks),
    [rawScheduleTasks, unscheduledPage.tasks],
  );

  const visibleOpenScheduleTasks = useMemo(() => (
    rawScheduleTasks.filter((task) => (
      Boolean(task.dueDate) &&
      visibleDays.includes(task.dueDate) &&
      OPEN_SCHEDULE_STATUSES.includes(task.status)
    ))
  ), [rawScheduleTasks, visibleDays]);

  const clearTimeTargets = useMemo(
    () => visibleOpenScheduleTasks.filter((task) => Boolean(task.dueTime)),
    [visibleOpenScheduleTasks],
  );

  const clearAllTargets = useMemo(
    () => visibleOpenScheduleTasks.filter((task) => Boolean(task.dueTime) || task.assigneeIds.length > 0),
    [visibleOpenScheduleTasks],
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

  const pushUndoSnapshot = (label: string, tasks: Task[]) => {
    const entry = buildScheduleUndoEntry(label, tasks);
    if (!entry) return;
    setUndoStack((stack) => [...stack.slice(-9), entry]);
  };

  const restoreLastScheduleSnapshot = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry || undoApplying) return;
    setUndoApplying(true);
    try {
      for (const state of entry.tasks) {
        await updateTask({
          taskId: state.taskId,
          patch: {
            dueDate: state.dueDate,
            dueTime: state.dueTime,
            assigneeIds: state.assigneeIds,
            status: state.status,
          },
          actorId: currentUserId,
        });
      }
      setUndoStack((stack) => stack.slice(0, -1));
      fireToast(`Undid ${entry.label}`);
      taskPage.refetch();
      unscheduledPage.refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Undo failed');
    } finally {
      setUndoApplying(false);
    }
  };

  const patchTask = async (
    task: Task,
    patch: Parameters<typeof updateTask>[0]['patch'],
    success: string,
    undoLabel = 'task edit',
  ) => {
    setSavingTaskId(task.id);
    try {
      await updateTask({ taskId: task.id, patch, actorId: currentUserId });
      pushUndoSnapshot(undoLabel, [task]);
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
    const occupied = propertyOccupiedOnDate(task.propertyCode, selectedDate, reservations);
    if (occupied && !isGuestUrgentTask(task)) {
      fireToast(`${taskPropertyLabel(task)} is occupied by ${occupied.guestName}; schedule non-urgent work after checkout.`);
      return;
    }
    const [suggestion] = buildScheduleAgentPlan({
      selectedDate,
      scheduledTasks: rawScheduleTasks,
      unscheduledTasks: [task],
      staffOptions,
      reservations,
    }).filter((item) => item.taskId === task.id);
    if (staffOptions.some((user) => user.canAssign) && (!suggestion || suggestion.assigneeIds.length === 0)) {
      fireToast(`Friday Consult could not assign ${taskTitle(task)} safely. Open the task and choose a staff member first.`);
      return;
    }
    void patchTask(
      task,
      {
        dueDate: selectedDate,
        dueTime: suggestion?.dueTime || task.dueTime || '',
        assigneeIds: suggestion?.assigneeIds.length ? suggestion.assigneeIds : task.assigneeIds,
        status: task.status === 'reported' ? 'scheduled' : task.status,
      },
      'Task added to schedule',
      'add task to schedule',
    );
  };

  const patchForDropTarget = (task: Task, target: PlannerDropTarget): Parameters<typeof updateTask>[0]['patch'] | null => {
    const occupied = propertyOccupiedOnDate(task.propertyCode, target.date, reservations);
    if (occupied && !isGuestUrgentTask(task)) {
      fireToast(`${taskPropertyLabel(task)} is occupied by ${occupied.guestName}; schedule non-urgent work after checkout.`);
      return null;
    }
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
        patch.dueTime = target.dueTime ?? previewTime ?? bucket?.defaultTime ?? '';
      }
      if (target.rowId !== UNASSIGNED_SCHEDULE_ID) {
        const start = timeToMinutes(patch.dueTime);
        const lunchWindow = plannerLunchPreferences.get(target.rowId) || STAFF_LUNCH_WINDOWS[0];
        if (start != null && intervalOverlaps(start, start + taskDurationMinutes(task), lunchWindow.start, lunchWindow.end)) {
          fireToast(`${staffDisplayName(staffOptions, target.rowId)} needs lunch around ${lunchWindow.label}. Move this task outside that hour.`);
          return null;
        }
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
    void patchTask(task, patch, 'Task schedule updated', 'schedule move');
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

  const applyBulkSchedulePatch = async ({
    label,
    tasks,
    patchForTask,
    success,
  }: {
    label: string;
    tasks: Task[];
    patchForTask: (task: Task) => Parameters<typeof updateTask>[0]['patch'];
    success: string;
  }) => {
    if (tasks.length === 0 || bulkApplying) return;
    setBulkApplying(true);
    let updatedCount = 0;
    try {
      for (const task of tasks) {
        await updateTask({
          taskId: task.id,
          patch: patchForTask(task),
          actorId: currentUserId,
        });
        updatedCount += 1;
      }
      if (updatedCount > 0) {
        pushUndoSnapshot(label, tasks.slice(0, updatedCount));
        fireToast(success);
        taskPage.refetch();
        unscheduledPage.refetch();
      }
    } catch (e) {
      if (updatedCount > 0) pushUndoSnapshot(label, tasks.slice(0, updatedCount));
      fireToast(e instanceof Error ? e.message : `${label} failed`);
      taskPage.refetch();
      unscheduledPage.refetch();
    } finally {
      setBulkApplying(false);
    }
  };

  const clearVisibleScheduleTimes = () => {
    void applyBulkSchedulePatch({
      label: 'clear schedule times',
      tasks: clearTimeTargets,
      patchForTask: () => ({ dueTime: '' }),
      success: `Cleared times for ${clearTimeTargets.length} task${clearTimeTargets.length === 1 ? '' : 's'}`,
    });
  };

  const clearVisibleScheduleTimesAndAssignees = () => {
    void applyBulkSchedulePatch({
      label: 'clear times and assignees',
      tasks: clearAllTargets,
      patchForTask: () => ({ dueTime: '', assigneeIds: [] }),
      success: `Cleared times and assignees for ${clearAllTargets.length} task${clearAllTargets.length === 1 ? '' : 's'}`,
    });
  };

  const generateAgentPlan = (): ScheduleAgentSuggestion[] => {
    const next = buildScheduleAgentPlan({
      selectedDate,
      scheduledTasks: rawScheduleTasks,
      unscheduledTasks,
      staffOptions,
      reservations,
    });
    const audit = auditScheduleAgentPlan({
      selectedDate,
      scheduledTasks: rawScheduleTasks,
      unscheduledTasks,
      reservations,
      agentPlan: next,
    });
    const selectedDayUnplanned = audit.unplannedTasks.filter((task) => task.dueDate === selectedDate);
    const selectedDayBlocked = audit.occupancyBlockedTasks.filter((task) => task.dueDate === selectedDate);
    const reviewCount = selectedDayUnplanned.length + selectedDayBlocked.length;
    setAgentPlan(next);
    fireToast(next.length > 0
      ? reviewCount > 0
        ? `Friday Consult drafted ${next.length} move${next.length === 1 ? '' : 's'}; ${reviewCount} scheduled task${reviewCount === 1 ? '' : 's'} still need review.`
        : `Friday Consult drafted ${next.length} move${next.length === 1 ? '' : 's'} with assignments and times.`
      : 'No draftable tasks fit the staff, occupancy, and lunch constraints');
    return next;
  };

  const applyAgentPlan = async () => {
    if (agentPlan.length === 0 || agentApplying) return;
    const plannedTaskIds = new Set(agentPlan.map((item) => item.taskId));
    const audit = auditScheduleAgentPlan({
      selectedDate,
      scheduledTasks: rawScheduleTasks,
      unscheduledTasks,
      reservations,
      agentPlan,
    });
    const unassignedDraft = agentPlan.find((item) => {
      const task = allKnownTasks.find((candidate) => candidate.id === item.taskId);
      return !(task?.assigneeIds.length) && item.assigneeIds.length === 0;
    });
    if (unassignedDraft) {
      fireToast(`Friday Consult draft still has unassigned work: ${unassignedDraft.title}. Load staff or assign it manually first.`);
      return;
    }
    const selectedDayBlocked = audit.occupancyBlockedTasks.filter((task) => task.dueDate === selectedDate);
    if (selectedDayBlocked.length > 0) {
      fireToast(`Move occupied non-urgent work before applying: ${summarizeTaskList(selectedDayBlocked)}.`);
      return;
    }
    const selectedDayUnplanned = audit.unplannedTasks.filter((task) => task.dueDate === selectedDate);
    if (selectedDayUnplanned.length > 0) {
      fireToast(`Friday Consult draft is incomplete for ${summarizeTaskList(selectedDayUnplanned)}.`);
      return;
    }
    const unassignedAfterApply = audit.unassignedAfterApplyTasks
      .filter((task) => task.dueDate === selectedDate || plannedTaskIds.has(task.id));
    if (unassignedAfterApply.length > 0) {
      fireToast(`Friday Consult would leave unassigned work: ${summarizeTaskList(unassignedAfterApply)}.`);
      return;
    }
    const untimedAfterApply = audit.untimedAfterApplyTasks
      .filter((task) => task.dueDate === selectedDate || plannedTaskIds.has(task.id));
    if (untimedAfterApply.length > 0) {
      fireToast(`Friday Consult would leave untimed work: ${summarizeTaskList(untimedAfterApply)}.`);
      return;
    }
    setAgentApplying(true);
    const appliedTasks: Task[] = [];
    try {
      for (const item of agentPlan) {
        const task = allKnownTasks.find((candidate) => candidate.id === item.taskId);
        if (!task) continue;
        await updateTask({
          taskId: task.id,
          patch: {
            dueDate: item.dueDate,
            dueTime: item.dueTime,
            assigneeIds: task.assigneeIds.length > 0 ? task.assigneeIds : item.assigneeIds,
            status: task.status === 'reported' ? 'scheduled' : task.status,
          },
          actorId: currentUserId,
        });
        appliedTasks.push(task);
      }
      if (appliedTasks.length > 0) pushUndoSnapshot('Friday Consult draft apply', appliedTasks);
      fireToast(`Applied ${appliedTasks.length} Friday Consult schedule move${appliedTasks.length === 1 ? '' : 's'}`);
      setAgentPlan([]);
      taskPage.refetch();
      unscheduledPage.refetch();
    } catch (e) {
      if (appliedTasks.length > 0) pushUndoSnapshot('Friday Consult draft apply', appliedTasks);
      fireToast(e instanceof Error ? e.message : 'Friday Consult schedule apply failed');
      taskPage.refetch();
      unscheduledPage.refetch();
    } finally {
      setAgentApplying(false);
    }
  };

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
        {plannerMode === 'user_day' && (
          <div className="ops-schedule-segment compact timeline-scale" role="group" aria-label="User day time scale">
            <button type="button" className={timelineScale === 'readable' ? 'active' : ''} onClick={() => setTimelineScale('readable')}>
              Readable
            </button>
            <button type="button" className={timelineScale === 'actual' ? 'active' : ''} onClick={() => setTimelineScale('actual')}>
              Actual
            </button>
          </div>
        )}
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
      {reservationsError && (
        <div className="ops-schedule-warning">Reservation overlays could not load: {reservationsError}</div>
      )}
      {taskPage.total > taskPage.tasks.length && (
        <div className="ops-schedule-warning">
          Showing {taskPage.tasks.length} of {taskPage.total} scheduled tasks. Narrow the date range or filters to avoid hidden rows.
        </div>
      )}

      <OpsFridayConsultPanel
        selectedDate={selectedDate}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        plannerMode={plannerMode}
        timelineScale={timelineScale}
        scheduledTasks={rawScheduleTasks}
        unscheduledTasks={unscheduledTasks}
        staffOptions={staffOptions}
        reservations={reservations}
        agentPlan={agentPlan}
        agentApplying={agentApplying}
        bulkApplying={bulkApplying}
        undoApplying={undoApplying}
        undoStack={undoStack}
        clearTimeTargetCount={clearTimeTargets.length}
        clearAllTargetCount={clearAllTargets.length}
        onGenerateDraft={generateAgentPlan}
        onApplyDraft={applyAgentPlan}
        onDiscardDraft={() => setAgentPlan([])}
        onClearTimes={clearVisibleScheduleTimes}
        onClearTimesAndAssignees={clearVisibleScheduleTimesAndAssignees}
        onUndo={restoreLastScheduleSnapshot}
      />

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
        loading={taskPage.loading || reservationsLoading}
        savingTaskId={savingTaskId}
        onOpenTask={onOpenTask}
        onEdit={setEditingTaskId}
      />

      {plannerMode === 'user_day' ? (
        <div className="ops-planner-scroll" aria-busy={taskPage.loading || reservationsLoading}>
          <div className="ops-planner-grid user-day" role="grid" aria-label="User day planner">
            <div className="ops-planner-corner" role="columnheader">Users</div>
            {SCHEDULE_TIME_BUCKETS.map((bucket) => (
              <div className="ops-planner-col-head" role="columnheader" key={bucket.id}>
                <strong>{bucket.label}</strong>
                {bucket.subLabel && <small>{bucket.subLabel}</small>}
              </div>
            ))}
            {staffRows.map((row) => {
              const rowTimeline = buildUserDayTimelineModel(row.tasks, timelineScale);
              return (
                <div className="ops-planner-row-fragment" role="row" key={row.id}>
                  <div className="ops-planner-row-head" role="rowheader" style={{ minHeight: rowTimeline.rowMinHeight }}>
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
                        className={'ops-planner-cell timeline' + (cellTasks.length > 0 ? ' has-scheduled' : '') + (showPreview ? ' has-drag-preview' : '')}
                        role="gridcell"
                        key={`${row.id}-${bucket.id}`}
                        style={{ minHeight: rowTimeline.rowMinHeight }}
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
                          const preview = computeBucketDragPreview(bucket, event);
                          handleDrop(event, {
                            mode: 'user_day',
                            rowType: 'staff',
                            rowId: row.id,
                            date: selectedDate,
                            bucketId: bucket.id,
                            dueTime: preview?.time ?? bucket.defaultTime,
                          });
                          setDragPreview(null);
                        }}
                      >
                        {cellTasks.map((task) => (
                          <div
                            className="ops-planner-task-slot"
                            data-scale={timelineScale}
                            key={`${row.id}-${bucket.id}-${task.id}`}
                            style={userDayTaskSlotStyle(task, bucket, timelineScale, rowTimeline)}
                          >
                            <PlannerTaskCard
                              task={task}
                              staffOptions={staffOptions}
                              saving={savingTaskId === task.id}
                              dragEnabled={dragEnabled}
                              onDragStart={handleDragStart}
                              onOpenTask={onOpenTask}
                              onEdit={setEditingTaskId}
                            />
                          </div>
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
              );
            })}
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
                <small>{task.propertyCode || 'No property'} · {taskOriginLabel(task)} · {formatTaskDue(task.dueDate, task.dueTime, task.status)} · {STATUS_LABEL[task.status]}</small>
              </span>
              <span onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost sm" type="button" disabled={savingTaskId === task.id} onClick={() => scheduleToday(task)}>
                  Add to {formatShortDate(selectedDate)}
                </button>
                <button className="btn ghost sm" type="button" disabled={savingTaskId === task.id} onClick={() => setEditingTaskId(task.id)}>
                  Date/time
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
          <small>{taskPropertyLabel(task)} · {taskOriginLabel(task)} · {assignee} · {task.priority}</small>
        </span>
      </button>
      <span className="ops-mobile-schedule-side">
        <em style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</em>
        <button className="btn ghost sm" type="button" disabled={saving} onClick={() => onEdit(task.id)}>
          Date/time
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
            {task.propertyCode || 'No property'} · {taskOriginLabel(task)} · {taskStatusLabel(task.status)} · {task.reservationId ? 'reservation' : task.department}
          </small>
        </span>
        <em style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</em>
      </button>
      <div className="ops-schedule-task-controls compact">
        <span>{selectedAssignee ? staffOptions.find((user) => user.id === selectedAssignee)?.name || 'Assigned' : 'Unassigned'}</span>
        <button className="btn ghost sm" type="button" disabled={saving} onClick={() => onEdit(task.id)}>
          Date/time
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
          const meta = [task.dueTime ? formatTimeLabel(task.dueTime) : null, STATUS_LABEL[task.status], taskOriginLabel(task), assignee].filter(Boolean).join(' · ');
          return (
            <div className="ops-planner-chip-wrap" key={`${dropTarget.rowId}-${dropTarget.date}-${task.id}`}>
              <button
                type="button"
                className="ops-planner-chip"
                data-status={task.status}
                style={{ borderLeftColor: statusSwatch.color }}
                title={`${task.title} · ${task.propertyCode || 'No property'} · ${taskOriginLabel(task)} · ${STATUS_LABEL[task.status]}`}
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
                Date/time
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
        <small>{task.propertyCode || 'No property'} · {taskOriginLabel(task)} · {STATUS_LABEL[task.status]}</small>
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
  onNav,
}: {
  onOpenTask: (id: string) => void;
  onNav?: (s: string) => void;
}) {
  const currentUserId = useCurrentUserId();
  const { role } = usePermissions();
  const isField = role === 'field';
  const { t } = useT();
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
      fireToast(status === 'completed'
        ? t('operations.mine.toastCompleted')
        : t('operations.mine.toastMoved', { status: STATUS_LABEL[status].toLowerCase() }));
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : t('operations.mine.toastFailed'));
    } finally {
      setUpdatingId(null);
    }
  };

  const myTabs: GmTab[] = [
    { l: 'Overview', onClick: () => onNav?.('overview') },
    { l: 'Schedule', onClick: () => onNav?.('schedule') },
    { l: 'My tasks', on: true },
    { l: 'All tasks', onClick: () => onNav?.('all') },
    { l: 'Approvals', onClick: () => onNav?.('approvals') },
    { l: 'Roster', onClick: () => onNav?.('roster') },
  ];
  const inner = (
    <>
      {error && (
        <div className="ops-my-alert">
          {t('operations.mine.loadError', { error })}
        </div>
      )}
      {loading && assignedTasks.length === 0 && <LoadingState label={t('operations.mine.loadingAssigned')} />}

      <div className="ops-my-tabs" role="tablist" aria-label={t('operations.mine.dateRangeAria')}>
        {[
          ['today', t('operations.mine.dateToday')],
          ['tomorrow', t('operations.mine.dateTomorrow')],
          ['week', t('operations.mine.dateWeek')],
          ['all', t('operations.mine.dateAll')],
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
          placeholder={t('operations.mine.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as MyTaskSort)} aria-label={t('operations.mine.sortAria')}>
          <option value="suggested">{t('operations.mine.sortSuggested')}</option>
          <option value="due">{t('operations.mine.sortDue')}</option>
          <option value="priority">{t('operations.mine.sortPriority')}</option>
          <option value="property">{t('operations.mine.sortProperty')}</option>
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value as Department | 'all')} aria-label={t('operations.mine.deptAria')}>
          <option value="all">{t('operations.mine.deptAll')}</option>
          <option value="cleaning">{t('operations.mine.deptCleaning')}</option>
          <option value="inspection">{t('operations.mine.deptInspection')}</option>
          <option value="maintenance">{t('operations.mine.deptMaintenance')}</option>
          <option value="office">{t('operations.mine.deptOffice')}</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | 'all')} aria-label={t('operations.mine.priorityAria')}>
          <option value="all">{t('operations.mine.priorityAll')}</option>
          <option value="urgent">{t('operations.mine.priorityUrgent')}</option>
          <option value="high">{t('operations.mine.priorityHigh')}</option>
          <option value="medium">{t('operations.mine.priorityMedium')}</option>
          <option value="low">{t('operations.mine.priorityLow')}</option>
          <option value="lowest">{t('operations.mine.priorityLowest')}</option>
        </select>
        <select value={reservation} onChange={(e) => setReservation(e.target.value as ReservationFilter)} aria-label={t('operations.mine.reservationAria')}>
          <option value="all">{t('operations.mine.reservationAny')}</option>
          <option value="linked">{t('operations.mine.reservationLinked')}</option>
          <option value="unlinked">{t('operations.mine.reservationUnlinked')}</option>
        </select>
        {dateTab === 'all' && (
          <>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label={t('operations.mine.startDateAria')} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={t('operations.mine.endDateAria')} />
          </>
        )}
      </div>

      <div className="ops-my-resultline">
        <span>{t(visibleTasks.length === 1 ? 'operations.mine.resultOne' : 'operations.mine.resultMany', { n: visibleTasks.length })}</span>
        <span>{error ? t('operations.mine.syncIssue') : t('operations.mine.syncLive')}</span>
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
                  syncLabel={error ? t('operations.mine.notSynced') : t('operations.mine.live')}
                  onOpen={() => onOpenTask(task.id)}
                  onSetStatus={(status) => setTaskStatus(task, status)}
                />
              ))}
            </div>
          </section>
        ))}
        {visibleTasks.length === 0 && <Empty>{t('operations.mine.empty')}</Empty>}
      </div>
    </>
  );

  // Field keeps its classic work-queue chrome (+ the shared ModuleHeader);
  // managers get the V2 GmShell frame, consistent with All-tasks. The body
  // (tabs/filters/grouped MyTaskCards) is shared — MyTaskCard is untouched so
  // the field PWA experience is unchanged.
  if (isField) {
    return (
      <div className="ops-my-tasks">
        <div className="ops-my-header">
          <div>
            <div className="ops-mobile-kicker">{t('operations.mine.kickerField')}</div>
            <h2>{t('operations.mine.title')}</h2>
            <p>{t('operations.mine.introField')}</p>
          </div>
          <div className="ops-my-header-side">
            <div className="ops-my-counts" aria-label={t('operations.mine.countsAria')}>
              <span><strong>{counts.active}</strong> {t('operations.mine.countActive')}</span>
              <span><strong>{counts.due}</strong> {t('operations.mine.countDue')}</span>
              <span><strong>{counts.blocked}</strong> {t('operations.mine.countBlocked')}</span>
              <span><strong>{counts.completed}</strong> {t('operations.mine.countDone')}</span>
            </div>
          </div>
        </div>
        {inner}
      </div>
    );
  }
  return (
    <GmShell
      eyebrow="OPERATIONS"
      title={t('operations.mine.title')}
      sub={`${counts.active} active · ${counts.due} due · ${counts.blocked} blocked · ${counts.completed} done`}
      tabs={myTabs}
    >
      {inner}
    </GmShell>
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

function AllTasksPage({ onOpenTask, onCreate, onNav }: { onOpenTask: (id: string) => void; onCreate: () => void; onNav?: (s: string) => void }) {
  const { role } = usePermissions();
  const { t } = useT();

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
  // V2 quick-status segment (All · Open · Overdue · Done). Folds into the
  // query alongside the granular Status dropdown (granular wins when set).
  const [quick, setQuick] = useState<'all' | 'open' | 'overdue' | 'done'>('all');
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
  }, [filters, quick, search, sort, pageSize]);

  const pageQuery = useMemo(() => {
    const dueToday = filters.due === 'today';
    const dueThisWeek = filters.due === 'this_week';
    return {
      department: filters.department !== 'all' ? filters.department : undefined,
      status: filters.status !== 'all'
        ? [filters.status]
        : quick === 'open'
          ? (['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked'] as TaskStatus[])
          : quick === 'done'
            ? (['completed', 'closed', 'cancelled'] as TaskStatus[])
            : undefined,
      priority: filters.priority !== 'all' ? filters.priority : undefined,
      property: filters.property !== 'all' ? filters.property : undefined,
      assignee: filters.mine || role === 'field'
        ? 'me'
        : (filters.assignee !== 'all' ? filters.assignee : undefined),
      source: filters.source !== 'all' ? filters.source : undefined,
      overdue: filters.due === 'overdue' || quick === 'overdue',
      dueAfter: dueToday ? TODAY : (dueThisWeek ? TODAY : undefined),
      dueBefore: dueToday ? TODAY : (dueThisWeek ? addDays(TODAY, 6) : undefined),
      search: search.trim() || undefined,
      sort: sort?.key,
      dir: sort?.dir,
      limit: pageSize,
      offset,
    };
  }, [filters, offset, pageSize, quick, role, search, sort]);

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

  const allTabs: GmTab[] = [
    { l: 'Overview', onClick: () => onNav?.('overview') },
    { l: 'Schedule', onClick: () => onNav?.('schedule') },
    { l: 'My tasks', onClick: () => onNav?.('my') },
    { l: 'All tasks', on: true },
    { l: 'Approvals', onClick: () => onNav?.('approvals') },
    { l: 'Roster', onClick: () => onNav?.('roster') },
    { l: 'Insights', onClick: () => onNav?.('insights') },
  ];
  const seg = (id: typeof quick, label: string) => (
    <span
      className={'vs' + (quick === id ? ' on' : '')}
      onClick={() => { setQuick(id); if (id !== 'all') setFilters((f) => ({ ...f, status: 'all', due: 'all' })); }}
    >
      {label}
    </span>
  );
  const th = (label: string, key?: TaskSortKey) => {
    const active = key && sort?.key === key;
    return (
      <th
        onClick={key ? () => toggleSort(key) : undefined}
        style={key ? { cursor: 'pointer', whiteSpace: 'nowrap' } : undefined}
      >
        {label}{active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    );
  };
  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="All tasks"
      sub={loading && visibleTasks.length === 0 ? 'Loading…' : `${total} task${total === 1 ? '' : 's'} · showing ${pageStart}–${pageEnd}`}
      tabs={allTabs}
      actions={(
        <>
          {(activeFilterCount > 0 || quick !== 'all') && (
            <button className="dbtn ghost sm" onClick={() => { clearAllFilters(); setQuick('all'); }}>Clear</button>
          )}
          <button className="dbtn primary sm" onClick={onCreate}><DI n="plus" s={2} /> New task</button>
        </>
      )}
    >
      {error && (
        <div className="panel" style={{ padding: 10, marginBottom: 10, color: 'var(--amber)', fontSize: 12 }}>
          {t('operations.overview.loadError', { error })}
        </div>
      )}

      {/* filter bar — quick segment + granular dropdowns + search */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '2px 0 11px' }}>
        <span className="vseg">{seg('all', 'All')}{seg('open', 'Open')}{seg('overdue', 'Overdue')}{seg('done', 'Done')}</span>
        {filterChips}
        <span style={{ flex: 1, minWidth: 12 }} />
        <input
          type="search"
          placeholder={t('operations.all.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', minWidth: 180 }}
        />
      </div>

      <div className="panel" style={{ padding: '10px 6px' }}>
        <table className="tbl">
          <thead>
            <tr>
              {th('Property', 'propertyCode')}
              {th('Task', 'title')}
              {th('Dept', 'subdepartment')}
              {th('Assignee')}
              {th('Due', 'dueDate')}
              {th('Priority', 'priority')}
              {th('Status', 'status')}
              {th('Origin', 'source')}
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <TaskTableRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
            ))}
          </tbody>
        </table>
        {loading && visibleTasks.length === 0 && (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>Loading live tasks…</div>
        )}
        {!loading && visibleTasks.length === 0 && (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>{t('operations.all.empty')}</div>
        )}
        {loading && visibleTasks.length > 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--tx-3)', fontSize: 11.5, fontFamily: 'var(--mono)' }}>Refreshing…</div>
        )}
      </div>

      <div className="between" style={{ marginTop: 11 }}>
        <span className="faint mono" style={{ fontSize: 10.5 }}>{pageStart}–{pageEnd} of {total}</span>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Per page"
            style={{ padding: '5px 8px', fontSize: 11, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)' }}
          >
            <option value={50}>{t('operations.all.perPage', { n: 50 })}</option>
            <option value={100}>{t('operations.all.perPage', { n: 100 })}</option>
            <option value={200}>{t('operations.all.perPage', { n: 200 })}</option>
          </select>
          <button className="dbtn ghost sm" disabled={!canPrev || loading} onClick={() => setOffset(Math.max(0, pageOffset - limit))}>{t('operations.all.previous')}</button>
          <button className="dbtn ghost sm" disabled={!canNext || loading} onClick={() => setOffset(pageOffset + limit)}>{t('operations.all.next')}</button>
        </div>
      </div>
    </GmShell>
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
        padding: '5px 9px',
        fontSize: 11.5,
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: value === options[0].value ? 'var(--card)' : 'var(--indigo-ghost)',
        color: value === options[0].value ? 'var(--tx-2)' : 'var(--indigo-bright)',
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
  const sourceLabel = SOURCE_LABEL[task.source] || 'Task';
  const assignees = taskAssigneePeople(task);
  const isClosed = CLOSED_STATUS.has(task.status);
  return (
    <tr
      className="tdrow"
      data-closed={isClosed ? 'true' : undefined}
      onClick={onClick}
      style={{ cursor: 'pointer', opacity: isClosed ? 0.62 : 1 }}
    >
      <td><span className="pcodeD">{taskPropertyLabel(task)}</span></td>
      <td className="tt">
        {task.title}
        {task.riskFlags.length > 0 && (
          <span className="sub" style={{ display: 'block', color: 'var(--amber)' }}>
            ⚠ {task.riskFlags.slice(0, 2).join(', ')}{task.riskFlags.length > 2 ? ` +${task.riskFlags.length - 2}` : ''}
          </span>
        )}
      </td>
      <td className="faint">{taskSubdepartmentLabel(task)}</td>
      <td>
        {assignees.length === 0 ? (
          <span className="bdg amber">unassigned</span>
        ) : (
          <span className="avset">
            {assignees.slice(0, 3).map((u) => (
              <span key={u.id} className="av" title={u.name} style={{ background: u.avatarColor, color: '#fff', border: '1.5px solid var(--card)' }}>
                {u.initials}
              </span>
            ))}
          </span>
        )}
      </td>
      <td className="mono faint" style={{ whiteSpace: 'nowrap' }}>{formatTaskDue(task.dueDate, task.dueTime, task.status)}</td>
      <td><PriorityLabel priority={task.priority} /></td>
      <td><StatusPill status={task.status} /></td>
      <td className="faint" style={{ fontSize: 11 }}>{sourceLabel}</td>
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
  const { role } = usePermissions();
  const { t } = useT();
  const isField = role === 'field';
  const reportedTaskFilter = useMemo(() => ({
    status: ['reported'] as TaskStatus[],
    fieldRelated: isField,
  }), [isField]);
  const linkableTaskFilter = useMemo(() => ({ status: OPEN_SCHEDULE_STATUSES }), []);
  const { tasks: TASKS, loading, error, refetch } = useApiTasks(reportedTaskFilter);
  const { tasks: linkableTasks, refetch: refetchLinkableTasks } = useApiTasks(isField ? reportedTaskFilter : linkableTaskFilter);
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
    isField ? [] :
    linkableTasks
      .filter((task) => task.id !== selectedTask?.id && !CLOSED_STATUS.has(task.status))
      .sort((a, b) => compareText(taskPropertyLabel(a), taskPropertyLabel(b)) || compareText(a.title, b.title))
      .slice(0, 40)
  ), [isField, linkableTasks, selectedTask?.id]);

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
      fireToast(action === 'accept' ? 'Task accepted into the unscheduled work queue' : 'Reported issue triaged');
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
              {t('operations.overview.loadError', { error })}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0 }}>
                {t('operations.issues.title')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{intakeTasks.length} {t('operations.issues.title').toLowerCase()}</div>
            </div>
            {!isField && (
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
            )}
          </div>
          {!isField && (
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
          )}
          {isField && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              {t('operations.issues.fieldScope', 'Issues you reported, plus open reported issues on properties where you have assigned work.')}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && intakeTasks.length === 0 && <LoadingState label={t('operations.mine.loadingAssigned')} />}
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
                  gridTemplateColumns: isField ? 'minmax(0, 1fr)' : '34px minmax(0, 1fr)',
                  gap: 6,
                  padding: '8px 10px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                }}
              >
                {!isField && (
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
                )}
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
          {!loading && intakeTasks.length === 0 && <Empty>{isField ? t('operations.issues.emptyField', 'No reported issues linked to your work.') : t('operations.issues.empty', 'No reported issues right now.')}</Empty>}
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

            {!isField && (
            <div className="ops-inbox-ai-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              <button
                className="btn primary"
                type="button"
                style={{ minHeight: 36 }}
                disabled={Boolean(busyKey)}
                onClick={() => runSingle(selectedTask, 'accept')}
              >
                Accept to unscheduled
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
            )}

            {!isField && (
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
            )}
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
