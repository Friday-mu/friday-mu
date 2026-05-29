'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DI } from '../icons';
import { GmShell, FridayBar, AskPanel, type GmTab } from '../kit';
import { useApiTasks } from '../../../_data/useApiTasks';
import { updateTask } from '../../../_data/tasksClient';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../../_data/operationsStaffClient';
import { useLiveProperties } from '../../../_data/propertiesClient';
import { TASK_PROPERTY_BY_CODE, type Task, type TaskStatus } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

/* ── date helpers (local midnight, matches OperationsModule.todayIso) ── */
function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}
const DONE_STATUSES: TaskStatus[] = ['completed', 'closed', 'cancelled'];

function opsTabs(onChange?: (s: string) => void): GmTab[] {
  const go = (s: string) => () => onChange?.(s);
  return [
    { l: 'Overview', onClick: go('overview') },
    { l: 'Schedule', on: true },
    { l: 'All tasks', onClick: go('all') },
    { l: 'Approvals', ct: 3, onClick: go('approvals') },
    { l: 'Roster', onClick: go('roster') },
    { l: 'Insights', onClick: go('insights') },
  ];
}

/* ── schedule grid primitives (ported from design SCell) ── */
type BlockColor = 'ind' | 'grn' | 'amb';
interface ScheduledBlock { taskId: string; color: BlockColor; title: string; sub?: string; }

function blockColor(task: Task): BlockColor {
  if (task.priority === 'urgent' || task.department === 'maintenance') return 'ind';
  if (task.department === 'cleaning') return 'grn';
  return 'amb';
}

const HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16'];
const LUNCH_HOUR_IDX = HOURS.indexOf('12');
const FALLBACK_HOUR = '09';

function hourIndex(task: Task): number {
  const raw = (task.dueTime || '').trim();
  const hh = raw ? raw.slice(0, 2) : FALLBACK_HOUR;
  const idx = HOURS.indexOf(hh);
  if (idx >= 0) return idx;
  const n = parseInt(hh, 10);
  if (Number.isFinite(n)) {
    if (n < 8) return 0;
    if (n > 16) return HOURS.length - 1;
  }
  return HOURS.indexOf(FALLBACK_HOUR);
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface GridRow {
  key: string;          // staff assignee user-id, or property code
  badge: string;        // initials chip (staff) or property code (property)
  name: string;
  isProp: boolean;
  slots: Array<ScheduledBlock | 'lunch' | null>;
}

function emptySlots(): Array<ScheduledBlock | 'lunch' | null> {
  const slots = new Array<ScheduledBlock | 'lunch' | null>(HOURS.length).fill(null);
  slots[LUNCH_HOUR_IDX] = 'lunch';
  return slots;
}

function placeBlock(slots: Array<ScheduledBlock | 'lunch' | null>, idx: number, block: ScheduledBlock): void {
  // Don't overwrite the protected lunch slot or an already-placed block;
  // walk forward to the next free hour so two jobs at the same hour both show.
  let i = idx;
  while (i < slots.length && slots[i] !== null) i += 1;
  if (i >= slots.length) {
    // grid full from idx onward — try filling any earlier gap so nothing is lost
    i = slots.findIndex((s) => s === null);
    if (i < 0) return;
  }
  slots[i] = block;
}

/* ── grid cell: empty placeholder / lunch / draggable task block, droppable ── */
function SCell({
  block, lunch, hourIdx, onDropTask, onDragBlock,
}: {
  block?: ScheduledBlock;
  lunch?: boolean;
  hourIdx: number;
  onDropTask: (hourIdx: number) => void;
  onDragBlock: (taskId: string) => void;
}) {
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDropTask(hourIdx); },
  };
  if (lunch) {
    return <div className="sgcell" {...dropProps}><div className="sblock lunch">Lunch</div></div>;
  }
  if (!block) return <div className="sgcell" {...dropProps} />;
  return (
    <div className="sgcell" {...dropProps}>
      <div
        className={'sblock ' + block.color}
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.taskId); onDragBlock(block.taskId); }}
        title="Drag to another staff row / hour to reschedule"
      >
        <span className="grip">⠿</span>
        {block.title}
        {block.sub && <span className="sm">{block.sub}</span>}
      </div>
    </div>
  );
}

type ScheduleView = 'user' | 'prop';

