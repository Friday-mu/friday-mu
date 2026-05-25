'use client';

import { FilterBar, FilterChip } from '../FilterBar';
import { iconFor, IconPlus } from '../icons';
import type { ModuleDef } from '../../_data/modules';
import { ModuleHeader } from '../ModuleHeader';
import { useReviewMode } from '../../_data/reviewMode';
import {
  LEGAL_COMPLIANCE,
  LEGAL_CONTRACTS,
  LEGAL_DOCS,
  LEGAL_LICENSES,
  LEGAL_RENEWALS,
  OPS_CLEANS,
  OPS_ROSTER,
  OPS_TICKETS,
  OPS_WEEK,
  OWNER_STATEMENTS,
  OWNERS,
  TASK_DETAIL,
  TASKS,
  type Task,
} from '../../_data/fixtures';
import { useState } from 'react';
import { OwnersInsightsPage } from './owners/OwnersInsightsPage';

// @demo:auth — Tag: PROD-AUTH-5 — see frontend/DEMO_CRUFT.md
// Hardcoded current user. Replace with: useCurrentUser() hook reading
// from auth context (JWT/session) instead of constant.
const CURRENT_USER = 'Ishant';
const TASK_SOURCES = ['Inbox', 'Finance', 'Breezeway', 'Ops', 'CRM', 'Intel'];

type TaskView = 'list' | 'board' | 'today' | 'calendar' | 'property' | 'assignee';

