'use client';

/* FAD V2 — Manager/GM desktop · Roster / coverage.
 * Ported from the Claude Design export (fad-desktop-screens.jsx · ScreenRoster +
 * ZPerson + inline Bars), classNames verbatim. CSS lives in gm-desktop.css under
 * .dwrap (.rweek/.rwrow/.rcell/.rbars/.rtoprow/.rreview/.weeksel + .rcell.north/
 * .west/.on/.off/.sb/.leave). The static design `<Shell …>` is replaced with the
 * real <GmShell …>; the roster-agent AskPanel is shown when the local `review`
 * state is on (opened by the FridayBar "Review" button).
 *
 * Wiring: weekStart (Monday ISO) → rosterClient.loadRosterWeek; cells are
 * clickable → cycle availability in local state (optimistic) + debounced
 * saveRosterWeek. Top-row stats/Bars are computed from the live tasks list
 * (useApiTasks) for the loaded week. Publish → publishRosterWeek + toast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DI } from '../icons';
import { AskPanel, FridayBar, GmShell, type GmTab } from '../kit';
import {
  loadRosterWeek,
  saveRosterWeek,
  publishRosterWeek,
  type ApiRosterDay,
  type ApiRosterWeek,
} from '../../../_data/rosterClient';
import {
  AVAILABILITY_LABEL,
  ZONE_LABEL,
  ROSTER_USERS_ORDER,
  type Availability,
  type RosterDay,
  type Zone,
} from '../../../_data/roster';
import { useApiTasks } from '../../../_data/useApiTasks';
import type { Task } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

/* ───────────────────────── date helpers ───────────────────────── */

const DAY_MS = 86_400_000;
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday (ISO yyyy-mm-dd) of the week containing `d`. */
function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  x.setDate(x.getDate() - dow);
  return toIso(x);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(iso: string, n: number): string {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS));
}

