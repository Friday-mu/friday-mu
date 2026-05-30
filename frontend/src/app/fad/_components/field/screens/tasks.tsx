'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { AppHeader, TabBar, MLabel, TaskCard, useFieldNav, fmtDur, type BadgeTone, type TaskCardProps } from '../kit';
import { useApiTasks } from '../../../_data/useApiTasks';
import { TASK_PROPERTY_BY_CODE, type Task, type TaskStatus } from '../../../_data/tasks';

/* ── date helpers (local midnight, matches OperationsModule.todayIso) ── */
function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const DONE_STATUSES: TaskStatus[] = ['completed', 'closed', 'cancelled'];

function srcChip(task: Task): TaskCardProps['source'] {
  if (task.source === 'guesty') return { src: 'gy', label: 'guesty' };
  if (task.source === 'breezeway') return { src: 'bz', label: 'breezeway' };
  return undefined;
}
function accentFor(task: Task): TaskCardProps['accent'] {
  if (task.priority === 'urgent') return 'indigo';
  if (task.priority === 'high') return 'amber';
  return undefined;
}
function cardMeta(task: Task): string[] {
  return [task.department, task.dueTime ? task.dueTime : '']
    .map((m) => (m || '').trim())
    .filter(Boolean);
}

/* ─────────────────────────── My Tasks ─────────────────────────── */

const SEGS: Array<[string, string]> = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Week'], ['all', 'All']];

export function ScreenTasks() {
  const nav = useFieldNav();
  const [seg, setSeg] = useState('today');
  const filter = useMemo(() => ({ assignee: 'me' as const }), []);
  const { tasks, loading, error } = useApiTasks(filter);

  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const weekEnd = addDaysIso(today, 7);

  const active = tasks.filter((t) => !DONE_STATUSES.includes(t.status));
  const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
  const todayList = active.filter((t) => t.dueDate === today);
  const tomorrowList = active.filter((t) => t.dueDate === tomorrow);
  const weekList = active.filter((t) => t.dueDate > tomorrow && t.dueDate <= weekEnd);

  const card = (t: Task) => {
    const prop = TASK_PROPERTY_BY_CODE[t.propertyCode];
    const isOverdue = t.dueDate && t.dueDate < today;
    return (
      <TaskCard
        key={t.id}
        pcode={t.propertyCode}
        addr={prop?.name}
        title={t.title}
        priority={t.priority}
        accent={accentFor(t)}
        meta={cardMeta(t)}
        source={srcChip(t)}
        due={isOverdue ? { tone: 'red' as BadgeTone, label: 'Overdue' } : undefined}
        onClick={() => nav.go('detail', { task: t as unknown as Record<string, unknown> })}
      />
    );
  };

  // group week by day
  const weekDays = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const t of weekList) {
      const arr = byDay.get(t.dueDate) || [];
      arr.push(t);
      byDay.set(t.dueDate, arr);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [weekList]);

  const fmtDay = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="fad">
      <AppHeader eyebrow="MY WORK" title="My Tasks" />
      <div style={{ padding: '0 16px' }}>
        <div className="tabbar-seg">
          {SEGS.map(([k, l]) => (
            <span key={k} className={'tabseg tap' + (seg === k ? ' on' : '')} onClick={() => setSeg(k)}>{l}</span>
          ))}
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="between" style={{ margin: '14px 0 4px' }}>
          <span className="chip on"><Icon n="sparkle" s={1.6} /> Sort: Friday suggested</span>
          <span className="row gap6 faint" style={{ fontSize: 12 }}><Icon n="filter" s={2} /> Filter</span>
        </div>

        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>Loading your tasks…</div>}
        {error && <div className="aigate" style={{ borderColor: 'var(--red-ghost)', background: 'var(--red-ghost)', marginTop: 12 }}><span className="ic" style={{ color: 'var(--red)' }}><Icon n="alert" s={1.9} /></span><span className="tx">Couldn’t load tasks — {error}</span></div>}

        {!loading && !error && seg === 'today' && (<>
          {overdue.length > 0 && (<>
            <MLabel count={overdue.length}>Overdue</MLabel>
            <div className="stack-sm">{overdue.map(card)}</div>
          </>)}
          <MLabel count={todayList.length}>{`Today · ${fmtDay(today)}`}</MLabel>
          <div className="stack-sm">{todayList.length ? todayList.map(card) : <EmptyHint text="Nothing due today — nice." />}</div>
        </>)}

        {!loading && !error && seg === 'tomorrow' && (<>
          <MLabel count={tomorrowList.length}>{`Tomorrow · ${fmtDay(tomorrow)}`}</MLabel>
          <div className="stack-sm">{tomorrowList.length ? tomorrowList.map(card) : <EmptyHint text="Nothing scheduled for tomorrow yet." />}</div>
        </>)}

        {!loading && !error && seg === 'week' && (<>
          <MLabel count={`${weekList.length}`}>This week</MLabel>
          {weekDays.length ? weekDays.map(([day, items]) => (
            <div key={day}>
              <div className="mlabel" style={{ margin: '14px 2px 9px' }}><span>{fmtDay(day)}</span><span className="rule" /></div>
              <div className="stack-sm">{items.map(card)}</div>
            </div>
          )) : <EmptyHint text="The week ahead is clear." />}
        </>)}

        {!loading && !error && seg === 'all' && (<>
          {overdue.length > 0 && (<><MLabel count={overdue.length}>Overdue</MLabel><div className="stack-sm">{overdue.map(card)}</div></>)}
          <MLabel count={todayList.length}>Today</MLabel>
          <div className="stack-sm">{todayList.map(card)}</div>
          {tomorrowList.length > 0 && (<><MLabel count={tomorrowList.length}>Tomorrow</MLabel><div className="stack-sm">{tomorrowList.map(card)}</div></>)}
          {weekDays.map(([day, items]) => (
            <div key={day}>
              <div className="mlabel" style={{ margin: '14px 2px 9px' }}><span>{fmtDay(day)}</span><span className="rule" /></div>
              <div className="stack-sm">{items.map(card)}</div>
            </div>
          ))}
          {active.length === 0 && <EmptyHint text="No open tasks assigned to you." />}
        </>)}

        <div className="faint" style={{ textAlign: 'center', fontSize: 11, marginTop: 16, fontFamily: 'var(--mono)' }}>Tap a task to open it</div>
      </div></div>
      <TabBar active="tasks" />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="faint" style={{ fontSize: 12.5, padding: '10px 2px', textAlign: 'center' }}>{text}</div>;
}

