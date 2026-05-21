'use client';

import { useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import {
  AI_TASK_DRAFTS,
  APPROVAL_REQUESTS,
  REPORTED_ISSUES,
  TASK_INSIGHTS,
  TASK_PROPERTIES,
  TASK_USER_BY_ID,
  TASK_USERS,
  type Department,
  type ReportedIssue,
  type Task,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
  type ApprovalRequest,
} from '../../_data/tasks';
import { useCanSee, useCurrentUserId, usePermissions } from '../usePermissions';
import { fireToast } from '../Toaster';
import { createTask, updateTask } from '../../_data/tasksClient';
import { useApiTasks } from '../../_data/useApiTasks';
import { TaskDetail } from './operations/TaskDetail';
import { CreateTaskDrawer, type CreateTaskMode, type CreateTaskPrefill } from './operations/CreateTaskDrawer';
import { RosterPage } from './roster/RosterPage';
import { IconClose, IconExpand, IconFilter, IconPlus, IconSparkle } from '../icons';
import { DAILY_BRIEF_POOL, pickDifferent, pickFromPool } from '../../_data/aiFixtures';
import { useAITelemetry } from '../ai/useAITelemetry';
import { AIBadge, AIRegenerateButton } from '../ai/AIComponents';
import { priorityTone, taskSourceTone, taskStatusTone, toneStyle } from '../palette';

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
  breezeway: 'Breezeway',
  inbox_ai: 'Inbox AI',
  guesty: 'Guesty',
  recurring: 'Recurring',
  reservation_trigger: 'Reservation',
  group_email: 'Email',
  friday: 'Friday',
  reported_issue: 'Issue',
  personal: 'Personal',
  review: 'Review',
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

const CLOSED_STATUS = new Set<TaskStatus>(['completed', 'closed', 'cancelled']);
const FIELD_EXECUTABLE_STATUS = new Set<TaskStatus>(['scheduled', 'ready', 'in_progress', 'paused']);
const TASK_DAY_MS = 86_400_000;

type TaskDateTab = 'today' | 'tomorrow' | 'week' | 'all';
type ReservationFilter = 'all' | 'linked' | 'unlinked';
type MyTaskSort = 'suggested' | 'due' | 'priority' | 'property';
type DashboardStatusFilter = 'all' | 'open' | TaskStatus;

interface CreateTaskIntent {
  mode: CreateTaskMode;
  prefill?: CreateTaskPrefill;
  sourceTask?: Task;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const a = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const b = new Date(Date.UTC(toYear, toMonth - 1, toDay));
  return Math.round((b.getTime() - a.getTime()) / TASK_DAY_MS);
}

function withinDateTab(task: Task, tab: TaskDateTab, startDate: string, endDate: string): boolean {
  if (tab === 'today') return task.dueDate === TODAY;
  if (tab === 'tomorrow') return task.dueDate === addDays(TODAY, 1);
  if (tab === 'week') return task.dueDate >= TODAY && task.dueDate <= addDays(TODAY, 6);
  return task.dueDate >= startDate && task.dueDate <= endDate;
}

function taskMatchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return [
    task.title,
    task.description ?? '',
    task.propertyCode,
    task.reservationId ?? '',
    task.department,
    task.subdepartment.replace(/_/g, ' '),
  ].some((value) => value.toLowerCase().includes(q));
}

function reservationState(task: Task): Exclude<ReservationFilter, 'all'> {
  return task.reservationId ? 'linked' : 'unlinked';
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isIsoDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

  const active = tabs.find((t) => t.id === subPage)?.id ?? (isField ? 'my' : 'overview');

  const [, setRev] = useState(0);
  const { tasks: liveTasks, refetch } = useApiTasks();
  const bumpRev = () => {
    setRev((n) => n + 1);
    refetch();
  };

  const [createIntent, setCreateIntent] = useState<CreateTaskIntent | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId ? liveTasks.find((t) => t.id === detailTaskId) : null;

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
            onReportStandalone={isField ? openStandaloneReport : undefined}
            onReportIssue={openAssignedIssueReport}
          />
        );
      case 'history':
        return <MyHistoryPage onOpenTask={setDetailTaskId} />;
      case 'overview':
        return <OverviewPage onOpenTask={setDetailTaskId} />;
      case 'all':
        return <AllTasksPage onOpenTask={setDetailTaskId} onCreate={() => openManagerCreate()} />;
      case 'issues':
        return <ReportedIssuesPage onCreated={(t) => { bumpRev(); setDetailTaskId(t.id); }} />;
      case 'approvals':
        return canSeeApprovals ? <ApprovalsPage onAfter={bumpRev} /> : null;
      case 'roster':
        return canSeeRoster ? <RosterPage /> : null;
      case 'insights':
        return <InsightsPage />;
      case 'settings':
        return canSeeSettings ? <SettingsPage onCreate={() => openManagerCreate()} /> : null;
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
        ) : (
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
          setDetailTaskId(t.id);
          bumpRev();
        }}
      />
    </div>
  );
}