/** Seven ISO dates Mon→Sun starting at `weekStart`. */
function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** "25 – 31 May" style range label for the actions week selector / sub. */
function weekLabel(weekStart: string): string {
  const start = parseIso(weekStart);
  const end = parseIso(addDays(weekStart, 6));
  const sm = MONTH_ABBR[start.getMonth()];
  const em = MONTH_ABBR[end.getMonth()];
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${em}`;
  return `${start.getDate()} ${sm} – ${end.getDate()} ${em}`;
}

/* ───────────────────────── cell model ───────────────────────── */

// The design renders six visual cell states. We derive the className + label
// from the real (availability, zone) pair: an "on" day with a zone shows the
// zone (north/west); otherwise the availability drives it. `standby` → `sb`.
type CellState = 'north' | 'west' | 'on' | 'sb' | 'off' | 'leave';

function cellStateOf(day: Pick<ApiRosterDay, 'availability' | 'zone'>): CellState {
  const a = day.availability ?? 'off';
  if (a === 'on') {
    if (day.zone === 'north') return 'north';
    if (day.zone === 'west') return 'west';
    return 'on';
  }
  if (a === 'standby') return 'sb';
  if (a === 'leave') return 'leave';
  return 'off';
}

function cellLabel(state: CellState): string {
  switch (state) {
    case 'north': return ZONE_LABEL.north;
    case 'west': return ZONE_LABEL.west;
    case 'on': return AVAILABILITY_LABEL.on;
    case 'sb': return AVAILABILITY_LABEL.standby;
    case 'off': return AVAILABILITY_LABEL.off;
    case 'leave': return AVAILABILITY_LABEL.leave;
  }
}

// Click cycles through the six states in the order they read in the legend.
const CELL_CYCLE: CellState[] = ['north', 'west', 'on', 'sb', 'off', 'leave'];

function nextCellState(current: CellState): CellState {
  const idx = CELL_CYCLE.indexOf(current);
  return CELL_CYCLE[(idx + 1) % CELL_CYCLE.length];
}

// Fold a visual state back into the (availability, zone) pair the API stores.
function stateToApi(state: CellState): { availability: Availability; zone: Zone | null } {
  switch (state) {
    case 'north': return { availability: 'on', zone: 'north' };
    case 'west': return { availability: 'on', zone: 'west' };
    case 'on': return { availability: 'on', zone: null };
    case 'sb': return { availability: 'standby', zone: null };
    case 'off': return { availability: 'off', zone: null };
    case 'leave': return { availability: 'leave', zone: null };
  }
}

/* A staff row materialised from the loaded week (7 cells Mon→Sun). */
interface StaffRow {
  staffId: string;
  name: string;
  role: string;
  initials: string;
  /** One ApiRosterDay per ISO date in the week (filled blanks for missing days). */
  days: ApiRosterDay[];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '–';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Group the flat ApiRosterWeek.days into one row per staff, aligned to the week. */
function rowsFromWeek(week: ApiRosterWeek | null, weekStart: string): StaffRow[] {
  const dates = weekDates(weekStart);
  if (!week || week.days.length === 0) return [];

  const byStaff = new Map<string, ApiRosterDay[]>();
  const nameByStaff = new Map<string, string>();
  for (const d of week.days) {
    const sid = d.staff_id || d.user_id || d.staff_name || 'unknown';
    if (!byStaff.has(sid)) byStaff.set(sid, []);
    byStaff.get(sid)!.push(d);
    if (d.staff_name && !nameByStaff.has(sid)) nameByStaff.set(sid, d.staff_name);
  }

  // Preserve ROSTER_USERS_ORDER where it overlaps, then append any extras.
  const ordered = [
    ...ROSTER_USERS_ORDER.filter((id) => byStaff.has(id)),
    ...Array.from(byStaff.keys()).filter((id) => !ROSTER_USERS_ORDER.includes(id)),
  ];

  return ordered.map((sid) => {
    const raw = byStaff.get(sid) ?? [];
    const name = nameByStaff.get(sid) || sid;
    const aligned = dates.map<ApiRosterDay>((date) => {
      const found = raw.find((r) => r.date === date);
      return found ?? { staff_id: sid, staff_name: name, date, availability: 'off', zone: null };
    });
    return { staffId: sid, name, role: '', initials: initialsOf(name), days: aligned };
  });
}

/* Convert the local rows back to the RosterDay[] shape saveRosterWeek expects. */
function rowsToRosterDays(rows: StaffRow[]): RosterDay[] {
  return rows.flatMap((row) =>
    row.days.map<RosterDay>((d) => ({
      userId: d.user_id || row.staffId,
      staffId: row.staffId,
      date: d.date || '',
      availability: d.availability ?? 'off',
      zone: (d.zone === 'office' ? null : d.zone) ?? null,
      leaveType: d.leave_type === 'annual' || d.leave_type === 'sick' || d.leave_type === 'personal' ? d.leave_type : undefined,
      startTime: d.start_time ?? null,
      endTime: d.end_time ?? null,
      notes: d.notes ?? undefined,
    })),
  );
}

/* ───────────────────────── task-derived stats ───────────────────────── */

interface BarDatum { label: string; value: number; }
interface WeekStats {
  total: number;
  unassigned: number;
  highPriority: number;
  busiestDay: BarDatum | null;
  topAssignee: BarDatum | null;
  byDay: BarDatum[];
  byDept: BarDatum[];
  byAssignee: BarDatum[];
}

const OPEN_STATUSES = new Set(['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked']);

// @demo:logic — roster stats are computed client-side from the tasks list for
// the loaded week. The authoritative roster-workload aggregation should come
// from the backend (per-week, zone/department rollups) once it lands.
// Tag: PROD-GM-ROSTER-STATS-1.
function computeStats(tasks: Task[], weekStart: string): WeekStats {
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const inWeek = tasks.filter(
    (t) => t.dueDate >= weekStart && t.dueDate <= weekEnd && t.status !== 'cancelled' && (OPEN_STATUSES.has(t.status) || t.status === 'completed' || t.status === 'closed'),
  );

  const dayCounts = new Map<string, number>(dates.map((d) => [d, 0]));
  const deptCounts = new Map<string, number>();
  const asgCounts = new Map<string, number>();
  let unassigned = 0;
  let highPriority = 0;

  for (const t of inWeek) {
    dayCounts.set(t.dueDate, (dayCounts.get(t.dueDate) ?? 0) + 1);
    deptCounts.set(t.department, (deptCounts.get(t.department) ?? 0) + 1);
    if (t.priority === 'high' || t.priority === 'urgent') highPriority += 1;
    const names = t.assigneeNames && t.assigneeNames.length > 0 ? t.assigneeNames : t.assigneeIds;
    if (!names || names.length === 0) {
      unassigned += 1;
    } else {
      for (const n of names) asgCounts.set(n, (asgCounts.get(n) ?? 0) + 1);
    }
  }

  const byDay: BarDatum[] = dates.map((d, i) => ({ label: DAY_ABBR[i], value: dayCounts.get(d) ?? 0 }));
  const byDept: BarDatum[] = Array.from(deptCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const byAssignee: BarDatum[] = [
    ...(unassigned > 0 ? [{ label: 'Unassigned', value: unassigned }] : []),
    ...Array.from(asgCounts.entries()).map(([label, value]) => ({ label, value })),
  ].sort((a, b) => b.value - a.value);

  const busiestDay = byDay.reduce<BarDatum | null>((best, d) => (best && best.value >= d.value ? best : d), null);
  const topAssignee = byAssignee.find((a) => a.label !== 'Unassigned') ?? null;

  return {
    total: inWeek.length,
    unassigned,
    highPriority,
    busiestDay: busiestDay && busiestDay.value > 0 ? busiestDay : null,
    topAssignee,
    byDay,
    byDept,
    byAssignee,
  };
}

const maxOf = (data: BarDatum[]): number => Math.max(1, ...data.map((d) => d.value));

/* Inline Bars (verbatim from the design's local Bars helper). */
function Bars({ data, max }: { data: BarDatum[]; max: number }) {
  return (
    <div className="rbars">
      {data.map((d, i) => (
        <div key={i} className="rbar">
          <span className="bl">{d.label}</span>
          <span className="bt"><i style={{ width: (d.value / max * 100) + '%' }} /></span>
          <span className="bv">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── screen ───────────────────────── */

const SAVE_DEBOUNCE_MS = 800;

export function ScreenRoster(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { onChangeSubPage } = props;

  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(new Date()));
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [status, setStatus] = useState<ApiRosterWeek['status'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [review, setReview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { tasks } = useApiTasks();
  const stats = useMemo(() => computeStats(tasks, weekStart), [tasks, weekStart]);

  // Load the week whenever weekStart changes. loadRosterWeek THROWS for an
  // empty week — catch it and render an empty grid rather than crashing.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEmpty(false);
    loadRosterWeek(weekStart)
      .then((week) => {
        if (!alive) return;
        const built = rowsFromWeek(week, weekStart);
        setRows(built);
        setStatus(week.status);
        setEmpty(built.length === 0);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setStatus(null);
        setEmpty(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [weekStart]);

  // Debounced persistence of the current rows. We keep the latest rows in a ref
  // so the timer always flushes the freshest optimistic state.
  // @demo:logic — cell edits are optimistic; saveRosterWeek is wired but the
  // exact server echo shape is unconfirmed. Tag: PROD-GM-ROSTER-EDIT-1.
  const rowsRef = useRef<StaffRow[]>(rows);
  rowsRef.current = rows;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      saveRosterWeek({ weekStart, days: rowsToRosterDays(rowsRef.current) })
        .catch((e: unknown) => fireToast(`Couldn’t save roster — ${e instanceof Error ? e.message : String(e)}`))
        .finally(() => setSaving(false));
    }, SAVE_DEBOUNCE_MS);
  }, [weekStart]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const cycleCell = useCallback((staffId: string, date: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.staffId !== staffId) return row;
        return {
          ...row,
          days: row.days.map((d) => {
            if (d.date !== date) return d;
            const next = nextCellState(cellStateOf(d));
            const { availability, zone } = stateToApi(next);
            return { ...d, availability, zone };
          }),
        };
      }),
    );
    scheduleSave();
  }, [scheduleSave]);

  const goWeek = useCallback((delta: number) => setWeekStart((w) => addDays(w, delta * 7)), []);
  const goToday = useCallback(() => setWeekStart(mondayOf(new Date())), []);

  const onPublish = useCallback(() => {
    setPublishing(true);
    publishRosterWeek(weekStart)
      .then((week) => {
        setStatus(week.status);
        fireToast('Roster published — staff notified.');
      })
      .catch((e: unknown) => fireToast(`Couldn’t publish — ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setPublishing(false));
  }, [weekStart]);

  const onSaveDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveRosterWeek({ weekStart, days: rowsToRosterDays(rowsRef.current) })
      .then(() => fireToast('Draft saved.'))
      .catch((e: unknown) => fireToast(`Couldn’t save draft — ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setSaving(false));
  }, [weekStart]);

  /* tabs — mirrors the design's opsTabs, wired to onChangeSubPage. */
  const tabs: GmTab[] = [
    { l: 'Overview', onClick: () => onChangeSubPage?.('overview') },
    { l: 'Schedule', onClick: () => onChangeSubPage?.('schedule') },
    { l: 'All tasks', onClick: () => onChangeSubPage?.('tasks') },
    { l: 'Approvals', ct: 3, onClick: () => onChangeSubPage?.('approvals') },
    { l: 'Roster', on: true, onClick: () => onChangeSubPage?.('roster') },
    { l: 'Insights', onClick: () => onChangeSubPage?.('insights') },
  ];

  const activeCount = rows.length;

  // @demo:ui — roster-agent panel copy is static; wiring to Ask Friday Core is
  // owned by the parallel Ask-Friday session. Tag: PROD-GM-ASKPANEL-1.
  const panel = review ? (
    <AskPanel
      scope="Operations · Roster"
      aware={`Aware of: ${stats.total} tasks this week, ${activeCount} staff, zones, weekend fairness, standby/off & night-shift rules.`}
      msgs={[
        { t: `This week has <b>${stats.total} tasks</b>${stats.busiestDay ? ` — ${stats.busiestDay.label} is busiest (${stats.busiestDay.value})` : ''}. <b>${stats.unassigned} are unassigned</b>${stats.topAssignee ? `, ${stats.topAssignee.label} is at ${stats.topAssignee.value}` : ''}.` },
        { me: true, t: 'Balance the week and assign the unassigned tasks fairly.' },
        {
          t: 'Drafted — spread the unassigned tasks across staff by zone fit and pulled jobs off the busiest day. Weekend kept off.',
          done: 'Draft updated · 0 unassigned',
          action: { t: 'Publish roster', d: `Publishes the week to all ${activeCount} staff; notifies anyone whose shift changed.`, btn: 'Publish week' },
        },
      ]}
      onClose={() => setReview(false)}
    />
  ) : undefined;

  const dates = weekDates(weekStart);

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Roster"
      sub={`${weekLabel(weekStart)} · HR directory · ${activeCount} staff`}
      tabs={tabs}
      panel={panel}
      actions={
        <>
          <div className="weeksel">
            <span className="wbtn" onClick={() => goWeek(-1)} style={{ cursor: 'pointer' }}><DI n="chevL" s={2} /></span>
            <span className="wlabel">{weekLabel(weekStart)} <DI n="chevD" s={2.2} style={{ width: 12, height: 12, opacity: .6 }} /></span>
            <span className="wbtn" onClick={() => goWeek(1)} style={{ cursor: 'pointer' }}><DI n="chevR" s={2} /></span>
          </div>
          <button className="dbtn ghost sm" onClick={goToday}>Today</button>
          <button className="dbtn ghost" onClick={onSaveDraft} disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button>
          <button className="dbtn primary" onClick={onPublish} disabled={publishing}><DI n="check" s={2} /> {publishing ? 'Publishing…' : 'Publish'}</button>
        </>
      }
    >
      <FridayBar
        badge={<span className={'bdg ' + (status === 'published' ? 'green' : 'amber')}>{status === 'published' ? 'Published' : 'Draft'}</span>}
        actions={
          <button className="dbtn ghost sm" onClick={() => setReview(true)}>Review <DI n="chevR" s={2} /></button>
        }
      >
        <b>Friday Consult · roster coverage agent.</b> {stats.total} tasks · {stats.unassigned} unassigned{stats.busiestDay ? ` · ${stats.busiestDay.label} busiest` : ''} — ask it to balance, check zone fit or weekend fairness.
      </FridayBar>

      <div className="rtoprow" style={{ marginTop: 14 }}>
        <div className="panel">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 17, color: '#f3f6fb' }}>{stats.total} tasks</div>
            <div className="faint" style={{ fontSize: 11 }}>scheduled {weekLabel(weekStart)}</div>
          </div>
          <div className="rstat3">
            <div className="statc" style={{ padding: '8px 9px' }}><div className="n">{activeCount}</div><div className="l">Active</div></div>
            <div className="statc" style={{ padding: '8px 9px' }}><div className="n">{activeCount}</div><div className="l">Assignable</div></div>
            <div className="statc" style={{ padding: '8px 9px' }}><div className="n" style={{ color: 'var(--tx-3)' }}>0</div><div className="l">No login</div></div>
          </div>
        </div>

        <div className="rreview">
          <span className="bdg gray" style={{ alignSelf: 'flex-start' }}>Review</span>
          {stats.unassigned > 0 && (
            <div className="ri red"><div className="rt">{stats.unassigned} unassigned</div><div className="rd">Assign before publishing.</div></div>
          )}
          {stats.highPriority > 0 && (
            <div className="ri amber"><div className="rt">{stats.highPriority} high priority</div><div className="rd">Check coverage before handoff.</div></div>
          )}
          {stats.busiestDay && (
            <div className="ri"><div className="rt">{stats.busiestDay.label} busiest · {stats.busiestDay.value}{stats.topAssignee ? ` · ${stats.topAssignee.label} top · ${stats.topAssignee.value}` : ''}</div></div>
          )}
          {stats.unassigned === 0 && stats.highPriority === 0 && !stats.busiestDay && (
            <div className="ri"><div className="rt">Nothing flagged</div><div className="rd">No unassigned or high-priority tasks this week.</div></div>
          )}
        </div>

        <div className="panel">
          <div className="dml" style={{ margin: '0 0 4px' }}>Tasks by day <span className="rule" /></div>
          <Bars data={stats.byDay} max={maxOf(stats.byDay)} />
        </div>

        <div className="panel">
          <div className="dml" style={{ margin: '0 0 4px' }}>By department <span className="rule" /></div>
          <Bars data={stats.byDept.length ? stats.byDept : [{ label: '—', value: 0 }]} max={maxOf(stats.byDept)} />
          <div className="dml" style={{ margin: '8px 0 4px' }}>By assignee <span className="rule" /></div>
          <Bars data={(stats.byAssignee.length ? stats.byAssignee : [{ label: '—', value: 0 }]).slice(0, 4)} max={maxOf(stats.byAssignee)} />
        </div>
      </div>

      <div className="between" style={{ margin: '16px 0 8px' }}>
        <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>Tap a cell to change zone or status · colours = zone, maroon = off</span>
        <span className="row" style={{ gap: 10, fontSize: 10.5 }}>
          <span className="faint mono">LEGEND</span>
          <span className="bdg" style={{ background: 'rgba(74,155,118,.15)', color: '#5cc090' }}>North/On</span>
          <span className="bdg" style={{ background: 'rgba(79,114,207,.18)', color: '#8fabf2' }}>West</span>
          <span className="bdg" style={{ background: 'rgba(207,102,96,.13)', color: '#d07d78' }}>Off</span>
        </span>
      </div>

      <div className="rweek" style={{ minWidth: 0 }}>
        <div className="rwrow head">
          <div className="rwname" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>Staff</div>
          {dates.map((d, i) => (
            <div key={i} className="rwhd">{DAY_ABBR[i]}<div className="dd">{parseIso(d).getDate()}</div></div>
          ))}
        </div>

        {loading ? (
          <div className="rwrow"><div className="rwname"><div className="faint" style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>Loading roster…</div></div></div>
        ) : empty || rows.length === 0 ? (
          <div className="rwrow">
            <div className="rwname" style={{ gridColumn: '1 / -1', padding: '22px 13px', justifyContent: 'flex-start' }}>
              <div className="faint" style={{ fontSize: 12.5 }}>
                No roster for this week yet. Use <b>Publish</b> to push a draft, or ask Friday’s coverage agent to draft one.
              </div>
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.staffId} className="rwrow">
              <div className="rwname">
                <span className="av1">{row.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{row.name}</div>
                  {row.role && <div className="rl">{row.role}</div>}
                </div>
              </div>
              {row.days.map((d, j) => {
                const state = cellStateOf(d);
                return (
                  <div key={j} className="rcw">
                    <div className={'rcell ' + state} onClick={() => cycleCell(row.staffId, d.date || dates[j])}>
                      <span className="ed"><DI n="chevD" s={2.4} /></span>{cellLabel(state)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </GmShell>
  );
}
