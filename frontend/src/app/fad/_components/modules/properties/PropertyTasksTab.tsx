'use client';

import { useMemo, useState } from 'react';
import {
  TASKS,
  TASK_USER_BY_ID,
  type Task,
  type TaskStatus,
  type TaskSource,
} from '../../../_data/tasks';
import { useApiTasks } from '../../../_data/useApiTasks';
import type { Property } from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  property: Property;
}

type StatusFilter = 'all' | 'open' | TaskStatus;
type SourceFilter = 'all' | TaskSource;
type TimeFilter = 'all' | 'upcoming' | 'past_30d' | 'past_90d' | 'past_12mo';
type GroupBy = 'flat' | 'status' | 'source' | 'month';
type SortKey = 'dueDate' | 'title' | 'source' | 'assignee' | 'status' | 'updated';

const TODAY = '2026-04-27';

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

const STATUS_TONE: Record<TaskStatus, string> = {
  reported: 'warn',
  scheduled: '',
  ready: 'info',
  in_progress: 'info',
  paused: '',
  blocked: 'warn',
  completed: 'info',
  closed: 'info',
  cancelled: '',
};

const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: 'Manual',
  breezeway: 'Breezeway',
  inbox_ai: 'Inbox',
  guesty: 'Guesty',
  recurring: 'Recurring',
  reservation_trigger: 'Reservation',
  group_email: 'Group email',
  friday: 'Friday AI',
  reported_issue: 'Reported issue',
  personal: 'Personal',
  review: 'Review',
  syndic: 'Syndic',
};

const isOpen = (s: TaskStatus) => s !== 'completed' && s !== 'closed' && s !== 'cancelled';

function isOverdue(task: Task): boolean {
  return isOpen(task.status) && task.dueDate < TODAY;
}

function inTimeFilter(task: Task, filter: TimeFilter): boolean {
  if (filter === 'all') return true;
  const todayMs = new Date(TODAY).getTime();
  const taskMs = new Date(task.dueDate).getTime();
  if (filter === 'upcoming') return taskMs >= todayMs;
  if (filter === 'past_30d') return taskMs < todayMs && (todayMs - taskMs) <= 30 * 86400000;
  if (filter === 'past_90d') return taskMs < todayMs && (todayMs - taskMs) <= 90 * 86400000;
  if (filter === 'past_12mo') return taskMs < todayMs && (todayMs - taskMs) <= 365 * 86400000;
  return true;
}

