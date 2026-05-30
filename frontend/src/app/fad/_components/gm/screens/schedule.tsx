'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DI } from '../icons';
import { GmShell, FridayBar, AskPanel, type GmTab } from '../kit';
import { useApiTasks } from '../../../_data/useApiTasks';
import { updateTask } from '../../../_data/tasksClient';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../../_data/operationsStaffClient';
import { useLiveProperties } from '../../../_data/propertiesClient';
import { fetchScheduleReservations, type ScheduleReservation } from '../../../_data/reservationsClient';
import { TASK_PROPERTY_BY_CODE, type Task, type TaskStatus } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

/* ──────────────────────────────────────────────────────────────────────────
 * V2 GM Schedule — behaviour ported from the classic Ops planner
 * (modules/OperationsModule.tsx · SchedulePage). Same logic, V2 `.sgrid` skin:
 *   • 4 quadrants  — axis(staff|property) × range(day|week)
 *   • 15-min snap  — cursor-x inside an hour cell → :00/:15/:30/:45 + live tick
 *   • movable lunch — per-staff, draggable within its row (localStorage)
 *   • drop-guards  — occupancy / cross-property / lunch / reported→scheduled
 * No-flash: reads the UNFILTERED task cache; updateTask→replaceTaskInCache
 * patches it in place + notify(), so a moved task re-renders without a refetch
 * (a filtered/page query gets *cleared* on write → the old blank-and-reappear).
 * ────────────────────────────────────────────────────────────────────────── */

/* ── date / time helpers (local-midnight; mirror OperationsModule) ── */
function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const base = new Date(y, (mo || 1) - 1, d || 1);
  base.setDate(base.getDate() + days);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function fmtDay(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return iso;
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
}
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function timeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const m = time.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}
function intervalOverlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}
function taskDurationMinutes(task: Task): number {
  const raw = Number(task.estimatedMinutes || 60);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(480, Math.max(15, Math.ceil(raw / 15) * 15));
}

/* ── occupancy guard (ported, lightly trimmed: drops the risk-flags clause) ── */
function normalizeProp(value: string | null | undefined): string {
  return value?.trim() || 'No property';
}
function resStatusBlocksOps(status: string | null | undefined): boolean {
  return ['confirmed', 'checked_in', 'reserved', 'booked'].includes((status || '').toLowerCase());
}
function resOccupiesDay(r: ScheduleReservation, day: string): boolean {
  if (!resStatusBlocksOps(r.status)) return false;
  if (!r.checkInDate || !r.checkOutDate || !day) return false;
  return r.checkInDate <= day && day < r.checkOutDate;
}
function propertyOccupiedOnDate(code: string | null | undefined, day: string, reservations: ScheduleReservation[]): ScheduleReservation | null {
  const c = normalizeProp(code);
  if (c === 'No property') return null;
  return reservations.find((r) => normalizeProp(r.propertyCode) === c && resOccupiesDay(r, day)) || null;
}
function isGuestUrgentTask(task: Task): boolean {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const guestLinked = Boolean(task.reservationId)
    || ['reported_issue', 'inbox_ai', 'reservation_trigger', 'guesty'].includes(task.source)
    || /guest|client|arrival|blocked|leak|no water|no power|lock|access/.test(text);
  return guestLinked && (task.priority === 'urgent' || task.priority === 'high');
}

/* ── lunch (movable). Classic treats lunch as a constraint window; here it's a
 *  per-staff movable block. Default round-robins the classic windows so the
 *  office isn't all at noon; operators drag it to flex it. ── */