export function TasksModule() {
  const [tab, setTab] = useState('mine');
  const [view, setView] = useState<TaskView>('list');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<'red' | 'amber' | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const filtered = TASKS.filter((t) => {
    if (tab === 'mine' && t.assignee !== CURRENT_USER) return false;
    if (tab === 'today' && t.due !== 'Today' && t.status !== 'overdue') return false;
    if (tab === 'open' && t.status === 'done') return false;
    if (tab === 'unassigned' && t.assignee !== '—') return false;
    if (sourceFilter && t.source !== sourceFilter) return false;
    if (urgencyFilter && t.urgency !== urgencyFilter) return false;
    return true;
  });

  const selected = sel ? TASKS.find((t) => t.id === sel) : null;

  const tabs = [
    { id: 'mine', label: 'Mine', count: TASKS.filter((t) => t.assignee === CURRENT_USER).length },
    { id: 'open', label: 'Open', count: TASKS.filter((t) => t.status !== 'done').length },
    { id: 'today', label: 'Today', count: TASKS.filter((t) => t.due === 'Today' || t.status === 'overdue').length },
    { id: 'all', label: 'All open' },
    { id: 'team', label: 'By team' },
    { id: 'unassigned', label: 'Unassigned' },
  ];

  return (
    <>
      <ModuleHeader
        title="Tasks"
        subtitle="Personal + team to-do, sourced from Inbox, Ops, Finance, CRM"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <>
            <div
              style={{
                display: 'flex',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {(
                [
                  { id: 'list', label: 'List' },
                  { id: 'board', label: 'Board' },
                  { id: 'today', label: 'Today' },
                  { id: 'calendar', label: 'Calendar' },
                  { id: 'property', label: 'By property' },
                  { id: 'assignee', label: 'By assignee' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  className={'btn sm' + (view === v.id ? ' primary' : ' ghost')}
                  onClick={() => setView(v.id)}
                  style={{ borderRadius: 0, border: 0 }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <button className="btn primary sm">
              <IconPlus size={12} /> New task
            </button>
          </>
        }
      />
      
      <div className="fad-module-body">
        <FilterBar
          count={`${filtered.length} of ${TASKS.length}`}
          onClear={
            sourceFilter || urgencyFilter
              ? () => {
                  setSourceFilter(null);
                  setUrgencyFilter(null);
                }
              : undefined
          }
        >
          <FilterChip
            active={urgencyFilter === 'red'}
            dot="red"
            onClick={() => setUrgencyFilter((u) => (u === 'red' ? null : 'red'))}
          >
            Urgent
          </FilterChip>
          <FilterChip
            active={urgencyFilter === 'amber'}
            dot="amber"
            onClick={() => setUrgencyFilter((u) => (u === 'amber' ? null : 'amber'))}
          >
            Priority
          </FilterChip>
          {TASK_SOURCES.map((s) => (
            <FilterChip
              key={s}
              active={sourceFilter === s}
              onClick={() => setSourceFilter((v) => (v === s ? null : s))}
            >
              {s}
            </FilterChip>
          ))}
        </FilterBar>
        {view === 'board' ? (
          <TasksKanban tasks={filtered} onSelect={setSel} selectedId={sel} />
        ) : view === 'today' ? (
          <TasksToday tasks={filtered} onSelect={setSel} selectedId={sel} />
        ) : view === 'calendar' ? (
          <TasksCalendar tasks={filtered} onSelect={setSel} />
        ) : view === 'property' ? (
          <TasksByProperty tasks={filtered} onSelect={setSel} />
        ) : view === 'assignee' ? (
          <TasksByAssignee tasks={filtered} onSelect={setSel} />
        ) : (
          <div className="card">
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                No tasks match.
              </div>
            )}
            {filtered.map((t) => (
            <div
              key={t.id}
              className={'row' + (sel === t.id ? ' selected' : '')}
              style={{ display: 'grid', gridTemplateColumns: '4px 16px 10px 1fr auto', gap: 12 }}
              onClick={() => setSel(t.id)}
            >
              <span
                style={{
                  alignSelf: 'stretch',
                  background:
                    t.status === 'overdue'
                      ? 'var(--color-text-danger)'
                      : t.status === 'progress'
                      ? 'var(--color-brand-accent)'
                      : t.status === 'done'
                      ? 'var(--color-text-success)'
                      : 'var(--color-text-tertiary)',
                  opacity: t.status === 'todo' ? 0.5 : 1,
                  width: 4,
                  marginLeft: -16,
                }}
              />
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid var(--color-border-secondary)',
                  background: t.done ? 'var(--color-brand-accent)' : 'var(--color-background-primary)',
                }}
              />
              <span className={'dot ' + t.urgency} style={{ marginTop: 6 }} />
              <div style={{ minWidth: 0 }}>
                <div className="row-primary" style={{ fontWeight: t.done ? 400 : 500 }}>
                  {t.title}
                </div>
                <div className="row-meta" style={{ marginTop: 2 }}>
                  <span>{t.property}</span>
                  <span className="sep">·</span>
                  <span>{t.assignee}</span>
                  <span className="sep">·</span>
                  <span>{t.source}</span>
                </div>
              </div>
              <span className="row-time">{t.due}</span>
            </div>
          ))}
          </div>
        )}
      </div>
      <TaskDetailPane task={selected} onClose={() => setSel(null)} />
    </>
  );
}

function TasksKanban({
  tasks,
  onSelect,
  selectedId,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const cols: { id: Task['status']; label: string }[] = [
    { id: 'todo', label: 'To do' },
    { id: 'progress', label: 'In progress' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'done', label: 'Done' },
  ];
  return (
    <div className="tasks-kanban">
      {cols.map((c) => {
        const col = tasks.filter((t) => t.status === c.id);
        return (
          <div key={c.id} className="tasks-kanban-col">
            <div className="tasks-kanban-head">
              <span className="tasks-kanban-title">{c.label}</span>
              <span className="tasks-kanban-count">{col.length}</span>
            </div>
            <div className="tasks-kanban-body">
              {col.map((t) => (
                <div
                  key={t.id}
                  className={
                    'tasks-kanban-card ' +
                    t.status +
                    (selectedId === t.id ? ' selected' : '')
                  }
                  onClick={() => onSelect(t.id)}
                >
                  <div className="tasks-kanban-card-title">{t.title}</div>
                  <div className="tasks-kanban-card-meta">
                    <span className={'dot ' + t.urgency} />
                    <span>{t.property}</span>
                    <span className="sep">·</span>
                    <span>{t.source}</span>
                  </div>
                  <div className="tasks-kanban-card-foot">
                    <span className="avatar xs">{t.assignee[0]}</span>
                    <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.due}
                    </span>
                  </div>
                </div>
              ))}
              {col.length === 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    padding: 16,
                  }}
                >
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TasksToday({
  tasks,
  onSelect,
  selectedId,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const groups: { id: string; label: string; list: Task[] }[] = [
    { id: 'overdue', label: 'Overdue', list: tasks.filter((t) => t.status === 'overdue') },
    { id: 'today', label: 'Today', list: tasks.filter((t) => t.due === 'Today' && t.status !== 'overdue') },
    { id: 'tomorrow', label: 'Tomorrow', list: tasks.filter((t) => t.due === 'Tomorrow') },
    { id: 'later', label: 'Later this week', list: tasks.filter((t) => !['Today', 'Tomorrow', 'Yesterday'].includes(t.due) && t.status !== 'overdue' && t.status !== 'done') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map((g) => (
        <div key={g.id}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-text-tertiary)',
              marginBottom: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'baseline',
            }}
          >
            <span>{g.label}</span>
            <span className="mono">{g.list.length}</span>
          </div>
          <div className="card">
            {g.list.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                nothing
              </div>
            )}
            {g.list.map((t) => (
              <div
                key={t.id}
                className={'row' + (selectedId === t.id ? ' selected' : '')}
                onClick={() => onSelect(t.id)}
                style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 12 }}
              >
                <span className={'dot ' + t.urgency} />
                <div>
                  <div className="row-primary" style={{ fontWeight: 500 }}>
                    {t.title}
                  </div>
                  <div className="row-meta">
                    <span>{t.property}</span>
                    <span className="sep">·</span>
                    <span>{t.source}</span>
                  </div>
                </div>
                <span className="avatar xs">{t.assignee[0]}</span>
                <span className="row-time">{t.due}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TasksCalendar({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  // map due strings to relative day offsets (demo bucket)
  const bucketFor = (due: string) => {
    if (due === 'Yesterday') return 'overdue';
    if (due === 'Today') return 'today';
    if (due === 'Tomorrow') return 'tomorrow';
    if (['Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some((d) => due === d)) return 'week';
    if (due === 'Mon') return 'nextWeek';
    if (due === 'Next wk') return 'nextWeek';
    return 'later';
  };
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = 3; // Thursday demo
  const cells = dayNames.map((d, i) => {
    let list: Task[];
    if (i < todayIdx) list = tasks.filter((t) => bucketFor(t.due) === 'overdue');
    else if (i === todayIdx) list = tasks.filter((t) => bucketFor(t.due) === 'today');
    else if (i === todayIdx + 1) list = tasks.filter((t) => bucketFor(t.due) === 'tomorrow');
    else list = tasks.filter((t) => bucketFor(t.due) === 'week').slice(0, 1 + (i % 2));
    return { day: d, list };
  });
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Week view</div>
        <div className="card-subtitle">Apr 14 – Apr 20 · tasks positioned by due</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderTop: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        {dayNames.map((d, i) => (
          <div
            key={d}
            style={{
              padding: '8px 10px',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: i === todayIdx ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)',
              borderRight:
                i < 6 ? '0.5px solid var(--color-border-tertiary)' : 'none',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontWeight: i === todayIdx ? 500 : 400,
              background:
                i === todayIdx ? 'var(--color-brand-accent-softer)' : 'transparent',
            }}
          >
            {d}{' '}
            <span className="mono" style={{ fontSize: 10, marginLeft: 4 }}>
              Apr {14 + i}
            </span>
          </div>
        ))}
        {cells.map((c, i) => (
          <div
            key={c.day + i}
            style={{
              minHeight: 180,
              padding: 6,
              borderRight:
                i < 6 ? '0.5px solid var(--color-border-tertiary)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              background:
                i === todayIdx ? 'var(--color-brand-accent-softer)' : 'transparent',
            }}
          >
            {c.list.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelect(t.id)}
                style={{
                  padding: '6px 8px',
                  background: 'var(--color-background-primary)',
                  borderLeft:
                    '2px solid ' +
                    (t.status === 'overdue'
                      ? 'var(--color-text-danger)'
                      : t.status === 'progress'
                      ? 'var(--color-brand-accent)'
                      : t.status === 'done'
                      ? 'var(--color-text-success)'
                      : 'var(--color-text-tertiary)'),
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: 1.35,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{t.title}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className={'dot ' + t.urgency} style={{ width: 4, height: 4 }} />
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.property} · {t.assignee}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksByProperty({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const groups: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    (groups[t.property] = groups[t.property] || []).push(t);
  });
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {keys.map((k) => (
        <div key={k}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'baseline',
              marginBottom: 6,
              padding: '0 2px',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>{k}</span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
            >
              {groups[k].length} {groups[k].length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <div className="card">
            {groups[k].map((t) => (
              <div
                key={t.id}
                className="row"
                style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 12 }}
                onClick={() => onSelect(t.id)}
              >
                <span className={'dot ' + t.urgency} />
                <div>
                  <div className="row-primary" style={{ fontWeight: 500 }}>
                    {t.title}
                  </div>
                  <div className="row-meta">
                    <span>{t.assignee}</span>
                    <span className="sep">·</span>
                    <span>{t.source}</span>
                  </div>
                </div>
                <span
                  className={
                    'chip ' +
                    (t.status === 'overdue'
                      ? 'warn'
                      : t.status === 'progress'
                      ? 'info'
                      : '')
                  }
                >
                  {t.status}
                </span>
                <span className="row-time">{t.due}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TasksByAssignee({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const groups: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    (groups[t.assignee] = groups[t.assignee] || []).push(t);
  });
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {keys.map((k) => {
        const open = groups[k].filter((t) => t.status !== 'done').length;
        const overdue = groups[k].filter((t) => t.status === 'overdue').length;
        return (
          <div key={k} className="card">
            <div className="card-header">
              <span className="avatar sm">{k[0]}</span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{k}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {open} open
                  {overdue > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span style={{ color: 'var(--color-text-danger)' }}>
                        {overdue} overdue
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
              >
                {groups[k].length}
              </span>
            </div>
            {groups[k].map((t) => (
              <div
                key={t.id}
                className="row"
                style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 10 }}
                onClick={() => onSelect(t.id)}
              >
                <span className={'dot ' + t.urgency} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
                  <div className="row-meta">
                    <span>{t.property}</span>
                    <span className="sep">·</span>
                    <span>{t.source}</span>
                  </div>
                </div>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                >
                  {t.due}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TaskDetailPane({ task, onClose }: { task: Task | null | undefined; onClose: () => void }) {
  const open = !!task;
  const detail = task ? TASK_DETAIL[task.id] : null;
  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: '48px 0 0 0',
            background: 'rgba(15, 24, 54, 0.12)',
            zIndex: 44,
          }}
          onClick={onClose}
        />
      )}
      <aside className={'task-detail-pane' + (open ? ' open' : '')}>
        {task && (
          <>
            <div className="task-detail-header">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className={'dot ' + task.urgency} style={{ marginTop: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{task.title}</div>
                  <div className="row-meta">
                    <span>{task.property}</span>
                    <span className="sep">·</span>
                    <span>{task.assignee}</span>
                    <span className="sep">·</span>
                    <span>due {task.due}</span>
                  </div>
                </div>
                <button className="fad-util-btn" onClick={onClose} title="Close">
                  ×
                </button>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <span
                  className={
                    'chip ' +
                    (task.status === 'overdue'
                      ? 'warn'
                      : task.status === 'progress'
                      ? 'info'
                      : '')
                  }
                >
                  {task.status}
                </span>
                <span className="chip">{task.source}</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn sm">
                  <IconPlus size={12} /> Add to Breezeway
                </button>
                <button className="btn ghost sm">Assign</button>
                <button className="btn ghost sm">Reschedule</button>
                {task.status !== 'done' && (
                  <button className="btn ghost sm">Mark done</button>
                )}
              </div>
            </div>
            <div className="task-detail-body">
              {detail && (
                <>
                  <div className="task-detail-section">
                    <h5>Description</h5>
                    <div style={{ fontSize: 13, lineHeight: 1.55 }}>{detail.description}</div>
                  </div>
                  <div className="task-detail-section">
                    <h5>Linked</h5>
                    {detail.links.map((l, i) => (
                      <div key={i} className="row" style={{ padding: '8px 0', border: 0 }}>
                        <span
                          className="mono"
                          style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 90 }}
                        >
                          {l.kind}
                        </span>
                        <span style={{ fontSize: 13 }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="task-detail-section">
                    <h5>Comments · {detail.comments.length}</h5>
                    {detail.comments.map((c, i) => (
                      <div key={i} className="task-comment">
                        <div className="task-comment-head">
                          <span>{c.who}</span>
                          <span>{c.time}</span>
                        </div>
                        <div>{c.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="task-detail-section">
                    <h5>Activity</h5>
                    {detail.activity.map((a, i) => (
                      <div key={i} className="task-activity">
                        {a.time} · {a.text}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!detail && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    padding: 40,
                  }}
                >
                  No detail recorded yet. Click ⌘K to draft.
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

export function LegalModule() {
  const [tab, setTab] = useState('contracts');
  const tabs = [
    { id: 'contracts', label: 'Contracts' },
    { id: 'renewals', label: 'Renewals' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'documents', label: 'Documents' },
  ];
  return (
    <>
      <ModuleHeader
        title="Legal & Admin"
        subtitle="Contracts, renewals, licenses, compliance"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />
      
      <div className="fad-module-body">
        {tab === 'contracts' && (
          <div className="card">
            {LEGAL_CONTRACTS.map((c, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div className="row-primary">{c.party}</div>
                  <div className="row-meta">
                    {c.kind} · ends {c.ends}
                  </div>
                </div>
                <span
                  className={
                    'chip ' +
                    (c.status === 'renewal due' ? 'warn' : c.status === 'active' ? 'info' : '')
                  }
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === 'renewals' && (
          <div className="card">
            {LEGAL_RENEWALS.map((r, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div className="row-primary">{r.party}</div>
                  <div className="row-meta">
                    {r.kind} · ends {r.ends}
                  </div>
                </div>
                <span className="chip warn">{r.action}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'licenses' && (
          <div className="card">
            {LEGAL_LICENSES.map((l, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div className="row-primary">{l.name}</div>
                  <div className="row-meta">
                    {l.holder} · expires {l.ends}
                  </div>
                </div>
                <span className={'chip ' + (l.status === 'active' ? 'info' : 'warn')}>
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === 'compliance' && <ComplianceCalendar />}
        {tab === 'documents' && (
          <div className="card">
            {LEGAL_DOCS.map((d, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div className="row-primary">{d.name}</div>
                  <div className="row-meta">{d.kind}</div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {d.size}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ComplianceCalendar() {
  const monthsOrder = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const byMonth: Record<string, typeof LEGAL_COMPLIANCE> = {};
  for (const m of monthsOrder) byMonth[m] = [];
  byMonth['Other'] = [];
  for (const c of LEGAL_COMPLIANCE) {
    const match = monthsOrder.find((m) => c.due.startsWith(m));
    if (match) byMonth[match].push(c);
    else byMonth['Other'].push(c);
  }
  return (
    <>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          background: 'var(--color-bg-warning)',
          borderLeft: '2px solid var(--color-text-warning)',
          borderRadius: 4,
          fontSize: 13,
          color: 'var(--color-text-warning)',
        }}
      >
        <strong style={{ fontWeight: 500 }}>3 items open for Mary</strong> — tourist tax Apr filing
        (May 7), trade license renewal (Jun 30), MRA VAT return Q2 (Jul 20).
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {monthsOrder.map((m) => {
          const items = byMonth[m];
          if (!items.length) return null;
          return (
            <div key={m}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 6,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                }}
              >
                <span>{m} 2026</span>
                <span className="mono">{items.length}</span>
              </div>
              <div className="card">
                {items.map((c, i) => (
                  <div key={i} className="row">
                    <span
                      className={
                        'dot ' +
                        (c.status === 'done' ? 'green' : c.status === 'open' ? 'amber' : 'neutral')
                      }
                    />
                    <div style={{ flex: 1 }}>
                      <div className="row-primary">{c.item}</div>
                      <div className="row-meta">
                        <span>{c.kind}</span>
                        <span className="sep">·</span>
                        <span>Owner: {c.owner}</span>
                        <span className="sep">·</span>
                        <span>Due {c.due}</span>
                      </div>
                    </div>
                    <span
                      className={
                        'chip ' +
                        (c.status === 'done' ? 'info' : c.status === 'open' ? 'warn' : '')
                      }
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {byMonth['Other'].length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-tertiary)',
                marginBottom: 6,
              }}
            >
              Done / past
            </div>
            <div className="card">
              {byMonth['Other'].map((c, i) => (
                <div key={i} className="row">
                  <span className="dot green" />
                  <div style={{ flex: 1 }}>
                    <div className="row-primary">{c.item}</div>
                    <div className="row-meta">
                      {c.kind} · {c.owner} · filed {c.due}
                    </div>
                  </div>
                  <span className="chip info">{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function OperationsModule() {
  const [tab, setTab] = useState('today');
  const tabs = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'all', label: 'All tickets' },
    { id: 'roster', label: 'Breezeway roster' },
  ];
  return (
    <>
      <ModuleHeader
        title="Operations"
        subtitle="Cleanings, maintenance, Breezeway roster"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />
      
      <div className="fad-module-body">
        {tab === 'today' && (
          <div className="two-col">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Cleanings today</div>
                <div className="card-subtitle">{OPS_CLEANS.length}</div>
              </div>
              {OPS_CLEANS.map((c, i) => (
                <div key={i} className="row">
                  <span className="dot green" />
                  <div style={{ flex: 1 }}>
                    <div className="row-primary">{c.prop}</div>
                    <div className="row-meta">{c.cleaner}</div>
                  </div>
                  <span className="row-time">{c.time}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Maintenance</div>
                <div className="card-subtitle">{OPS_TICKETS.length}</div>
              </div>
              {OPS_TICKETS.map((t, i) => (
                <div key={i} className="row">
                  <span className={'dot ' + t.urgency} />
                  <div style={{ flex: 1 }}>
                    <div className="row-primary">{t.title}</div>
                    <div className="row-meta">{t.prop}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'week' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Week workload</div>
              <div className="card-subtitle">cleanings + maintenance by day</div>
            </div>
            <div className="card-body">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 12,
                  height: 160,
                  marginBottom: 12,
                }}
              >
                {OPS_WEEK.map((d) => {
                  const max = Math.max(...OPS_WEEK.map((x) => x.cleans + x.maint));
                  const cleanH = (d.cleans / max) * 100;
                  const maintH = (d.maint / max) * 100;
                  return (
                    <div
                      key={d.day}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            background: 'var(--color-text-warning)',
                            height: `${maintH}%`,
                            minHeight: d.maint ? 2 : 0,
                          }}
                        />
                        <div
                          style={{
                            background: 'var(--color-brand-accent)',
                            height: `${cleanH}%`,
                            minHeight: d.cleans ? 2 : 0,
                          }}
                        />
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: d.today
                            ? 'var(--color-brand-accent)'
                            : 'var(--color-text-tertiary)',
                          fontWeight: d.today ? 500 : 400,
                        }}
                      >
                        {d.day}
                      </div>
                      <div className="mono" style={{ fontSize: 10 }}>
                        {d.cleans + d.maint}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{ width: 10, height: 10, background: 'var(--color-brand-accent)' }}
                  />
                  Cleanings
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{ width: 10, height: 10, background: 'var(--color-text-warning)' }}
                  />
                  Maintenance
                </span>
              </div>
            </div>
          </div>
        )}
        {tab === 'all' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">All maintenance tickets</div>
              <div className="card-subtitle">{OPS_TICKETS.length} open</div>
            </div>
            {OPS_TICKETS.map((t, i) => (
              <div key={i} className="row">
                <span className={'dot ' + t.urgency} />
                <div style={{ flex: 1 }}>
                  <div className="row-primary">{t.title}</div>
                  <div className="row-meta">
                    <span>{t.prop}</span>
                    <span className="sep">·</span>
                    <span>Alex</span>
                    <span className="sep">·</span>
                    <span>opened 2d ago</span>
                  </div>
                </div>
                <span
                  className={
                    'chip ' + (t.urgency === 'red' ? 'warn' : t.urgency === 'amber' ? 'warn' : '')
                  }
                >
                  {t.urgency === 'red' ? 'urgent' : t.urgency === 'amber' ? 'priority' : 'routine'}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === 'roster' && (
          <div className="card">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1.6fr 0.8fr 0.8fr 0.8fr',
                gap: 12,
                padding: '10px 16px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span>Member</span>
              <span>Role</span>
              <span>Properties</span>
              <span>Today</span>
              <span>Week</span>
              <span>Status</span>
            </div>
            {OPS_ROSTER.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 1.6fr 0.8fr 0.8fr 0.8fr',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="avatar sm">{r.name[0]}</span>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.role}</span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                >
                  {r.props.join(' · ')}
                </span>
                <span className="mono">{r.today}</span>
                <span className="mono">{r.week}</span>
                <span className={'chip ' + (r.status === 'on-duty' ? 'info' : '')}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function OwnersModule() {
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const tabs = [
    { id: 'all', label: 'All owners' },
    { id: 'statements', label: 'Statements' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'documents', label: 'Documents' },
    { id: 'insights', label: 'Insights' },
  ];
  if (sel) {
    const owner = OWNERS.find((o) => o.name === sel);
    if (owner) return <OwnerDetail owner={owner} onBack={() => setSel(null)} />;
  }
  if (tab === 'insights') {
    return (
      <>
        <ModuleHeader
          title="Owners"
          subtitle="Owner relationships and monthly statements"
          tabs={tabs}
          activeTab={tab}
          onTabChange={setTab}
        />
        <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
          <OwnersInsightsPage />
        </div>
      </>
    );
  }
  return (
    <>
      <ModuleHeader
        title="Owners"
        subtitle="Owner relationships and monthly statements"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />

      <div className="fad-module-body">
        <div className="card">
          {OWNERS.map((o, i) => (
            <div key={i} className="row" onClick={() => setSel(o.name)}>
              <div style={{ flex: 1 }}>
                <div className="row-primary">{o.name}</div>
                <div className="row-meta">
                  {o.props} properties · YTD {o.ytd} · next statement {o.next}
                </div>
              </div>
              <span className={'chip ' + (o.status === 'renewal' ? 'warn' : 'info')}>
                {o.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OwnerDetail({ owner, onBack }: { owner: (typeof OWNERS)[number]; onBack: () => void }) {
  return (
    <>
      <div className="fad-module-header">
        <div className="fad-module-header-main">
          <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 8 }}>
            ← All owners
          </button>
          <h1 className="fad-module-title">{owner.name}</h1>
          <div className="fad-module-subtitle">
            {owner.props} {owner.props === 1 ? 'property' : 'properties'} · YTD {owner.ytd}
          </div>
        </div>
        <div className="fad-module-actions">
          <button className="btn sm">Send statement</button>
          <button className="btn primary sm">New payout</button>
        </div>
      </div>
      <div className="fad-module-body">
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">YTD gross</div>
            <div className="kpi-value">{owner.ytd}</div>
            <div className="kpi-sub">across {owner.props} prop</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Next statement</div>
            <div className="kpi-value">{owner.next}</div>
            <div className="kpi-sub">auto-send enabled</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Agreement status</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {owner.status}
            </div>
            <div className="kpi-sub">review window open</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Docs on file</div>
            <div className="kpi-value">4</div>
            <div className="kpi-sub">contract + KYC</div>
          </div>
        </div>
        <div className="two-col">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent statements</div>
              <div className="card-subtitle">last 3 months</div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="row-primary">Mar 2026</div>
                <div className="row-meta">gross €38,400 · fees €9,960 · net €28,440</div>
              </div>
              <span className="chip info">settled</span>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="row-primary">Feb 2026</div>
                <div className="row-meta">gross €33,200 · fees €8,632 · net €24,568</div>
              </div>
              <span className="chip info">settled</span>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="row-primary">Jan 2026</div>
                <div className="row-meta">gross €28,400 · fees €7,384 · net €21,016</div>
              </div>
              <span className="chip info">settled</span>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Contact</div>
            </div>
            <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Primary:</span> David Cohen
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Email:</span> david@nitzana.co
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Partner since:</span> Mar 2024
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Premium tier — high-touch. Soft launch Apr; full calendar open May.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface PitchSpec {
  icon: string;
  title: string;
  ship: string;
  tagline: string;
  features: { icon: string; title: string; desc: string }[];
}

// @demo:data — Tag: PROD-DATA-18 — see frontend/DEMO_CRUFT.md
// "Coming soon" pitch narratives for pre-launch modules. References
// specific guests/owners (Nitzana, etc.). Replace with: GET /api/cms/pitches
// (or remove module-stub UI entirely once each module ships).
const PITCH_SPECS: Record<string, PitchSpec> = {
  reviews: {
    icon: 'IconReviews',
    title: 'Guest reviews',
    ship: 'soon',
    tagline:
      'Reviews scattered across Airbnb, Booking and direct — no unified view, slow SLA. One inbox, AI-drafted replies in brand voice, sentiment per property.',
    features: [
      { icon: 'IconMail', title: 'Unified inbox', desc: 'All channels — Airbnb, Booking, Google, direct — in one stream with keyboard-first triage.' },
      { icon: 'IconAI', title: 'AI-drafted replies', desc: 'Friday drafts replies honoring your tone and property-specific talking points. You review and send.' },
      { icon: 'IconChart', title: 'Sentiment per property', desc: 'Trend lines per listing so you spot soft spots before they cost stars.' },
      { icon: 'IconBell', title: 'SLA alerts', desc: 'Low-score or negative reviews ping you within minutes — inside Inbox, not buried in tabs.' },
    ],
  },
  guests: {
    icon: 'IconGuests',
    title: 'Guests',
    ship: "Jul '26",
    tagline:
      'A proper guest profile — every stay, every conversation, every preference — so Friday can personalize and your team never re-asks.',
    features: [
      { icon: 'IconBook', title: 'Unified guest profile', desc: 'Consolidated across OTAs by name, email, phone — stays, spend, preferences, language.' },
      { icon: 'IconChat', title: 'Conversation history', desc: 'Every thread ever exchanged with a guest, across any property and any channel.' },
      { icon: 'IconPin', title: 'Preferences memory', desc: "Notes, allergies, kids' ages, early check-in tendencies — Friday recalls on the next booking." },
      { icon: 'IconUsers', title: 'Returning guest flags', desc: 'See at a glance which inquiries are from past guests so you can prioritize accordingly.' },
    ],
  },
  marketing: {
    icon: 'IconMkt',
    title: 'Marketing',
    ship: "Aug '26",
    tagline:
      'Channel mix, campaign attribution and direct-booking growth — the activities Nitzana expects of a premium partner.',
    features: [
      { icon: 'IconSpark', title: 'Campaigns', desc: 'Seasonal offers and packages scheduled across email, social and the direct site — one place.' },
      { icon: 'IconChart', title: 'Channel attribution', desc: 'See which sources actually convert to stays, not just clicks. Spend allocation follows.' },
      { icon: 'IconMail', title: 'Lifecycle emails', desc: 'Welcome, mid-stay, review-ask, winback — templated and triggered on real reservation events.' },
      { icon: 'IconPin', title: 'Direct-booking growth', desc: 'Landing pages, discount codes and tracking so direct stays grow past 22%.' },
    ],
  },
  leads: {
    icon: 'IconLeads',
    title: 'Leads / CRM-lite',
    ship: 'soon',
    tagline:
      "Nitzana's urgent ask: a pipeline for inbound property inquiries — owners, co-investors, B2B — without adopting a heavy CRM.",
    features: [
      { icon: 'IconUsers', title: 'Pipeline stages', desc: 'Inquiry → qualifying → meeting → proposal → won/lost. Drag cards across, or keyboard-triage.' },
      { icon: 'IconMail', title: 'Conversation sync', desc: 'Phase 2 unifies Inbox: lead threads live next to guest threads, polymorphic contact_ref.' },
      { icon: 'IconBook', title: 'Notes + follow-ups', desc: 'Structured notes, next-step dates, owners. Friday nudges what went quiet.' },
      { icon: 'IconChart', title: 'Pipeline metrics', desc: 'Throughput, stage dwell time, win-rate by source. Quiet reports, nothing ambient.' },
    ],
  },
  intelligence: {
    icon: 'IconIntel',
    title: 'Intelligence',
    ship: "Aug '26",
    tagline:
      'Operational telemetry and portfolio reports — the "question Friday can answer" surface. Quiet by default, depth on request.',
    features: [
      { icon: 'IconChart', title: 'Portfolio health', desc: 'Occupancy, ADR, RevPAR, guest-sat trend per property. A single glance, not a dashboard to maintain.' },
      { icon: 'IconSpark', title: 'Question-first', desc: 'Ask Friday any ops question — Friday tool-calls the data layer and renders a scoped view.' },
      { icon: 'IconMail', title: 'Morning digest', desc: 'One cached call per user per morning — the three things worth knowing. Never ambient polling.' },
      { icon: 'IconBook', title: 'Exportable reports', desc: 'PDF and CSV at month-end for owner reviews and board packs.' },
    ],
  },
};

export function PitchModule({ mod }: { mod: ModuleDef }) {
  const spec = PITCH_SPECS[mod.id];
  if (!spec) {
    return <div className="fad-module-body">Pitch spec not found.</div>;
  }
  const HeroIcon = iconFor(spec.icon);
  const review = useReviewMode();
  return (
    <>
      <ModuleHeader title={spec.title} subtitle="Vision preview · feature overview" />
      <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="pitch-wrap">
          <div className="pitch-hero">
            <div className="pitch-icon">
              <HeroIcon size={32} />
            </div>
            <div>
              <h2>
                {spec.title}
                {review && (
                  <>
                    {' '}
                    <span className={'chip ' + (spec.ship === 'soon' ? 'info' : '')}>{spec.ship}</span>
                  </>
                )}
              </h2>
              <p className="pitch-tagline">{spec.tagline}</p>
            </div>
          </div>
          <div className="pitch-grid">
            {spec.features.map((f, i) => {
              const FI = iconFor(f.icon);
              return (
                <div key={i} className="pitch-feature">
                  <div className="pitch-feature-icon">
                    <FI size={16} />
                  </div>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              );
            })}
          </div>
          <div className="pitch-cta">
            <button className="btn primary">Notify me when live</button>
            <button className="btn">View roadmap</button>
          </div>
        </div>
      </div>
    </>
  );
}

interface TeaseSpec {
  tagline: string;
  description: string;
  entities: { name: string; desc: string }[];
  tabs: string[];
  users: string;
  integration: string;
}

// @demo:data — Tag: PROD-DATA-19 — see frontend/DEMO_CRUFT.md
// "Coming soon" tease blurbs for unreleased modules. Hardcoded user
// references ("Ishant only", "Ishant + Franny internal", "until 2028").
// Replace with: GET /api/cms/teases (or remove module-tease UI when shipped).
const TEASE_SPECS: Record<string, TeaseSpec> = {
  syndic: {
    tagline: 'Shared-building management for co-owned properties',
    description:
      'Assemblies, dues, votes, vendor coordination. The funnel upstream of Owner: we sign a building as syndic, then pitch individual unit owners into Friday-managed rentals.',
    entities: [
      { name: 'Buildings', desc: 'physical assets under syndic' },
      { name: 'Units', desc: 'individual apartments, owner-mapped' },
      { name: 'Assemblies', desc: 'general meetings · minutes · attendance' },
      { name: 'Dues ledger', desc: 'monthly fees · arrears · collections' },
      { name: 'Votes', desc: 'motions · quorum · results' },
    ],
    tabs: ['Buildings', 'Dues', 'Assemblies', 'Owner directory'],
    users: 'Friday staff first. Phase 2: unit owners get read-only portal (building-scoped).',
    integration:
      'Unit owners reuse the contacts table. Building-tagged Inbox threads. "Managed units" conversion tracker (Syndic → Owner → Managed funnel).',
  },
  interior: {
    tagline: 'Interior design + furnishing services productized',
    description:
      'The Ohana House-style work as a repeatable business unit. Starts with Friday-managed owners — mood-board a refresh, project-manage the fit-out, track spend vs budget — and expands to third-party clients in Phase 2.',
    entities: [
      { name: 'Projects', desc: 'briefs · timelines · budgets' },
      { name: 'Mood boards', desc: 'visual direction · client sign-off' },
      { name: 'Vendors', desc: 'carpenters · textiles · lighting · imports' },
      { name: 'Fit-out milestones', desc: 'gantt · dependencies · status' },
      { name: 'Financials', desc: 'spend vs budget · invoicing · margin' },
    ],
    tabs: ['Active projects', 'Vendor directory', 'Past projects', 'Financials'],
    users:
      'Ishant + Franny internal. Per-project client-view link for owner (read-only: brief, mood board, milestone status, spend vs budget).',
    integration:
      'Project ↔ Property. Owner = Owner contact. Auto-create Operations tasks on managed-property projects.',
  },
  agency: {
    tagline: 'Real estate agency arm — listings + transactions',
    description:
      'Listings, showings, comparables, offers. Thin scaffold until 2028 — Ishant-only, Notion-depth. Scope dependent on 2027 strategic review.',
    entities: [
      { name: 'Listings', desc: 'properties for sale · asking · days on market' },
      { name: 'Interested parties', desc: 'buyers · tenants · investors' },
      { name: 'Comparables', desc: 'market data · sqm pricing · trend' },
    ],
    tabs: ['Active listings', 'Past transactions', 'Market comps'],
    users: 'Ishant only until 2028.',
    integration:
      'Listings ↔ Properties (or external-property records). Interested parties = contacts table. Notion-scratchpad-thin for 2026.',
  },
};

export function TeaseModule({ mod }: { mod: ModuleDef }) {
  const I = iconFor(mod.icon);
  const spec = TEASE_SPECS[mod.id];
  const review = useReviewMode();
  if (!spec) {
    return (
      <div className="fad-module-body">
        <div className="tease-wrap">
          <div className="tease-icon">
            <I size={24} />
          </div>
          <h2 className="tease-title">
            {mod.label}
            {review && (
              <>
                {' '}
                <span className="chip">{mod.ship}</span>
              </>
            )}
          </h2>
          <p className="tease-desc">Coming later.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <ModuleHeader title={mod.label} subtitle={spec.tagline} />
      <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="pitch-wrap">
          <div className="pitch-hero">
            <div className="pitch-icon">
              <I size={32} />
            </div>
            <div>
              <h2>
                {mod.label}
                {review && (
                  <>
                    {' '}
                    <span
                      className="chip"
                      style={{
                        borderStyle: 'dashed',
                        background: 'transparent',
                      }}
                    >
                      {mod.ship}
                    </span>
                  </>
                )}
              </h2>
              <p className="pitch-tagline">{spec.description}</p>
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-tertiary)',
                marginBottom: 10,
              }}
            >
              Planned tabs
            </div>
            <div
              style={{
                display: 'flex',
                gap: 2,
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                opacity: 0.7,
              }}
            >
              {spec.tabs.map((t, i) => (
                <div
                  key={t}
                  className={'fad-tab' + (i === 0 ? ' active' : '')}
                  style={{ cursor: 'default' }}
                >
                  {t}
                </div>
              ))}
            </div>
            <div
              className="card"
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 13,
                borderStyle: 'dashed',
                background: 'transparent',
              }}
            >
              {review ? `Lands ${mod.ship} · scaffolded UI illustrates structure only` : 'Scaffolded UI illustrates structure only'}
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-tertiary)',
                marginBottom: 10,
              }}
            >
              Key entities
            </div>
            <div className="pitch-grid">
              {spec.entities.map((e, i) => (
                <div key={i} className="pitch-feature">
                  <div className="pitch-feature-icon">
                    <I size={16} />
                  </div>
                  <h4>{e.name}</h4>
                  <p>{e.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="two-col" style={{ marginBottom: 32 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Users</div>
              </div>
              <div className="card-body" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {spec.users}
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Integration with FAD</div>
              </div>
              <div className="card-body" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {spec.integration}
              </div>
            </div>
          </div>

          <div className="pitch-cta">
            <button className="btn primary">Notify me when live</button>
            <button className="btn">View roadmap</button>
          </div>
        </div>
      </div>
    </>
  );
}