/* ─────────────────────────── History ─────────────────────────── */

export function ScreenHistory() {
  const nav = useFieldNav();
  const filter = useMemo(() => ({ assignee: 'me' as const, status: ['completed'] as TaskStatus[] }), []);
  const { tasks, loading, error } = useApiTasks(filter);

  const today = todayIso();
  const weekAgo = addDaysIso(today, -7);
  const doneThisWeek = tasks.filter((t) => (t.completedAt || '').slice(0, 10) >= weekAgo).length;
  const loggedMin = tasks.reduce((s, t) => s + (t.spentMinutes || 0), 0);
  const withDue = tasks.filter((t) => t.dueDate && t.completedAt);
  const onTime = withDue.length
    ? Math.round((withDue.filter((t) => (t.completedAt || '').slice(0, 10) <= t.dueDate).length / withDue.length) * 100)
    : null;

  // group by completion day, newest first
  const groups = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const t of tasks) {
      const day = (t.completedAt || t.updatedAt || '').slice(0, 10) || 'Earlier';
      const arr = byDay.get(day) || [];
      arr.push(t);
      byDay.set(day, arr);
    }
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [tasks]);

  const fmtDay = (iso: string) => {
    if (iso === today) return `Today · ${new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    if (iso === 'Earlier') return 'Earlier';
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="fad">
      <AppHeader eyebrow="MY WORK" title="History" sub="Completed work · tap to reopen" />
      <div className="fad-body"><div className="fad-scroll">
        <div className="statrow" style={{ marginTop: 4 }}>
          <div className="stat green"><div className="n">{doneThisWeek}</div><div className="l">Done this wk</div></div>
          <div className="stat indigo"><div className="n">{fmtDur(loggedMin * 60)}</div><div className="l">Logged</div></div>
          <div className="stat amber"><div className="n">{onTime == null ? '—' : onTime + '%'}</div><div className="l">On time</div></div>
        </div>

        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>Loading…</div>}
        {error && <EmptyHint text={`Couldn’t load history — ${error}`} />}
        {!loading && !error && groups.length === 0 && <EmptyHint text="No completed tasks yet." />}

        {!loading && !error && groups.map(([day, items]) => (
          <div key={day}>
            <MLabel count={items.length}>{fmtDay(day)}</MLabel>
            <div className="stack-sm">
              {items.map((t) => (
                <HistRow
                  key={t.id}
                  title={t.title}
                  pcode={t.propertyCode}
                  dept={t.department}
                  time={t.spentMinutes ? fmtDur(t.spentMinutes * 60) : '—'}
                  evi={(t.attachmentCount || 0) > 0}
                  onClick={() => nav.go('detail', { task: { ...t, completed: true } as unknown as Record<string, unknown> })}
                />
              ))}
            </div>
          </div>
        ))}
      </div></div>
      <TabBar active="history" />
    </div>
  );
}

function HistRow({ title, pcode, dept, time, evi, onClick }: {
  title: string; pcode: string; dept: string; time: string; evi?: boolean; onClick?: () => void;
}) {
  return (
    <div className={'hrow' + (onClick ? ' tap' : '')} onClick={onClick}>
      <span className="hcheck"><Icon n="check" s={2.6} /></span>
      <div className="h-main">
        <div className="h-title">{title}</div>
        <div className="h-meta">
          <span className="pcode" style={{ padding: '1px 6px', fontSize: 10 }}>{pcode}</span>
          <span>{dept}</span>
          {evi && <span className="h-evi"><Icon n="cam" s={2} /></span>}
        </div>
      </div>
      <div className="h-time">{time}</div>
      <span className="schev faint" style={{ marginLeft: 8, display: 'flex' }}><Icon n="chevR" s={2} /></span>
    </div>
  );
}