// @demo:config — default lunch windows. Backend: per-tenant roster policy
// (GET /api/ops/roster-policy). Tag: PROD-CONFIG-12.
const LUNCH_DEFAULT_HOURS = [12, 11, 13] as const;
// @demo:state — lunch overrides persisted to localStorage only. Backend:
// mirror on the staff roster + sync (PATCH /api/ops/staff/:id/lunch).
// Tag: PROD-STATE-7.
const LUNCH_LS_KEY = 'fad.schedule.lunchByStaff.v1';
function loadLunchOverrides(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(LUNCH_LS_KEY) || '{}') || {}; } catch { return {}; }
}
function saveLunchOverrides(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LUNCH_LS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** Native HTML5 drag only on a fine pointer / desktop width — so touch users
 *  don't get a broken half-drag (mirrors OperationsModule.canUseNativeDrag). */
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

/* ── grid primitives ── */
type BlockColor = 'ind' | 'grn' | 'amb';
const DONE_STATUSES: TaskStatus[] = ['completed', 'closed', 'cancelled'];
const HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16'];
const FALLBACK_HOUR = '09';

function blockColor(task: Task): BlockColor {
  if (task.priority === 'urgent' || task.department === 'maintenance') return 'ind';
  if (task.department === 'cleaning') return 'grn';
  return 'amb';
}
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
  key: string;     // staff user-id, or property code
  badge: string;   // initials chip (staff) or property code (property)
  name: string;
  isProp: boolean;
  tasks: Task[];   // this row's tasks within the visible range
}
interface DragPreview { key: string; time: string; leftPct: number; }

/* ── draggable task block ── */
function TaskBlock({
  task, label, sub, dragEnabled, onDragStart,
}: {
  task: Task; label: string; sub?: string; dragEnabled: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}) {
  return (
    <div
      className={'sblock ' + blockColor(task)}
      draggable={dragEnabled}
      onDragStart={(e) => onDragStart(e, task.id)}
      style={dragEnabled ? { cursor: 'grab' } : undefined}
      title={dragEnabled ? 'Drag to a row / time to reschedule' : undefined}
    >
      {dragEnabled && <span className="grip">⠿</span>}
      {label}
      {sub && <span className="sm">{sub}</span>}
    </div>
  );
}

type Axis = 'user' | 'prop';
type Range = 'day' | 'week';