// ───────────────── Overview ─────────────────

function OverviewPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { role } = usePermissions();
  const currentUserId = useCurrentUserId();
  const { tasks: TASKS, loading, error, refetch } = useApiTasks();
  const [dashboardDate, setDashboardDate] = useState(TODAY);
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatusFilter>('open');
  const [savingTimeId, setSavingTimeId] = useState<string | null>(null);
  const scopedTasks = useMemo(() => (
    role === 'field' ? TASKS.filter((t) => t.assigneeIds.includes(currentUserId)) : TASKS
  ), [TASKS, role, currentUserId]);
  const kpis = useMemo(() => {
    const openToday = scopedTasks.filter((t) => t.dueDate === TODAY && !CLOSED_STATUS.has(t.status)).length;
    const overdue = scopedTasks.filter((t) => t.dueDate < TODAY && !CLOSED_STATUS.has(t.status)).length;
    const urgent = scopedTasks.filter((t) => t.priority === 'urgent' && !CLOSED_STATUS.has(t.status)).length;
    const awaitingApproval = scopedTasks.filter((t) => t.status === 'blocked' || t.awaitingHumanApproval).length;
    const reportedToday = REPORTED_ISSUES.filter((i) => i.reportedAt.slice(0, 10) === TODAY && i.status === 'new').length;
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
      .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  ), [scopedTasks, dashboardDate, dashboardStatus]);

  const dashboardByProperty = useMemo(() => {
    const groups = new Map<string, Task[]>();
    dashboardTasks.forEach((task) => {
      const list = groups.get(task.propertyCode) ?? [];
      list.push(task);
      groups.set(task.propertyCode, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
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
      counts[task.status] += 1;
    });
    return { open, total: dayTasks.length, counts };
  }, [scopedTasks, dashboardDate]);

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
    (t) => t.riskFlags.includes('overdue') || t.riskFlags.includes('blocked_access') || t.priority === 'urgent',
  ).slice(0, 4);

  const reservationDriven = scopedTasks.filter(
    (t) => t.riskFlags.includes('reservation_imminent') && !CLOSED_STATUS.has(t.status),
  );

  const recentActivity = useMemo(() => {
    return scopedTasks.flatMap((t) =>
      t.activityLog.map((a) => ({ task: t, entry: a }))
    )
      .sort((a, b) => b.entry.ts.localeCompare(a.entry.ts))
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
    <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 6, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
          Live tasks could not load: {error}
        </div>
      )}
      {loading && TASKS.length === 0 && <Empty>Loading live tasks...</Empty>}

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
                    <strong>{task.title}</strong>
                    <small>
                      {STATUS_LABEL[task.status]} · {task.department} · {task.reservationId ? 'reservation linked' : 'no reservation'}
                    </small>
                  </span>
                  <span className="ops-agenda-indicators">
                    {task.attachmentCount > 0 && <span>{task.attachmentCount} files</span>}
                    {task.comments.length > 0 && <span>{task.comments.length} comments</span>}
                  </span>
                  <span className="ops-agenda-time" onClick={(e) => e.stopPropagation()}>
                    {role === 'field' ? (
                      <span>{task.dueTime ?? 'Any time'}</span>
                    ) : (
                      <input
                        type="time"
                        value={task.dueTime ?? ''}
                        aria-label={`Due time for ${task.title}`}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <KpiCard label="Open today" value={kpis.openToday} accent="var(--color-text-info)" />
        <KpiCard label="Overdue" value={kpis.overdue} accent="var(--color-text-danger)" />
        <KpiCard label="Urgent" value={kpis.urgent} accent="var(--color-text-warning)" />
        <KpiCard label="Awaiting approval" value={kpis.awaitingApproval} accent="var(--color-brand-accent)" />
        <KpiCard label="Reported today" value={kpis.reportedToday} accent="var(--color-text-success)" />
      </div>

      {/* AI Daily Brief — hidden when DAILY_BRIEF_POOL is empty */}
      {todaysBrief && (
        <div
          style={{
            padding: 16,
            background: 'var(--color-brand-accent-softer)',
            borderLeft: '3px solid var(--color-brand-accent)',
            borderRadius: 8,
            marginBottom: 20,
          }}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
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
                  {entry.kind.replace('_', ' ')}
                </span>
                <span style={{ marginLeft: 6 }}>{task.title.slice(0, 50)}</span>
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

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--color-background-secondary)',
        borderRadius: 8,
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 500 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ───────────────── My Tasks / History ─────────────────

function MyTasksPage({
  onOpenTask,
  onReportStandalone,
  onReportIssue,
}: {
  onOpenTask: (id: string) => void;
  onReportStandalone?: () => void;
  onReportIssue: (task: Task) => void;
}) {
  const currentUserId = useCurrentUserId();
  const { role } = usePermissions();
  const { tasks: TASKS, loading, error, refetch } = useApiTasks();
  const [dateTab, setDateTab] = useState<TaskDateTab>('today');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | 'all'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [reservation, setReservation] = useState<ReservationFilter>('all');
  const [sort, setSort] = useState<MyTaskSort>('suggested');
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState(addDays(TODAY, 13));
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const assignedTasks = useMemo(() => (
    TASKS.filter((task) => task.assigneeIds.includes(currentUserId))
  ), [TASKS, currentUserId]);

  const visibleTasks = useMemo(() => {
    const tasks = assignedTasks
      .filter((task) => !CLOSED_STATUS.has(task.status))
      .filter((task) => withinDateTab(task, dateTab, startDate, endDate))
      .filter((task) => department === 'all' || task.department === department)
      .filter((task) => priority === 'all' || task.priority === priority)
      .filter((task) => reservation === 'all' || reservationState(task) === reservation)
      .filter((task) => taskMatchesSearch(task, search));
    return [...tasks].sort((a, b) => {
      if (sort === 'property') return a.propertyCode.localeCompare(b.propertyCode) || a.dueDate.localeCompare(b.dueDate);
      if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.dueDate.localeCompare(b.dueDate);
      if (sort === 'due') return a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
      return (
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.dueDate.localeCompare(b.dueDate) ||
        (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')
      );
    });
  }, [assignedTasks, dateTab, department, endDate, priority, reservation, search, sort, startDate]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    visibleTasks.forEach((task) => {
      const key = dateTab === 'today' || dateTab === 'tomorrow' ? task.propertyCode : task.dueDate;
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [dateTab, visibleTasks]);

  const counts = useMemo(() => {
    const active = assignedTasks.filter((task) => task.status === 'in_progress').length;
    const due = assignedTasks.filter((task) => task.dueDate <= TODAY && !CLOSED_STATUS.has(task.status)).length;
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
          {onReportStandalone && (
            <button type="button" className="btn primary sm ops-report-issue-btn" onClick={onReportStandalone}>
              <IconPlus size={12} /> Report property issue
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="ops-my-alert">
          Live tasks could not load: {error}. Offline queue is not enabled yet, so failed actions stay visible here instead of disappearing.
        </div>
      )}
      {loading && TASKS.length === 0 && <Empty>Loading assigned tasks...</Empty>}

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
                  onReportIssue={() => onReportIssue(task)}
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
  onReportIssue,
}: {
  task: Task;
  busy: boolean;
  syncLabel: string;
  onOpen: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onReportIssue: () => void;
}) {
  const statusSwatch = toneStyle(taskStatusTone(task.status));
  const prioSwatch = toneStyle(priorityTone(task.priority));
  const isOverdue = task.dueDate < TODAY && !CLOSED_STATUS.has(task.status);
  const daysUntil = daysBetween(TODAY, task.dueDate);
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
        <span className="mono">{task.propertyCode}</span>
        <span>{formatTaskDue(task.dueDate, task.dueTime)}</span>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      <div className="ops-my-card-chips">
        <span style={{ background: statusSwatch.background, color: statusSwatch.color }}>{STATUS_LABEL[task.status]}</span>
        <span style={{ background: prioSwatch.background, color: prioSwatch.color }}>{task.priority}</span>
        <span>{task.department}</span>
        <span>{task.reservationId ? 'reservation' : 'property issue'}</span>
        {isOverdue && <span>overdue</span>}
        {!isOverdue && daysUntil >= 0 && daysUntil <= 1 && <span>{daysUntil === 0 ? 'today' : 'tomorrow'}</span>}
      </div>
      <div className="ops-my-card-footer">
        <span>{task.comments.length} comments</span>
        <span>{task.attachmentCount} files</span>
        <span>{syncLabel}</span>
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
        <button type="button" className="btn ghost sm" onClick={(e) => { stop(e); onOpen(); }}>
          Evidence
        </button>
        <button type="button" className="btn ghost sm" onClick={(e) => { stop(e); onReportIssue(); }}>
          Report issue
        </button>
        <button type="button" className="btn ghost sm" onClick={(e) => { stop(e); onOpen(); }}>
          Details
        </button>
      </div>
    </article>
  );
}

function MyHistoryPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const currentUserId = useCurrentUserId();
  const { tasks: TASKS, loading, error } = useApiTasks();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month');

  const historyTasks = useMemo(() => {
    const oldest =
      range === 'week' ? addDays(TODAY, -7) :
      range === 'month' ? addDays(TODAY, -31) :
      '0000-01-01';
    return TASKS
      .filter((task) => task.assigneeIds.includes(currentUserId))
      .filter((task) => task.status === 'completed' || task.status === 'closed')
      .filter((task) => {
        const done = (task.completedAt ?? task.updatedAt).slice(0, 10);
        return done >= oldest;
      })
      .filter((task) => taskMatchesSearch(task, search))
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  }, [TASKS, currentUserId, range, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Task[]>();
    historyTasks.forEach((task) => {
      const day = (task.completedAt ?? task.updatedAt).slice(0, 10);
      const list = groups.get(day) ?? [];
      list.push(task);
      groups.set(day, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
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
      {loading && TASKS.length === 0 && <Empty>Loading task history...</Empty>}
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
                <span className="mono">{task.propertyCode}</span>
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
        {historyTasks.length === 0 && <Empty>No completed tasks match this history view.</Empty>}
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
          {task.propertyCode} · {task.subdepartment.replace('_', ' ')} · due {task.dueDate}
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

function compareTasks(a: Task, b: Task, key: TaskSortKey): number {
  switch (key) {
    case 'status':
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case 'priority':
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    case 'dueDate':
      return a.dueDate.localeCompare(b.dueDate);
    default:
      return String(a[key]).localeCompare(String(b[key]));
  }
}

function AllTasksPage({ onOpenTask, onCreate }: { onOpenTask: (id: string) => void; onCreate: () => void }) {
  const currentUserId = useCurrentUserId();
  const { role } = usePermissions();
  const { tasks: TASKS, loading, error } = useApiTasks();

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

  const toggleSort = (key: TaskSortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const visibleTasks = useMemo(() => {
    let tasks = [...TASKS];
    // Field staff: own + team-visible
    if (role === 'field') {
      tasks = tasks.filter((t) => t.visibility !== 'self' || t.assigneeIds.includes(currentUserId));
    }
    if (filters.department !== 'all') tasks = tasks.filter((t) => t.department === filters.department);
    if (filters.status !== 'all') tasks = tasks.filter((t) => t.status === filters.status);
    if (filters.priority !== 'all') tasks = tasks.filter((t) => t.priority === filters.priority);
    if (filters.property !== 'all') tasks = tasks.filter((t) => t.propertyCode === filters.property);
    if (filters.assignee !== 'all') tasks = tasks.filter((t) => t.assigneeIds.includes(filters.assignee));
    if (filters.source !== 'all') tasks = tasks.filter((t) => t.source === filters.source);
    if (filters.mine) tasks = tasks.filter((t) => t.assigneeIds.includes(currentUserId));
    if (filters.due === 'today') tasks = tasks.filter((t) => t.dueDate === TODAY);
    if (filters.due === 'overdue') tasks = tasks.filter((t) => t.dueDate < TODAY && !CLOSED_STATUS.has(t.status));
    if (filters.due === 'this_week') tasks = tasks.filter((t) => t.dueDate >= '2026-04-27' && t.dueDate <= '2026-05-03');
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter((t) => t.title.toLowerCase().includes(q) || t.propertyCode.toLowerCase().includes(q));
    }
    if (sort) {
      const sign = sort.dir === 'asc' ? 1 : -1;
      tasks.sort((a, b) => sign * compareTasks(a, b, sort.key));
    }
    return tasks;
  }, [filters, search, role, currentUserId, sort]);

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
          ...TASK_PROPERTIES.map((p) => ({ value: p.code, label: p.code })),
        ]}
        onChange={(v) => setFilters({ ...filters, property: v })}
      />
      <FilterChip
        value={filters.assignee}
        options={[
          { value: 'all', label: 'All assignees' },
          ...TASK_USERS.filter((u) => u.role !== 'external').map((u) => ({
            value: u.id,
            label: u.name.split(' ')[0],
          })),
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
          { value: 'breezeway', label: 'Breezeway' },
          { value: 'inbox_ai', label: 'Inbox AI' },
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
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
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {visibleTasks.length} of {TASKS.length} tasks
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        <table className="fad-tasks-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
              <SortableTh sortKey="source" sort={sort} onToggle={toggleSort}>Source</SortableTh>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <TaskTableRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
            ))}
          </tbody>
        </table>
        {loading && TASKS.length === 0 && <Empty>Loading live tasks...</Empty>}
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

function TaskTableRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const sourceSwatch = toneStyle(taskSourceTone(task.source));
  const sourceLabel = SOURCE_LABEL[task.source];
  return (
    <tr
      onClick={onClick}
      style={{ cursor: 'pointer', borderBottom: '0.5px solid var(--color-border-tertiary)' }}
    >
      <td style={{ padding: '6px 10px', width: 4 }}>
        <span style={{ display: 'inline-block', width: 4, height: 24, background: priorityBarColor(task.priority), borderRadius: 2 }} />
      </td>
      <td style={{ padding: '6px 10px' }}>
        <span className="mono" style={{ fontSize: 11 }}>{task.propertyCode}</span>
      </td>
      <td style={{ padding: '6px 10px', maxWidth: 280 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        {task.riskFlags.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--color-text-warning)', marginTop: 2 }}>
            ⚠ {task.riskFlags.slice(0, 2).join(', ')}
            {task.riskFlags.length > 2 && ` +${task.riskFlags.length - 2}`}
          </div>
        )}
      </td>
      <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-secondary)' }}>{task.subdepartment.replace('_', ' ')}</td>
      <td style={{ padding: '6px 10px' }}>
        <span style={{ fontSize: 11 }}>{STATUS_LABEL[task.status]}</span>
      </td>
      <td style={{ padding: '6px 10px' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', color: priorityBarColor(task.priority), fontWeight: 500 }}>
          {task.priority}
        </span>
      </td>
      <td style={{ padding: '6px 10px' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {task.assigneeIds.slice(0, 3).map((id, i) => {
            const u = TASK_USER_BY_ID[id];
            if (!u) return null;
            return (
              <span
                key={id}
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
          {task.assigneeIds.length === 0 && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>—</span>}
        </div>
      </td>
      <td style={{ padding: '6px 10px', fontSize: 11 }}>{task.dueDate}</td>
      <td style={{ padding: '6px 10px' }}>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 4,
            background: sourceSwatch.background,
            color: sourceSwatch.color,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {sourceLabel}
        </span>
      </td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        {task.attachmentCount > 0 && `📎 ${task.attachmentCount}`}
      </td>
    </tr>
  );
}

function formatTaskDue(dueDate: string, dueTime?: string): string {
  if (dueDate === TODAY) return dueTime ? `Due today, ${dueTime}` : 'Due today';
  const parts = dueDate.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(2026, 3, 27);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const fmt = date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  if (diff === 1) return dueTime ? `Due tomorrow, ${dueTime}` : 'Due tomorrow';
  if (diff < 0) return `Overdue · ${fmt}`;
  return `Due ${fmt}`;
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const statusSwatch = toneStyle(taskStatusTone(task.status));
  const prioSwatch = toneStyle(priorityTone(task.priority));
  const sourceSwatch = toneStyle(taskSourceTone(task.source));
  const chipBase: React.CSSProperties = {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
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
          <span className="mono">{task.propertyCode}</span>
          <span>·</span>
          <span>{task.subdepartment.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>{formatTaskDue(task.dueDate, task.dueTime)}</span>
        </div>
        {task.riskFlags.length > 0 && (
          <div className="fad-task-card-risk">
            ⚠ {task.riskFlags.slice(0, 2).join(', ')}
            {task.riskFlags.length > 2 && ` +${task.riskFlags.length - 2}`}
          </div>
        )}
        <div className="fad-task-card-row2">
          <div className="fad-task-card-chips">
            <span style={{ ...chipBase, background: statusSwatch.background, color: statusSwatch.color }}>
              {STATUS_LABEL[task.status]}
            </span>
            <span style={{ ...chipBase, background: prioSwatch.background, color: prioSwatch.color }}>
              {task.priority}
            </span>
            <span style={{ ...chipBase, background: sourceSwatch.background, color: sourceSwatch.color }}>
              {SOURCE_LABEL[task.source]}
            </span>
          </div>
          <div className="fad-task-card-avatars">
            {task.assigneeIds.slice(0, 3).map((id, i) => {
              const u = TASK_USER_BY_ID[id];
              if (!u) return null;
              return (
                <span
                  key={id}
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
            {task.assigneeIds.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ───────────────── Reported Issues ─────────────────

function ReportedIssuesPage({ onCreated }: { onCreated: (t: Task) => void }) {
  const [statusFilter, setStatusFilter] = useState<ReportedIssue['status'] | 'all'>('new');
  const [sourceFilter, setSourceFilter] = useState<ReportedIssue['source'] | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const visible = useMemo(() => {
    let issues = [...REPORTED_ISSUES];
    if (statusFilter !== 'all') issues = issues.filter((i) => i.status === statusFilter);
    if (sourceFilter !== 'all') issues = issues.filter((i) => i.source === sourceFilter);
    return issues.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  }, [statusFilter, sourceFilter]);

  const selected = REPORTED_ISSUES.find((i) => i.id === selectedId) ?? visible[0];

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      <div className="fad-split-list" style={{ width: 380, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {(['new', 'triaged', 'converted', 'all'] as const).map((s) => (
              <button
                key={s}
                className={'inbox-chip' + (statusFilter === s ? ' active' : '')}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['all', 'guest_chat', 'field_pm', 'inspection', 'group_email', 'inbox'] as const).map((s) => (
              <button
                key={s}
                className={'inbox-chip' + (sourceFilter === s ? ' active' : '')}
                onClick={() => setSourceFilter(s)}
                style={{ fontSize: 10 }}
              >
                {s === 'all' ? 'All sources' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visible.map((i) => {
            const isSelected = selected?.id === i.id;
            return (
              <button
                key={i.id}
                onClick={() => { setSelectedId(i.id); setDetailOpen(true); }}
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
                  <span style={{ fontWeight: 500 }}>{i.propertyCode}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{formatRelative(i.reportedAt)}</span>
                </div>
                <div style={{ fontSize: 12 }}>{i.title}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {i.reporterLabel ?? TASK_USER_BY_ID[i.reporterId]?.name ?? i.reporterId}
                </div>
              </button>
            );
          })}
          {visible.length === 0 && <Empty>No issues match filters.</Empty>}
        </div>
      </div>

      <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          onClick={() => setDetailOpen(false)}
        >
          ← Back to issues
        </button>
        {selected ? (
          <IssueDetail issue={selected} onCreated={onCreated} />
        ) : (
          <Empty>Select an issue to triage.</Empty>
        )}
      </div>
    </div>
  );
}

function IssueDetail({ issue, onCreated }: { issue: ReportedIssue; onCreated: (t: Task) => void }) {
  const currentUserId = useCurrentUserId();

  const convert = async () => {
    const task = await createTask({
      title: issue.title,
      description: issue.description,
      propertyCode: issue.propertyCode,
      department: issue.aiSuggestedDepartment ?? 'office',
      subdepartment: issue.aiSuggestedSubdepartment ?? 'admin',
      priority: issue.aiSuggestedPriority ?? 'medium',
      source: 'reported_issue',
      assigneeIds: issue.aiSuggestedAssignee ? [issue.aiSuggestedAssignee] : [],
      requesterId: currentUserId,
      dueDate: TODAY,
      inboxThreadId: issue.inboxThreadId,
      groupEmailId: issue.groupEmailId,
    });
    issue.status = 'converted';
    issue.convertedTaskId = task.id;
    onCreated(task);
  };

  const dismiss = () => {
    issue.status = 'dismissed';
    fireToast('Issue dismissed');
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>{issue.title}</h2>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        {issue.propertyCode} · {issue.reporterLabel ?? 'Field PM'} · {formatRelative(issue.reportedAt)}
      </div>

      <div
        style={{
          padding: 12,
          background: 'var(--color-background-secondary)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {issue.description}
      </div>

      {issue.photos > 0 && (
        <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          📷 {issue.photos} photo{issue.photos === 1 ? '' : 's'} attached
        </div>
      )}

      {issue.aiConfidence !== undefined && (
        <div
          style={{
            padding: 12,
            background: 'var(--color-brand-accent-softer)',
            borderLeft: '3px solid var(--color-brand-accent)',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <IconSparkle size={11} />
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand-accent)' }}>
              AI triage · {Math.round(issue.aiConfidence * 100)}%
            </span>
          </div>
          {issue.aiReason}
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <strong>Suggested:</strong>
            {issue.aiSuggestedDepartment && ` ${issue.aiSuggestedDepartment} > ${issue.aiSuggestedSubdepartment}`}
            {issue.aiSuggestedAssignee && ` · ${TASK_USER_BY_ID[issue.aiSuggestedAssignee]?.name.split(' ')[0]}`}
            {issue.aiSuggestedPriority && ` · ${issue.aiSuggestedPriority} priority`}
          </div>
        </div>
      )}

      {issue.status === 'new' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={convert}>
            Convert to task
          </button>
          <button className="btn ghost" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
      {issue.status === 'converted' && issue.convertedTaskId && (
        <div style={{ padding: 10, background: 'var(--color-bg-success)', borderRadius: 6, fontSize: 12 }}>
          ✓ Converted to task {issue.convertedTaskId}
        </div>
      )}
      {issue.status === 'dismissed' && (
        <div style={{ padding: 10, background: 'var(--color-background-secondary)', borderRadius: 6, fontSize: 12 }}>
          Dismissed
        </div>
      )}
    </div>
  );
}

// ───────────────── Approvals ─────────────────

function ApprovalsPage({ onAfter }: { onAfter: () => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const currentUserId = useCurrentUserId();
  const [statusFilter, setStatusFilter] = useState<ApprovalRequest['status'] | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    let reqs = [...APPROVAL_REQUESTS];
    if (statusFilter !== 'all') reqs = reqs.filter((r) => r.status === statusFilter);
    return reqs.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [statusFilter]);

  const selected = APPROVAL_REQUESTS.find((r) => r.id === selectedId) ?? visible[0];

  const decide = (req: ApprovalRequest, decision: 'approved' | 'rejected' | 'countered', notes?: string, counterAmount?: number) => {
    req.status = decision;
    req.reviewedBy = currentUserId;
    req.reviewedAt = new Date().toISOString();
    req.reviewNotes = notes;
    if (counterAmount !== undefined) req.counterAmount = counterAmount;
    fireToast(`Request ${decision}`);
    onAfter();
  };

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      <div className="fad-split-list" style={{ width: 380, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: 10,
            background: 'var(--color-bg-warning)',
            borderLeft: '3px solid var(--color-text-warning)',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            margin: 12,
            borderRadius: 4,
          }}
        >
          <strong>Demo data</strong> · this flow activates when field staff move from Breezeway approval requests to FAD in Phase 2.
        </div>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['pending', 'approved', 'rejected', 'countered', 'all'] as const).map((s) => (
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
          {visible.map((r) => {
            const isSelected = selected?.id === r.id;
            const requester = TASK_USER_BY_ID[r.requesterId];
            return (
              <button
                key={r.id}
                onClick={() => { setSelectedId(r.id); setDetailOpen(true); }}
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
                  <span style={{ fontWeight: 500 }}>{r.type.replace('_', ' ')} · {r.propertyCode}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{formatRelative(r.requestedAt)}</span>
                </div>
                {r.amount !== undefined && (
                  <div className="mono" style={{ fontSize: 11 }}>
                    {/* @demo:config — 'MUR' hardcoded fallback currency. Replace with tenant defaultCurrency from GET /api/tenant/config. Tag: PROD-CONFIG-9. */}
                    {r.amount.toLocaleString()} {r.currency ?? 'MUR'}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {requester?.name.split(' ')[0] ?? r.requesterId}
                </div>
              </button>
            );
          })}
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
        {selected ? <ApprovalDetail req={selected} onDecide={decide} /> : <Empty>Select a request.</Empty>}
      </div>
    </div>
  );
}

function ApprovalDetail({
  req,
  onDecide,
}: {
  req: ApprovalRequest;
  onDecide: (req: ApprovalRequest, decision: 'approved' | 'rejected' | 'countered', notes?: string, counter?: number) => void;
}) {
  const requester = TASK_USER_BY_ID[req.requesterId];
  const [notes, setNotes] = useState('');
  const [counter, setCounter] = useState('');

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>
        {req.type.replace('_', ' ')} · {req.propertyCode}
      </h2>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        {requester?.name ?? 'Unknown'} · requested {formatRelative(req.requestedAt)}
      </div>

      {req.amount !== undefined && (
        <div
          style={{
            padding: 16,
            background: 'var(--color-background-secondary)',
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 500 }}>
            {/* @demo:config — 'MUR' fallback (see PROD-CONFIG-9) */}
            {req.amount.toLocaleString()} {req.currency ?? 'MUR'}
          </div>
          {req.vendor && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>Vendor: {req.vendor}</div>}
          {req.thresholdTier && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Tier: {req.thresholdTier}</div>}
        </div>
      )}

      <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Justification:</strong> {req.justification}
      </div>

      {req.attachments.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          📎 Attachments: {req.attachments.join(', ')}
        </div>
      )}

      {req.linkedTaskId && (
        <div style={{ marginBottom: 16, fontSize: 12 }}>
          Linked task: <code>{req.linkedTaskId}</code>
        </div>
      )}

      {req.status === 'pending' && (
        <div
          style={{
            padding: 16,
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 6,
          }}
        >
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', minHeight: 60, padding: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => onDecide(req, 'approved', notes || undefined)}>
              Approve
            </button>
            <button className="btn ghost" onClick={() => onDecide(req, 'rejected', notes || undefined)}>
              Reject
            </button>
            {req.amount !== undefined && (
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  placeholder="Counter amount"
                  value={counter}
                  onChange={(e) => setCounter(e.target.value)}
                  style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
                />
                <button
                  className="btn ghost"
                  onClick={() => onDecide(req, 'countered', notes || undefined, parseFloat(counter) || undefined)}
                  disabled={!counter}
                >
                  Counter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {req.status !== 'pending' && (
        <div style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 6, fontSize: 12 }}>
          <strong>{req.status}</strong>
          {req.reviewedBy && ` by ${TASK_USER_BY_ID[req.reviewedBy]?.name}`}
          {req.counterAmount !== undefined && ` (counter: ${req.counterAmount.toLocaleString()})`}
          {req.reviewNotes && (
            <div style={{ marginTop: 6, fontStyle: 'italic' }}>"{req.reviewNotes}"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────── Insights ─────────────────

function InsightsPage() {
  const top = TASK_INSIGHTS.topAssignees;
  const dept = TASK_INSIGHTS.byDepartment;
  const props = TASK_INSIGHTS.topPropertiesByIssues;
  const trend = TASK_INSIGHTS.escalationTrend;
  const completed = TASK_INSIGHTS.completedTrend;
  const ai = TASK_INSIGHTS.aiAccuracy;

  return (
    <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Section title="Completed last 7 days">
          <div style={{ fontSize: 28, fontWeight: 500 }}>{TASK_INSIGHTS.weeklyCompleted}</div>
          <Sparkline values={completed} color="#10b981" />
        </Section>

        <Section title="Created last 7 days">
          <div style={{ fontSize: 28, fontWeight: 500 }}>{TASK_INSIGHTS.weeklyCreated}</div>
          <Sparkline values={completed} color="#7c3aed" />
        </Section>

        <Section title="Avg completion time">
          <div style={{ fontSize: 28, fontWeight: 500 }}>{TASK_INSIGHTS.avgCompletionMinutes}m</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>across all departments</div>
        </Section>

        <Section title="Top assignees">
          <BarList rows={top.map((r) => ({ label: TASK_USER_BY_ID[r.userId]?.name.split(' ')[0] ?? r.userId, value: r.completed, sub: `${r.avgMinutes}m avg` }))} />
        </Section>

        <Section title="By department">
          <BarList rows={dept.map((d) => ({ label: d.dept, value: d.count, sub: `${d.avgMinutes}m avg` }))} />
        </Section>

        <Section title="Properties with most issues">
          <BarList rows={props.map((p) => ({ label: p.code, value: p.issues, sub: `${p.issues} issue${p.issues === 1 ? '' : 's'}` }))} />
        </Section>

        <Section title="Escalations · last 7 days">
          <Sparkline values={trend} color="#ef4444" />
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {trend[trend.length - 1]} today vs {trend[0]} 7 days ago
          </div>
        </Section>

        <Section title="AI accuracy">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 4 }}>
            <Stat label="Auto-triage accept" value={`${Math.round(ai.autoTriageAccept * 100)}%`} />
            <Stat label="NL parse accept" value={`${Math.round(ai.nlParseAccept * 100)}%`} />
            <Stat label="Risk flag accept" value={`${Math.round(ai.riskFlagAccept * 100)}%`} />
            <Stat label="Sample size" value={`${ai.sampleSize}`} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Phase 1 canned · real telemetry wired in Phase 2
          </div>
        </Section>
      </div>
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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40, marginTop: 8 }}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 8, background: 'var(--color-background-secondary)', borderRadius: 4 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

// ───────────────── Settings ─────────────────

// @demo:data — Tag: PROD-DATA-36 — see frontend/DEMO_CRUFT.md
function SettingsPage({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Settings</h2>
        <button className="btn primary sm" onClick={onCreate} style={{ marginLeft: 'auto' }}>
          <IconPlus size={12} /> Manual create task
        </button>
      </div>

      <div
        style={{
          padding: 12,
          background: 'var(--color-bg-warning)',
          borderLeft: '3px solid var(--color-text-warning)',
          borderRadius: 4,
          marginBottom: 20,
          fontSize: 12,
        }}
      >
        Read-only mirror of Breezeway templates and workflows. Edit upstream in Breezeway until Phase 3.
      </div>

      <Section title="Templates · read-only mirror from Breezeway">
        {[
          { id: 'std-clean', name: 'Standard cleaning', dept: 'cleaning > standard_clean', items: 82, est: '2h', uses30d: 287 },
          { id: 'post-clean', name: 'Post-clean inspection', dept: 'inspection > post_clean', items: 45, est: '30m', uses30d: 261 },
          { id: 'pre-arrival', name: 'Pre-arrival inspection', dept: 'inspection > pre_arrival', items: 38, est: '45m', uses30d: 198 },
          { id: 'deep-clean', name: 'Deep clean', dept: 'cleaning > deep_clean', items: 134, est: '6h', uses30d: 32 },
          { id: 'pool', name: 'Pool clarity check', dept: 'maintenance > pool', items: 12, est: '45m', uses30d: 64 },
        ].map((t) => (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
              gap: 8,
              padding: '10px 12px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 12,
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 500 }}>{t.name}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{t.dept}</span>
            <span className="mono">{t.items} items</span>
            <span className="mono">{t.est}</span>
            <span className="mono" style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{t.uses30d} uses 30d</span>
          </div>
        ))}
      </Section>

      <Section title="Workflows · auto-task generation">
        <Workflow trigger="On checkout" actions={['Standard cleaning (same day)', 'Post-clean inspection (same day, after cleaning)']} />
        <Workflow
          trigger="2 days before check-in"
          actions={[
            'IF property empty >3 days OR pre-arrival flag → Arrival inspection (1 day before check-in)',
            'ELSE skip',
          ]}
        />
      </Section>

      <Section title="Recurring rules">
        <Workflow trigger="Pest control · per property" actions={['Every 3 months']} />
        <Workflow trigger="AC servicing · per property" actions={['Every 6 months']} />
        <Workflow trigger="Preventative maintenance" actions={['Monthly · all properties']} />
        <Workflow trigger="Aesthetic check" actions={['Monthly · all properties']} />
        <Workflow trigger="Amenities form → Gap analysis" actions={['Monthly · sequential']} />
      </Section>

      <button
        className="btn ghost sm"
        onClick={() => fireToast('Would open Breezeway templates editor in new tab')}
        style={{ marginTop: 12 }}
      >
        Edit in Breezeway ↗
      </button>
    </div>
  );
}

function Workflow({ trigger, actions }: { trigger: string; actions: string[] }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{trigger}</div>
      {actions.map((a, i) => (
        <div key={i} style={{ paddingLeft: 16, color: 'var(--color-text-secondary)' }}>
          → {a}
        </div>
      ))}
    </div>
  );
}

// ───────────────── Shared ─────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--color-background-secondary)',
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      {children}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date('2026-04-27T12:00:00');
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

void AI_TASK_DRAFTS;