export function ScreenSchedule(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { onChangeSubPage } = props;
  const [view, setView] = useState<ScheduleView>('user');
  const [askOpen, setAskOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { tasks, loading, loaded, refetch } = useApiTasks(useMemo(() => ({}), []));
  const { properties } = useLiveProperties();

  // ALL staff (not just those with tasks) — the whole assignable directory.
  const [staff, setStaff] = useState<OperationsStaffUser[]>([]);
  useEffect(() => {
    let alive = true;
    loadOperationsStaffUsers().then((u) => { if (alive) setStaff(u); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const today = todayIso();
  const todaysTasks = useMemo(
    () => tasks.filter((t) => t.dueDate === today && !DONE_STATUSES.includes(t.status)),
    [tasks, today],
  );
  const unassigned = useMemo(() => todaysTasks.filter((t) => t.assigneeIds.length === 0), [todaysTasks]);

  const blockOf = (t: Task, label: string, sub?: string): ScheduledBlock => ({ taskId: t.id, color: blockColor(t), title: label, sub });

  // ── by-staff rows: one row PER STAFF MEMBER (all of them), tasks placed in ──
  const userRows = useMemo<GridRow[]>(() => {
    const idsOf = (s: OperationsStaffUser) => [s.userId, s.id, s.staffId].filter(Boolean) as string[];
    const rows = staff.map((s) => {
      const slots = emptySlots();
      const mine = todaysTasks.filter((t) => t.assigneeIds.some((a) => idsOf(s).includes(a)));
      for (const t of mine) placeBlock(slots, hourIndex(t), blockOf(t, `${t.propertyCode} ${t.title}`.trim(), t.department));
      return { key: s.userId || s.id, badge: s.initials, name: s.name, isProp: false, slots };
    });
    // Surface any assignee that isn't in the staff directory (so no task is hidden).
    const known = new Set(staff.flatMap(idsOf));
    const orphans = new Map<string, GridRow>();
    for (const t of todaysTasks) {
      const a = t.assigneeIds[0];
      if (!a || known.has(a)) continue;
      const nm = t.assigneeNames?.[0] || a;
      let row = orphans.get(a);
      if (!row) { row = { key: a, badge: initialsFromName(nm), name: nm, isProp: false, slots: emptySlots() }; orphans.set(a, row); }
      placeBlock(row.slots, hourIndex(t), blockOf(t, `${t.propertyCode} ${t.title}`.trim(), t.department));
    }
    return [...rows, ...orphans.values()];
  }, [staff, todaysTasks]);

  // ── by-property rows: one row PER PROPERTY (all of them), tasks placed in ──
  const propRows = useMemo<GridRow[]>(() => {
    const list = properties.length > 0
      ? properties.map((p) => ({ code: p.code, name: p.name }))
      : Object.values(TASK_PROPERTY_BY_CODE).map((p) => ({ code: p.code, name: p.name }));
    const byCode = new Map(list.map((p) => [p.code, { key: p.code, badge: p.code, name: p.name, isProp: true, slots: emptySlots() } as GridRow]));
    for (const t of todaysTasks) {
      const code = t.propertyCode || '—';
      let row = byCode.get(code);
      if (!row) { row = { key: code, badge: code, name: TASK_PROPERTY_BY_CODE[code]?.name || code, isProp: true, slots: emptySlots() }; byCode.set(code, row); }
      const who = t.assigneeNames?.[0];
      placeBlock(row.slots, hourIndex(t), blockOf(t, who ? `${t.title} · ${initialsFromName(who)}` : t.title, t.dueTime || t.department));
    }
    return Array.from(byCode.values());
  }, [properties, todaysTasks]);

  const rows = view === 'prop' ? propRows : userRows;
  const placedCount = todaysTasks.length - unassigned.length;

  /* ── drag-to-reschedule / drop-to-assign — persisted via updateTask ── */
  const dropOnRow = useCallback(async (row: GridRow, hourIdx: number) => {
    if (!dragId || saving) return;
    const dueTime = `${HOURS[hourIdx]}:00`;
    const patch = view === 'prop'
      ? { propertyCode: row.key, dueTime, dueDate: today }
      : { assigneeIds: [row.key], dueTime, dueDate: today };
    setSaving(true);
    try {
      await updateTask({ taskId: dragId, patch });
      fireToast(view === 'prop' ? `Moved to ${row.badge} · ${dueTime}` : `Assigned to ${row.name.split(' ')[0]} · ${dueTime}`);
      refetch();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Could not reschedule');
    } finally {
      setSaving(false);
      setDragId(null);
    }
  }, [dragId, saving, view, today, refetch]);

  const panel = askOpen ? (
    <AskPanel
      scope="Operations · Schedule"
      aware={`Aware of: today's ${todaysTasks.length} scheduled jobs across ${rows.length} ${view === 'prop' ? 'properties' : 'staff'}, ${unassigned.length} unassigned, protected lunch.`}
      msgs={[
        { t: `Today: <b>${todaysTasks.length} jobs</b> across ${userRows.length} staff · ${placedCount} placed · ${unassigned.length} unassigned. Drag a job onto a staff row + hour to assign it, or ask me to place them by zone fit.` },
        { me: true, t: 'Place the unassigned jobs by zone fit.' },
        {
          t: 'Drafted placements for the unassigned jobs by home-zone and current load — review before applying.',
          done: 'Draft ready',
          action: { t: 'Apply schedule draft', d: 'Publishes the day to assigned staff and notifies anyone whose plan changed.', btn: 'Apply draft' },
        },
      ]}
      onClose={() => setAskOpen(false)}
    />
  ) : undefined;

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Schedule"
      sub={`Today · ${staff.length} staff · ${view === 'prop' ? propRows.length : userRows.length} rows`}
      tabs={opsTabs(onChangeSubPage)}
      panel={panel}
      actions={<button className="dbtn ghost" onClick={() => refetch()}><DI n="undo" s={1.9} /> Refresh</button>}
    >
      {/* slim Friday bar — Review opens the Ask panel (Ask Friday Core wiring owned by parallel session) */}
      <FridayBar
        actions={<button className="dbtn ghost sm" onClick={() => setAskOpen(true)}>Review <DI n="chevR" s={2} /></button>}
      >
        <b>{todaysTasks.length} job{todaysTasks.length === 1 ? '' : 's'} today</b> · {placedCount} placed · {unassigned.length} unassigned · drag to assign &amp; reschedule.
      </FridayBar>

      {/* view toggle */}
      <div className="between" style={{ margin: '16px 0 9px' }}>
        <div className="vseg">
          <span className={'vs' + (view === 'user' ? ' on' : '')} onClick={() => setView('user')}>
            <DI n="users" s={1.8} /> By staff · day
          </span>
          <span className={'vs' + (view === 'prop' ? ' on' : '')} onClick={() => setView('prop')}>
            <DI n="home" s={1.8} /> By property
          </span>
        </div>
        <span className="draghint">
          <span style={{ fontSize: 12 }}>⠿</span> Drag a job onto a {view === 'prop' ? 'property' : 'staff'} row &amp; hour to {view === 'prop' ? 'move it' : 'assign it'}{saving ? ' · saving…' : ''}
        </span>
      </div>

      {/* the grid — ALL staff / ALL properties, empty rows shown for visibility */}
      {loading && !loaded ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>Loading today's schedule…</div>
      ) : rows.length === 0 ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
          {view === 'prop' ? 'No properties loaded yet.' : 'No staff loaded yet.'}
        </div>
      ) : (
        <div className="sgrid" style={{ maxHeight: '62vh', overflow: 'auto' }}>
          <div className="sgrow head">
            <div className="sgname faint" style={{ fontWeight: 600 }}>{view === 'prop' ? 'Property' : 'Staff'}</div>
            {HOURS.map((t, i) => <div key={i} className="sgtime">{t}:00</div>)}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="sgrow">
              <div className="sgname">
                {r.isProp ? <span className="pcodeD">{r.badge}</span> : <span className="av1">{r.badge}</span>}{' '}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              </div>
              {r.slots.map((slot, j) => (
                <SCell
                  key={j}
                  hourIdx={j}
                  lunch={slot === 'lunch'}
                  block={slot && typeof slot === 'object' ? slot : undefined}
                  onDropTask={(h) => dropOnRow(r, h)}
                  onDragBlock={setDragId}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* unassigned dropzone — draggable chips */}
      <div className="dml">
        Unassigned <span className="ct">{unassigned.length} · drag onto a row</span>
        <span className="rule" />
      </div>
      <div className="dropzone row" style={{ gap: 9, padding: 11, flexWrap: 'wrap' }}>
        {unassigned.length === 0 ? (
          <span className="faint" style={{ fontSize: 11.5, fontFamily: 'var(--mono)' }}>Nothing unassigned — every job has an owner.</span>
        ) : (
          unassigned.map((t) => (
            <div
              key={t.id}
              className="panel"
              style={{ padding: '8px 11px', flex: '0 0 auto', cursor: 'grab' }}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }}
              title="Drag onto a staff row + hour to assign"
            >
              <span className="row" style={{ gap: 9 }}>
                <span className="grip faint">⠿</span>
                <span className="pcodeD">{t.propertyCode}</span> {t.title}{' '}
                <span className="bdg amber">unassigned</span>
              </span>
            </div>
          ))
        )}
      </div>
    </GmShell>
  );
}