export function ScreenSchedule(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { onChangeSubPage } = props;
  const [axis, setAxis] = useState<Axis>('user');
  const [range, setRange] = useState<Range>('day');
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [askOpen, setAskOpen] = useState(false);

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  const [staff, setStaff] = useState<OperationsStaffUser[]>([]);
  const [reservations, setReservations] = useState<ScheduleReservation[]>([]);
  const [lunchOverrides, setLunchOverrides] = useState<Record<string, number>>({});

  // Unfiltered cache — patched in place on write (no blank-and-reappear).
  const { tasks, loading, loaded } = useApiTasks();
  const { properties } = useLiveProperties();

  /* ── range model ── */
  const rangeStep = range === 'week' ? 7 : 1;
  const visibleDays = useMemo(
    () => Array.from({ length: range === 'week' ? 7 : 1 }, (_, i) => addDays(selectedDate, i)),
    [range, selectedDate],
  );
  const rangeStart = visibleDays[0];
  const rangeEnd = visibleDays[visibleDays.length - 1];
  const rangeLabel = range === 'week'
    ? `${fmtDay(rangeStart, { month: 'short', day: 'numeric' })} – ${fmtDay(rangeEnd, { month: 'short', day: 'numeric' })}`
    : fmtDay(selectedDate);

  /* ── loads ── */
  useEffect(() => {
    let alive = true;
    loadOperationsStaffUsers().then((u) => { if (alive) setStaff(u); }).catch(() => {});
    setLunchOverrides(loadLunchOverrides());
    return () => { alive = false; };
  }, []);

  // reservations for the occupancy guard (defensive — guard is skipped if empty)
  useEffect(() => {
    let alive = true;
    fetchScheduleReservations({ from: rangeStart, to: rangeEnd, limit: 500 })
      .then((items) => { if (alive) setReservations(items); })
      .catch(() => { if (alive) setReservations([]); });
    return () => { alive = false; };
  }, [rangeStart, rangeEnd]);

  // drag capability (desktop / fine pointer), refreshed on resize
  useEffect(() => {
    const refresh = () => setDragEnabled(canUseNativeDrag());
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, []);

  // global dragend cleanup so a released-outside drag never leaves stuck state
  useEffect(() => {
    if (!dragTaskId) return;
    const onEnd = () => { setDragTaskId(null); setDragOverKey(null); setDragPreview(null); };
    window.addEventListener('dragend', onEnd);
    return () => window.removeEventListener('dragend', onEnd);
  }, [dragTaskId]);

  /* ── derived task sets ── */
  const inRange = useCallback((d: string | undefined) => Boolean(d) && visibleDays.includes(d as string), [visibleDays]);
  const rangeTasks = useMemo(
    () => tasks.filter((t) => inRange(t.dueDate) && !DONE_STATUSES.includes(t.status)),
    [tasks, inRange],
  );
  // Unassigned = open work that's in-range OR undated (draggable onto the grid).
  const unassigned = useMemo(
    () => tasks.filter((t) => t.assigneeIds.length === 0 && !DONE_STATUSES.includes(t.status) && (inRange(t.dueDate) || !t.dueDate)),
    [tasks, inRange],
  );

  const idsOf = (s: OperationsStaffUser) => [s.userId, s.id, s.staffId].filter(Boolean) as string[];

  // lunch hour for a staff key (override → default by stable index)
  const staffOrder = useMemo(() => staff.map((s) => s.userId || s.id), [staff]);
  const lunchHourOf = useCallback((key: string): number => {
    if (key in lunchOverrides) return lunchOverrides[key];
    const i = staffOrder.indexOf(key);
    return LUNCH_DEFAULT_HOURS[(i < 0 ? 0 : i) % LUNCH_DEFAULT_HOURS.length];
  }, [lunchOverrides, staffOrder]);

  // ── by-staff rows (all staff + orphans from assigned-but-unknown ids) ──
  const userRows = useMemo<GridRow[]>(() => {
    const rows: GridRow[] = staff.map((s) => ({
      key: s.userId || s.id,
      badge: s.initials,
      name: s.name,
      isProp: false,
      tasks: rangeTasks.filter((t) => t.assigneeIds.some((a) => idsOf(s).includes(a))),
    }));
    const known = new Set(staff.flatMap(idsOf));
    const orphans = new Map<string, GridRow>();
    for (const t of rangeTasks) {
      const a = t.assigneeIds[0];
      if (!a || known.has(a)) continue;
      const nm = t.assigneeNames?.[0] || a;
      let row = orphans.get(a);
      if (!row) { row = { key: a, badge: initialsFromName(nm), name: nm, isProp: false, tasks: [] }; orphans.set(a, row); }
      row.tasks.push(t);
    }
    return [...rows, ...orphans.values()];
  }, [staff, rangeTasks]);

  // ── by-property rows (active / currently-listed only) ──
  const propRows = useMemo<GridRow[]>(() => {
    const active = properties.filter((p) => p.lifecycleStatus === 'live');
    const list = active.length > 0
      ? active.map((p) => ({ code: p.code, name: p.name }))
      : Object.values(TASK_PROPERTY_BY_CODE).map((p) => ({ code: p.code, name: p.name }));
    return list.map((p) => ({
      key: p.code,
      badge: p.code,
      name: p.name,
      isProp: true,
      tasks: rangeTasks.filter((t) => (t.propertyCode || '—') === p.code),
    }));
  }, [properties, rangeTasks]);

  const rows = axis === 'prop' ? propRows : userRows;
  const placedCount = rangeTasks.length - rangeTasks.filter((t) => t.assigneeIds.length === 0).length;

  /* ── drag handlers ── */
  const startTaskDrag = useCallback((e: React.DragEvent, taskId: string) => {
    if (!dragEnabled) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDragTaskId(taskId);
    setDragPreview(null);
  }, [dragEnabled]);

  const startLunchDrag = useCallback((e: React.DragEvent, staffKey: string) => {
    if (!dragEnabled) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `lunch:${staffKey}`);
    setDragTaskId(null);
    setDragPreview(null);
  }, [dragEnabled]);

  const allowDrop = useCallback((e: React.DragEvent, key: string) => {
    if (!dragEnabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  }, [dragEnabled]);

  const leaveDrop = useCallback((e: React.DragEvent, key: string) => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    setDragOverKey((prev) => (prev === key ? null : prev));
    setDragPreview((prev) => (prev?.key === key ? null : prev));
  }, []);

  // 15-min snap from cursor-x inside an hour cell → {time, leftPct (centred)}
  const snapInCell = useCallback((e: React.DragEvent, hour: number): { time: string; leftPct: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const slot = Math.min(3, Math.floor(rel * 4)); // 0..3 → :00/:15/:30/:45
    const minute = slot * 15;
    return { time: `${pad2(hour)}:${pad2(minute)}`, leftPct: ((slot * 15 + 7.5) / 60) * 100 };
  }, []);

  const dropOnCell = useCallback(async (e: React.DragEvent, row: GridRow, hourIdx: number | null, day: string) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain');
    setDragOverKey(null);
    setDragPreview(null);
    setDragTaskId(null);
    if (!payload || saving) return;

    // movable lunch — only within the same staff row, day view
    if (payload.startsWith('lunch:')) {
      const staffKey = payload.slice(6);
      if (row.isProp || row.key !== staffKey) { fireToast('Lunch only moves within the same staff row.'); return; }
      if (range !== 'day' || hourIdx == null) return;
      const hour = parseInt(HOURS[hourIdx], 10);
      setLunchOverrides((prev) => { const next = { ...prev, [staffKey]: hour }; saveLunchOverrides(next); return next; });
      fireToast(`Lunch moved to ${pad2(hour)}:00`);
      return;
    }

    const task = tasks.find((t) => t.id === payload);
    if (!task) return;
    const snap = hourIdx != null ? snapInCell(e, parseInt(HOURS[hourIdx], 10)) : null;

    // occupancy guard (skipped if reservations failed to load)
    if (reservations.length) {
      const occ = propertyOccupiedOnDate(task.propertyCode, day, reservations);
      if (occ && !isGuestUrgentTask(task)) {
        fireToast(`${task.propertyCode || 'Property'} is occupied by ${occ.guestName} — schedule non-urgent work after checkout.`);
        return;
      }
    }

    const patch: Parameters<typeof updateTask>[0]['patch'] = {};
    if (row.isProp) {
      // cross-property moves go through the task editor (matches classic)
      if (normalizeProp(task.propertyCode) !== row.key) {
        fireToast('Open the task to change its property before moving it to another property row.');
        return;
      }
      patch.dueDate = day;
      if (range === 'day' && snap) patch.dueTime = snap.time;
    } else {
      patch.dueDate = day;
      patch.assigneeIds = [row.key];
      if (range === 'day' && snap) {
        patch.dueTime = snap.time;
        // lunch overlap → soft warning ("slightly flexible"), still placed
        const lh = lunchHourOf(row.key);
        const start = timeToMinutes(snap.time);
        if (start != null && intervalOverlaps(start, start + taskDurationMinutes(task), lh * 60, lh * 60 + 60)) {
          fireToast(`Heads up — ${row.name.split(' ')[0]} usually lunches ~${pad2(lh)}:00. Scheduled anyway.`);
        }
      }
    }
    if (task.status === 'reported') patch.status = 'scheduled';

    setSaving(true);
    try {
      await updateTask({ taskId: task.id, patch });
      const when = range === 'day' && snap ? ` · ${snap.time}` : ` · ${fmtDay(day, { weekday: 'short' })}`;
      fireToast(row.isProp ? `Moved to ${row.badge}${when}` : `Assigned to ${row.name.split(' ')[0]}${when}`);
    } catch (err) {
      fireToast(err instanceof Error ? err.message : 'Could not reschedule');
    } finally {
      setSaving(false);
    }
  }, [tasks, reservations, range, saving, snapInCell, lunchHourOf]);

  const shiftDate = (dir: -1 | 1) => setSelectedDate(addDays(selectedDate, dir * rangeStep));

  /* ── cell label helpers ── */
  const labelFor = (t: Task): string => axis === 'prop'
    ? (t.assigneeNames?.[0] ? `${t.title} · ${initialsFromName(t.assigneeNames[0])}` : t.title)
    : `${t.propertyCode} ${t.title}`.trim();
  const subFor = (t: Task): string | undefined => axis === 'prop'
    ? (t.dueTime || t.department)
    : (range === 'week' ? (t.dueTime ? `${t.dueTime.slice(0, 5)} · ${t.department}` : t.department) : t.department);

  const panel = askOpen ? (
    <AskPanel
      scope="Operations · Schedule"
      aware={`Aware of: ${rangeTasks.length} jobs across ${range === 'week' ? rangeLabel : 'today'}, ${rows.length} ${axis === 'prop' ? 'properties' : 'staff'}, ${unassigned.length} unassigned, movable lunch.`}
      msgs={[
        { t: `${range === 'week' ? 'This week' : 'Today'}: <b>${rangeTasks.length} jobs</b> across ${userRows.length} staff · ${placedCount} placed · ${unassigned.length} unassigned. Drag a job onto a ${axis === 'prop' ? 'property' : 'staff'} row${range === 'day' ? ' + time (15-min snap)' : ' + day'} to schedule it, or ask me to place the unassigned ones by zone fit.` },
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

  const columns = range === 'week' ? visibleDays : HOURS;

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Schedule"
      sub={`${rangeLabel} · ${staff.length} staff · ${axis === 'prop' ? propRows.length + ' listed properties' : userRows.length + ' staff'}`}
      tabs={opsTabs(onChangeSubPage)}
      panel={panel}
    >
      <FridayBar
        actions={<button className="dbtn ghost sm" onClick={() => setAskOpen(true)}>Review <DI n="chevR" s={2} /></button>}
      >
        <b>{rangeTasks.length} job{rangeTasks.length === 1 ? '' : 's'}</b> · {placedCount} placed · {unassigned.length} unassigned{dragEnabled ? (range === 'day' ? ' · drag to assign & snap to 15 min' : ' · drag to assign across days') : ''}.
      </FridayBar>

      {/* toolbar: date nav + axis toggle + range toggle */}
      <div className="between" style={{ margin: '16px 0 9px', gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <button className="dbtn ghost sm" onClick={() => shiftDate(-1)} aria-label="Previous" title="Previous">‹</button>
          <button className="dbtn ghost sm" onClick={() => setSelectedDate(todayIso())}>Today</button>
          <button className="dbtn ghost sm" onClick={() => shiftDate(1)} aria-label="Next" title="Next">›</button>
          <span style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 4 }}>{rangeLabel}</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="vseg">
            <span className={'vs' + (axis === 'user' ? ' on' : '')} onClick={() => setAxis('user')}><DI n="users" s={1.8} /> By staff</span>
            <span className={'vs' + (axis === 'prop' ? ' on' : '')} onClick={() => setAxis('prop')}><DI n="home" s={1.8} /> By property</span>
          </div>
          <div className="vseg">
            <span className={'vs' + (range === 'day' ? ' on' : '')} onClick={() => setRange('day')}>Day</span>
            <span className={'vs' + (range === 'week' ? ' on' : '')} onClick={() => setRange('week')}>Week</span>
          </div>
        </div>
      </div>
      {dragEnabled && (
        <div className="draghint" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12 }}>⠿</span>
          Drag a job onto a {axis === 'prop' ? 'property' : 'staff'} row{range === 'day' ? ' & hour — releases snap to 15 min' : ' & day'}
          {axis === 'user' && range === 'day' ? ' · drag the Lunch block to move it' : ''}{saving ? ' · saving…' : ''}
        </div>
      )}

      {/* the grid */}
      {loading && !loaded ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>Loading schedule…</div>
      ) : rows.length === 0 ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
          {axis === 'prop' ? 'No listed properties yet.' : 'No staff loaded yet.'}
        </div>
      ) : (
        <div className={'sgrid' + (range === 'week' ? ' wk' : '')} style={{ maxHeight: '62vh', overflow: 'auto' }}>
          <div className="sgrow head">
            <div className="sgname faint" style={{ fontWeight: 600 }}>{axis === 'prop' ? 'Property' : 'Staff'}</div>
            {columns.map((c, i) => (
              <div key={i} className="sgtime">{range === 'week' ? fmtDay(c, { weekday: 'short', day: 'numeric' }) : `${c}:00`}</div>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="sgrow">
              <div className="sgname">
                {r.isProp ? <span className="pcodeD">{r.badge}</span> : <span className="av1">{r.badge}</span>}{' '}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              </div>
              {columns.map((c, j) => {
                const day = range === 'week' ? c : selectedDate;
                const hourIdx = range === 'week' ? null : j;
                const cellKey = range === 'week' ? `${r.key}:w:${c}` : `${r.key}:d:${j}`;
                const cellTasks = range === 'week'
                  ? r.tasks.filter((t) => t.dueDate === c)
                  : r.tasks.filter((t) => hourIndex(t) === j);
                const showLunch = !r.isProp && range === 'day' && lunchHourOf(r.key) === parseInt(HOURS[j], 10);
                const isTarget = dragOverKey === cellKey;
                const showTick = range === 'day' && dragPreview?.key === cellKey;
                return (
                  <div
                    key={j}
                    className="sgcell"
                    style={isTarget ? { outline: '2px dashed var(--indigo, #6366f1)', outlineOffset: '-3px', background: 'color-mix(in srgb, var(--indigo, #6366f1) 14%, transparent)', borderRadius: 8 } : undefined}
                    onDragOver={(e) => {
                      allowDrop(e, cellKey);
                      if (range === 'day' && hourIdx != null && dragTaskId) {
                        const p = snapInCell(e, parseInt(HOURS[hourIdx], 10));
                        setDragPreview({ key: cellKey, time: p.time, leftPct: p.leftPct });
                      }
                    }}
                    onDragLeave={(e) => leaveDrop(e, cellKey)}
                    onDrop={(e) => dropOnCell(e, r, hourIdx, day)}
                  >
                    {(showLunch || cellTasks.length > 0) && (
                      <div className="scellstack">
                        {showLunch && (
                          <div
                            className="sblock lunch"
                            draggable={dragEnabled}
                            onDragStart={(e) => startLunchDrag(e, r.key)}
                            style={dragEnabled ? { cursor: 'grab' } : undefined}
                            title={dragEnabled ? "Drag to move this staff member's lunch" : undefined}
                          >
                            {dragEnabled && <span className="grip">⠿</span>}Lunch<span className="sm">{pad2(lunchHourOf(r.key))}:00</span>
                          </div>
                        )}
                        {cellTasks.map((t) => (
                          <TaskBlock key={t.id} task={t} label={labelFor(t)} sub={subFor(t)} dragEnabled={dragEnabled} onDragStart={startTaskDrag} />
                        ))}
                      </div>
                    )}
                    {showTick && dragPreview && (
                      <>
                        <div className="sgtick" style={{ left: `${dragPreview.leftPct}%` }} aria-hidden />
                        <div className="sgtlabel" style={{ left: `${dragPreview.leftPct}%` }}>{dragPreview.time}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* unassigned — draggable chips (in-range or undated open work) */}
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
              onDragStart={(e) => startTaskDrag(e, t.id)}
              title={dragEnabled ? 'Drag onto a row to schedule & assign' : undefined}
            >
              <span className="row" style={{ gap: 9 }}>
                {dragEnabled && <span className="grip faint">⠿</span>}
                <span className="pcodeD">{t.propertyCode}</span> {t.title}{' '}
                {!t.dueDate && <span className="bdg" style={{ fontSize: 9 }}>no date</span>}
                <span className="bdg amber">unassigned</span>
              </span>
            </div>
          ))
        )}
      </div>
    </GmShell>
  );
}
