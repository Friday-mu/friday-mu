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

/** Native HTML5 drag only on a fine pointer / desktop width — mirrors the
 *  classic Ops planner (OperationsModule.canUseNativeDrag) so touch users
 *  don't get a broken half-drag. */
function canUseNativeDrag(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: fine) and (min-width: 769px)').matches;
}

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

/* ── schedule grid primitives ── */
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
  let i = idx;
  while (i < slots.length && slots[i] !== null) i += 1;
  if (i >= slots.length) {
    i = slots.findIndex((s) => s === null);
    if (i < 0) return;
  }
  slots[i] = block;
}

/* ── grid cell: empty / lunch / draggable task block; live drop-target highlight ── */
function SCell({
  block, lunch, isDropTarget, dragEnabled,
  onDragOverCell, onDragLeaveCell, onDropCell, onDragStartBlock,
}: {
  block?: ScheduledBlock;
  lunch?: boolean;
  isDropTarget: boolean;
  dragEnabled: boolean;
  onDragOverCell: (e: React.DragEvent) => void;
  onDragLeaveCell: (e: React.DragEvent) => void;
  onDropCell: (e: React.DragEvent) => void;
  onDragStartBlock: (e: React.DragEvent, taskId: string) => void;
}) {
  const cellStyle = isDropTarget
    ? { outline: '2px dashed var(--indigo, #6366f1)', outlineOffset: '-3px', background: 'color-mix(in srgb, var(--indigo, #6366f1) 14%, transparent)', borderRadius: 8 }
    : undefined;
  const drop = { onDragOver: onDragOverCell, onDragLeave: onDragLeaveCell, onDrop: onDropCell };
  if (lunch) return <div className="sgcell" style={cellStyle} {...drop}><div className="sblock lunch">Lunch</div></div>;
  if (!block) return <div className="sgcell" style={cellStyle} {...drop} />;
  return (
    <div className="sgcell" style={cellStyle} {...drop}>
      <div
        className={'sblock ' + block.color}
        draggable={dragEnabled}
        onDragStart={(e) => onDragStartBlock(e, block.taskId)}
        style={dragEnabled ? { cursor: 'grab' } : undefined}
        title={dragEnabled ? 'Drag to another staff row / hour to reschedule' : undefined}
      >
        {dragEnabled && <span className="grip">⠿</span>}
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
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null); // "<rowKey>:<hourIdx>"
  const [saving, setSaving] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  const { tasks, loading, loaded, refetch } = useApiTasks(useMemo(() => ({}), []));
  const { properties } = useLiveProperties();

  // ALL assignable staff (not just those with tasks).
  const [staff, setStaff] = useState<OperationsStaffUser[]>([]);
  useEffect(() => {
    let alive = true;
    loadOperationsStaffUsers().then((u) => { if (alive) setStaff(u); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // drag capability (desktop / fine pointer only), refreshed on resize
  useEffect(() => {
    const refresh = () => setDragEnabled(canUseNativeDrag());
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, []);

  // global dragend cleanup so a released-outside drag never leaves stuck state
  useEffect(() => {
    if (!dragTaskId) return;
    const onEnd = () => { setDragTaskId(null); setDragOverKey(null); };
    window.addEventListener('dragend', onEnd);
    return () => window.removeEventListener('dragend', onEnd);
  }, [dragTaskId]);

  const today = todayIso();
  const todaysTasks = useMemo(
    () => tasks.filter((t) => t.dueDate === today && !DONE_STATUSES.includes(t.status)),
    [tasks, today],
  );
  const unassigned = useMemo(() => todaysTasks.filter((t) => t.assigneeIds.length === 0), [todaysTasks]);

  const blockOf = (t: Task, label: string, sub?: string): ScheduledBlock => ({ taskId: t.id, color: blockColor(t), title: label, sub });

  // ── by-staff rows: one row PER STAFF MEMBER (all of them) ──
  const userRows = useMemo<GridRow[]>(() => {
    const idsOf = (s: OperationsStaffUser) => [s.userId, s.id, s.staffId].filter(Boolean) as string[];
    const rows = staff.map((s) => {
      const slots = emptySlots();
      const mine = todaysTasks.filter((t) => t.assigneeIds.some((a) => idsOf(s).includes(a)));
      for (const t of mine) placeBlock(slots, hourIndex(t), blockOf(t, `${t.propertyCode} ${t.title}`.trim(), t.department));
      return { key: s.userId || s.id, badge: s.initials, name: s.name, isProp: false, slots };
    });
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

  // ── by-property rows: one row per ACTIVE / currently-listed property ──
  const propRows = useMemo<GridRow[]>(() => {
    const active = properties.filter((p) => p.lifecycleStatus === 'live');
    const list = active.length > 0
      ? active.map((p) => ({ code: p.code, name: p.name }))
      : Object.values(TASK_PROPERTY_BY_CODE).map((p) => ({ code: p.code, name: p.name }));
    const byCode = new Map(list.map((p) => [p.code, { key: p.code, badge: p.code, name: p.name, isProp: true, slots: emptySlots() } as GridRow]));
    for (const t of todaysTasks) {
      const code = t.propertyCode || '—';
      const row = byCode.get(code);
      // Only place tasks on listed properties; a task on a delisted property
      // still shows in by-staff view, so nothing is lost.
      if (!row) continue;
      const who = t.assigneeNames?.[0];
      placeBlock(row.slots, hourIndex(t), blockOf(t, who ? `${t.title} · ${initialsFromName(who)}` : t.title, t.dueTime || t.department));
    }
    return Array.from(byCode.values());
  }, [properties, todaysTasks]);

  const rows = view === 'prop' ? propRows : userRows;
  const placedCount = todaysTasks.length - unassigned.length;

  /* ── drag handlers (match the classic Ops planner quality) ── */
  const startDrag = useCallback((e: React.DragEvent, taskId: string) => {
    if (!dragEnabled) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDragTaskId(taskId);
  }, [dragEnabled]);

  const allowDrop = useCallback((e: React.DragEvent, key: string) => {
    if (!dragTaskId || !dragEnabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  }, [dragTaskId, dragEnabled]);

  const leaveDrop = useCallback((e: React.DragEvent, key: string) => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    setDragOverKey((prev) => (prev === key ? null : prev));
  }, []);

  const dropOnCell = useCallback(async (e: React.DragEvent, row: GridRow, hourIdx: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || dragTaskId;
    setDragOverKey(null);
    setDragTaskId(null);
    if (!taskId || saving) return;
    const dueTime = `${HOURS[hourIdx]}:00`;
    const patch = row.isProp
      ? { propertyCode: row.key, dueTime, dueDate: today }
      : { assigneeIds: [row.key], dueTime, dueDate: today };
    setSaving(true);
    try {
      await updateTask({ taskId, patch });
      fireToast(row.isProp ? `Moved to ${row.badge} · ${dueTime}` : `Assigned to ${row.name.split(' ')[0]} · ${dueTime}`);
      refetch();
    } catch (err) {
      fireToast(err instanceof Error ? err.message : 'Could not reschedule');
    } finally {
      setSaving(false);
    }
  }, [dragTaskId, saving, today, refetch]);

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
      sub={`Today · ${staff.length} staff · ${view === 'prop' ? propRows.length + ' listed properties' : userRows.length + ' staff'}`}
      tabs={opsTabs(onChangeSubPage)}
      panel={panel}
      actions={<button className="dbtn ghost" onClick={() => refetch()}><DI n="undo" s={1.9} /> Refresh</button>}
    >
      <FridayBar
        actions={<button className="dbtn ghost sm" onClick={() => setAskOpen(true)}>Review <DI n="chevR" s={2} /></button>}
      >
        <b>{todaysTasks.length} job{todaysTasks.length === 1 ? '' : 's'} today</b> · {placedCount} placed · {unassigned.length} unassigned{dragEnabled ? ' · drag to assign & reschedule' : ''}.
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
        {dragEnabled && (
          <span className="draghint">
            <span style={{ fontSize: 12 }}>⠿</span> Drag a job onto a {view === 'prop' ? 'property' : 'staff'} row &amp; hour{saving ? ' · saving…' : ''}
          </span>
        )}
      </div>

      {/* the grid — all staff / active properties; empty rows shown for visibility */}
      {loading && !loaded ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>Loading today's schedule…</div>
      ) : rows.length === 0 ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
          {view === 'prop' ? 'No listed properties yet.' : 'No staff loaded yet.'}
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
              {r.slots.map((slot, j) => {
                const cellKey = `${r.key}:${j}`;
                return (
                  <SCell
                    key={j}
                    lunch={slot === 'lunch'}
                    block={slot && typeof slot === 'object' ? slot : undefined}
                    isDropTarget={dragOverKey === cellKey}
                    dragEnabled={dragEnabled}
                    onDragOverCell={(e) => allowDrop(e, cellKey)}
                    onDragLeaveCell={(e) => leaveDrop(e, cellKey)}
                    onDropCell={(e) => dropOnCell(e, r, j)}
                    onDragStartBlock={startDrag}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* unassigned — draggable chips */}
      <div className="dml">
        Unassigned <span className="ct">{unassigned.length}{dragEnabled ? ' · drag onto a row' : ''}</span>
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
              style={{ padding: '8px 11px', flex: '0 0 auto', cursor: dragEnabled ? 'grab' : 'default' }}
              draggable={dragEnabled}
              onDragStart={(e) => startDrag(e, t.id)}
              title={dragEnabled ? 'Drag onto a staff row + hour to assign' : undefined}
            >
              <span className="row" style={{ gap: 9 }}>
                {dragEnabled && <span className="grip faint">⠿</span>}
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