export function PropertyTasksTab({ property }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('flat');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'dueDate', dir: 'desc' });
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // #35 — live tasks filtered by propertyCode on the backend. Falls
  // back to fixture TASKS when the live fetch is unavailable (preview
  // mode / no auth) so the tab still demos without a backend.
  const liveFilter = useMemo(() => ({ property: property.code }), [property.code]);
  const { tasks: liveTasks, error: liveError } = useApiTasks(liveFilter);
  const allTasks = useMemo(() => {
    if (liveTasks && liveTasks.length > 0) return liveTasks;
    if (liveError || (liveTasks && liveTasks.length === 0)) {
      // When live returns explicitly empty, prefer that over fixtures
      // — except when there's an outright error, fall back so the tab
      // isn't empty in dev/demo.
      if (liveError) return TASKS.filter((t) => t.propertyCode === property.code);
      return [];
    }
    return TASKS.filter((t) => t.propertyCode === property.code);
  }, [liveTasks, liveError, property.code]);

  const aggregates = useMemo(() => {
    const open = allTasks.filter((t) => isOpen(t.status)).length;
    const overdueN = allTasks.filter(isOverdue).length;
    const todayMs = new Date(TODAY).getTime();
    const completed30d = allTasks.filter((t) =>
      t.status === 'completed' && t.completedAt && (todayMs - new Date(t.completedAt).getTime()) <= 30 * 86400000
    ).length;
    const lastTask = [...allTasks].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return { open, overdueN, completed30d, lastTaskAt: lastTask?.updatedAt?.slice(0, 10) ?? '—' };
  }, [allTasks]);

  const filtered = useMemo(() => {
    let out = allTasks.slice();

    if (statusFilter === 'open') out = out.filter((t) => isOpen(t.status));
    else if (statusFilter !== 'all') out = out.filter((t) => t.status === statusFilter);

    if (sourceFilter !== 'all') out = out.filter((t) => t.source === sourceFilter);

    out = out.filter((t) => inTimeFilter(t, timeFilter));

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }

    const cmp = (a: Task, b: Task) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'dueDate': return a.dueDate.localeCompare(b.dueDate) * dir;
        case 'title': return a.title.localeCompare(b.title) * dir;
        case 'source': return a.source.localeCompare(b.source) * dir;
        case 'assignee': {
          const an = TASK_USER_BY_ID[a.assigneeIds[0]]?.name ?? '';
          const bn = TASK_USER_BY_ID[b.assigneeIds[0]]?.name ?? '';
          return an.localeCompare(bn) * dir;
        }
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'updated': return a.updatedAt.localeCompare(b.updatedAt) * dir;
      }
    };
    return out.sort(cmp);
  }, [allTasks, statusFilter, sourceFilter, timeFilter, search, sort]);

  const grouped = useMemo(() => {
    if (groupBy === 'flat') return [{ label: '', tasks: filtered }];
    const map: Record<string, Task[]> = {};
    filtered.forEach((t) => {
      let key: string;
      if (groupBy === 'status') key = STATUS_LABEL[t.status];
      else if (groupBy === 'source') key = SOURCE_LABEL[t.source] ?? t.source;
      else if (groupBy === 'month') key = t.dueDate.slice(0, 7);
      else key = '';
      (map[key] = map[key] || []).push(t);
    });
    return Object.entries(map).map(([label, tasks]) => ({ label, tasks }));
  }, [filtered, groupBy]);

  // Pin pinned items to top
  const pinnedTasks = filtered.filter((t) => pinned.has(t.id));
  const sortedRows = pinnedTasks.length > 0 && groupBy === 'flat'
    ? [{ label: '', tasks: pinnedTasks }, { label: '', tasks: filtered.filter((t) => !pinned.has(t.id)) }]
    : grouped;

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Aggregate strip */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
        <Stat label="Open" value={aggregates.open.toString()} />
        <Stat label="Overdue" value={aggregates.overdueN.toString()} tone={aggregates.overdueN > 0 ? 'warn' : undefined} />
        <Stat label="Completed · 30d" value={aggregates.completed30d.toString()} />
        <Stat label="Last activity" value={aggregates.lastTaskAt} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
          {allTasks.length} total task{allTasks.length === 1 ? '' : 's'} on this property
        </span>
      </div>

      {/* Search + filter chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks at this property..."
          className="fad-input"
        />

        {/* Status chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ChipFilter label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <ChipFilter label={`Open (${aggregates.open})`} active={statusFilter === 'open'} onClick={() => setStatusFilter('open')} />
          <ChipFilter label="In progress" active={statusFilter === 'in_progress'} onClick={() => setStatusFilter('in_progress')} />
          <ChipFilter label="Completed" active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} />
          <ChipFilter label="Cancelled" active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')} />
        </div>

        {/* Source chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Source:</span>
          <ChipFilter label="All" active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')} />
          {(['manual', 'breezeway', 'inbox_ai', 'recurring', 'reservation_trigger', 'review'] as TaskSource[]).map((s) => (
            <ChipFilter key={s} label={SOURCE_LABEL[s]} active={sourceFilter === s} onClick={() => setSourceFilter(s)} />
          ))}
        </div>

        {/* Time + group-by */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Time:</span>
            <ChipFilter label="All time" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')} />
            <ChipFilter label="Upcoming" active={timeFilter === 'upcoming'} onClick={() => setTimeFilter('upcoming')} />
            <ChipFilter label="Past 30d" active={timeFilter === 'past_30d'} onClick={() => setTimeFilter('past_30d')} />
            <ChipFilter label="Past 90d" active={timeFilter === 'past_90d'} onClick={() => setTimeFilter('past_90d')} />
          </div>
          <span style={{ flex: 1 }} />
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="fad-input" style={{ width: 'auto' }}>
            <option value="flat">No grouping</option>
            <option value="status">Group by status</option>
            <option value="source">Group by source</option>
            <option value="month">Group by month</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="prop-table" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <SortHead k="dueDate" sort={sort} onToggle={toggleSort}>Date</SortHead>
              <SortHead k="title" sort={sort} onToggle={toggleSort}>Title</SortHead>
              <SortHead k="source" sort={sort} onToggle={toggleSort}>Source</SortHead>
              <SortHead k="assignee" sort={sort} onToggle={toggleSort}>Assignee</SortHead>
              <SortHead k="status" sort={sort} onToggle={toggleSort}>Status</SortHead>
              <SortHead k="updated" sort={sort} onToggle={toggleSort}>Last activity</SortHead>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((group, gi) => (
              <GroupRows
                key={gi}
                label={group.label}
                tasks={group.tasks}
                pinned={pinned}
                expanded={expanded}
                onTogglePin={togglePin}
                onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                No tasks match the current filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Read-only view · task creation + edit lives in Operations module · Phase 2 wires inline create-from-property.
      </p>
    </div>
  );
}

function GroupRows({
  label, tasks, pinned, expanded, onTogglePin, onToggleExpand,
}: {
  label: string;
  tasks: Task[];
  pinned: Set<string>;
  expanded: string | null;
  onTogglePin: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <>
      {label && (
        <tr style={{ background: 'var(--color-background-secondary)' }}>
          <td colSpan={7} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
            {label} · {tasks.length}
          </td>
        </tr>
      )}
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          pinned={pinned.has(t.id)}
          expanded={expanded === t.id}
          onTogglePin={() => onTogglePin(t.id)}
          onToggleExpand={() => onToggleExpand(t.id)}
        />
      ))}
    </>
  );
}

function TaskRow({
  task, pinned, expanded, onTogglePin, onToggleExpand,
}: {
  task: Task;
  pinned: boolean;
  expanded: boolean;
  onTogglePin: () => void;
  onToggleExpand: () => void;
}) {
  const assignee = TASK_USER_BY_ID[task.assigneeIds[0]];
  const overdue = isOverdue(task);

  return (
    <>
      <tr
        className="prop-row"
        onClick={onToggleExpand}
        style={{ background: pinned ? 'rgba(var(--color-brand-accent-rgb, 86, 128, 202), 0.05)' : undefined }}
      >
        <td style={{ width: 28, textAlign: 'center', padding: '6px 0' }} onClick={(e) => { e.stopPropagation(); onTogglePin(); }}>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
              color: pinned ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)',
            }}
            title={pinned ? 'Unpin' : 'Pin to top'}
          >
            {pinned ? '📌' : '📍'}
          </button>
        </td>
        <td className="mono" style={{ fontSize: 11 }}>
          {task.dueDate.slice(5)}
          {overdue && <span style={{ marginLeft: 4, color: 'var(--color-text-warning)', fontSize: 10 }}>⚠</span>}
        </td>
        <td style={{ fontWeight: 500 }}>{task.title}</td>
        <td>
          <span className="chip sm">{SOURCE_LABEL[task.source] ?? task.source}</span>
        </td>
        <td style={{ fontSize: 12 }}>{assignee?.name?.split(' ')[0] ?? '—'}</td>
        <td>
          <span className={`chip sm ${STATUS_TONE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {task.updatedAt.slice(0, 10)}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--color-background-secondary)' }}>
            <ExpandedTaskDetail task={task} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedTaskDetail({ task }: { task: Task }) {
  const description = task.description ?? '';
  const assigneeNames = task.assigneeIds
    .map((id) => TASK_USER_BY_ID[id]?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {description && (
        <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{description}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6 }}>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Department</span>
        <span>{task.department} · {task.subdepartment.replace(/_/g, ' ')}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Priority</span>
        <span>{task.priority}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Assignees</span>
        <span>{assigneeNames || '—'}</span>
        {task.dueTime && <><span style={{ color: 'var(--color-text-tertiary)' }}>Due time</span><span>{task.dueTime}</span></>}
        {task.estimatedMinutes !== undefined && <><span style={{ color: 'var(--color-text-tertiary)' }}>Estimate</span><span>{task.estimatedMinutes} min{task.spentMinutes ? ` · ${task.spentMinutes} spent` : ''}</span></>}
        {task.bzId && <><span style={{ color: 'var(--color-text-tertiary)' }}>Breezeway</span><span className="mono" style={{ fontSize: 11 }}>#{task.bzId}</span></>}
        {task.tags.length > 0 && (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>Tags</span>
            <span>{task.tags.map((t) => <span key={t} className="chip sm" style={{ marginRight: 4 }}>{t}</span>)}</span>
          </>
        )}
        {task.comments.length > 0 && (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>Comments</span>
            <span>{task.comments.length} (latest: {task.comments[task.comments.length - 1]?.text?.slice(0, 60)}...)</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          className="btn ghost sm"
          onClick={() => { window.location.href = `/fad?m=operations&task=${task.id}`; }}
        >
          Open in Operations →
        </button>
        {task.reservationId && (
          <button
            className="btn ghost sm"
            onClick={() => { window.location.href = `/fad?m=reservations&sub=overview&rsv=${task.reservationId}`; }}
          >
            View linked reservation →
          </button>
        )}
        {task.inboxThreadId && (
          <button
            className="btn ghost sm"
            onClick={() => { window.location.href = `/fad?m=inbox&t=${task.inboxThreadId}`; }}
          >
            Open inbox thread →
          </button>
        )}
      </div>
    </div>
  );
}

function ChipFilter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={'chip' + (active ? ' info' : '')}
      style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
    >
      {label}
    </button>
  );
}

function SortHead({ k, sort, onToggle, children }: {
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onToggle: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sort.key === k;
  return (
    <th onClick={() => onToggle(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {children} {active && <span style={{ fontSize: 9 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: tone === 'warn' ? 'var(--color-text-warning)' : undefined }}>{value}</div>
    </div>
  );
}
