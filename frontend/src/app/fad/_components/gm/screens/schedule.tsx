'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { DI } from '../icons';
import { GmShell, FridayBar, AskPanel, type GmTab } from '../kit';
import { useApiTasks } from '../../../_data/useApiTasks';
import { TASK_PROPERTY_BY_CODE, type Task, type TaskStatus } from '../../../_data/tasks';

/* ── date helpers (local midnight, matches OperationsModule.todayIso) ── */
function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}
const DONE_STATUSES: TaskStatus[] = ['completed', 'closed', 'cancelled'];

/* ── ops tab strip → drives onChangeSubPage; 'schedule' is the active tab ── */
// @demo:ui — Sibling sub-pages (overview/all/approvals/roster/insights) are
// not all built yet; tabs route via onChangeSubPage so the parent decides.
// Tag: PROD-GM-SCHED-TABS-1.
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

interface ScheduledBlock {
  color: BlockColor;
  title: string;
  sub?: string;
  span?: number;
}

/** Single grid cell — empty placeholder, a lunch block, or a scheduled task block. */
function SCell({ block, lunch }: { block?: ScheduledBlock; lunch?: boolean }) {
  if (lunch) {
    return (
      <div className="sgcell">
        <div className="sblock lunch">Lunch</div>
      </div>
    );
  }
  if (!block) return <div className="sgcell" />;
  return (
    <div className="sgcell" style={block.span ? { gridColumn: 'span ' + block.span } : undefined}>
      {/* @demo:logic — drag-to-reschedule not yet persisted. Tag: PROD-GM-SCHED-DRAG-1 */}
      <div className={'sblock ' + block.color}>
        <span className="grip">⠿</span>
        {block.title}
        {block.sub && <span className="sm">{block.sub}</span>}
      </div>
    </div>
  );
}

/* ── derive block colour from the task's department / priority ── */
function blockColor(task: Task): BlockColor {
  if (task.priority === 'urgent' || task.department === 'maintenance') return 'ind';
  // "housekeeping" maps onto the cleaning department in the live schema.
  if (task.department === 'cleaning') return 'grn';
  return 'amb';
}

/* ── hour bucketing ── */
const HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16'];
const LUNCH_HOUR_IDX = HOURS.indexOf('12');
const FALLBACK_HOUR = '09';

/** Map a task's dueTime ("HH:mm" / "HH") to a column index in HOURS, clamped to the grid. */
function hourIndex(task: Task): number {
  const raw = (task.dueTime || '').trim();
  const hh = raw ? raw.slice(0, 2) : FALLBACK_HOUR;
  const idx = HOURS.indexOf(hh);
  if (idx >= 0) return idx;
  // Clamp out-of-range hours to the nearest edge so nothing falls off the grid.
  const n = parseInt(hh, 10);
  if (Number.isFinite(n)) {
    if (n < 8) return 0;
    if (n > 16) return HOURS.length - 1;
  }
  return HOURS.indexOf(FALLBACK_HOUR);
}

/* ── row model ── */
interface GridRow {
  key: string;
  /** Initials chip (staff view) or property code (property view). */
  badge: string;
  /** Full name / property name. */
  name: string;
  isProp: boolean;
  /** One slot per HOURS column: a block, 'lunch', or null. */
  slots: Array<ScheduledBlock | 'lunch' | null>;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resolve the display label(s) for a task's assignee(s). */
function assigneeLabel(task: Task): { key: string; name: string } | null {
  if (task.assigneeNames && task.assigneeNames.length > 0) {
    const name = task.assigneeNames[0];
    const key = task.assigneeIds[0] || name;
    return { key, name };
  }
  if (task.assigneeIds.length > 0) {
    const id = task.assigneeIds[0];
    return { key: id, name: id };
  }
  return null;
}

function placeBlock(slots: Array<ScheduledBlock | 'lunch' | null>, idx: number, block: ScheduledBlock): void {
  // Don't overwrite the protected lunch slot or an already-placed block;
  // walk forward to the next free hour so two jobs at the same hour both show.
  let i = idx;
  while (i < slots.length && slots[i] !== null) i += 1;
  if (i >= slots.length) return;
  slots[i] = block;
}

function emptySlots(): Array<ScheduledBlock | 'lunch' | null> {
  const slots = new Array<ScheduledBlock | 'lunch' | null>(HOURS.length).fill(null);
  slots[LUNCH_HOUR_IDX] = 'lunch';
  return slots;
}

/* ─────────────────────────── Schedule ─────────────────────────── */

type ScheduleView = 'user' | 'prop';

export function ScreenSchedule(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { onChangeSubPage } = props;
  const [view, setView] = useState<ScheduleView>('user');
  const [askOpen, setAskOpen] = useState(false);

  // Empty filter (all tasks) memoised to a stable reference so the cache hook
  // keys consistently and doesn't refetch on every render.
  const { tasks, loading, loaded } = useApiTasks(useMemo(() => ({}), []));

  const today = todayIso();
  const todaysTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.dueDate === today && !DONE_STATUSES.includes(t.status),
      ),
    [tasks, today],
  );

  const unassigned = useMemo(
    () => todaysTasks.filter((t) => t.assigneeIds.length === 0),
    [todaysTasks],
  );

  // ── by-staff rows ──
  const userRows = useMemo<GridRow[]>(() => {
    const map = new Map<string, GridRow>();
    for (const t of todaysTasks) {
      const who = assigneeLabel(t);
      if (!who) continue;
      let row = map.get(who.key);
      if (!row) {
        row = {
          key: who.key,
          badge: initialsFromName(who.name),
          name: who.name,
          isProp: false,
          slots: emptySlots(),
        };
        map.set(who.key, row);
      }
      placeBlock(row.slots, hourIndex(t), {
        color: blockColor(t),
        title: `${t.propertyCode} ${t.title}`.trim(),
        sub: t.department,
      });
    }
    return Array.from(map.values());
  }, [todaysTasks]);

  // ── by-property rows ──
  const propRows = useMemo<GridRow[]>(() => {
    const map = new Map<string, GridRow>();
    for (const t of todaysTasks) {
      const code = t.propertyCode || '—';
      let row = map.get(code);
      if (!row) {
        const prop = TASK_PROPERTY_BY_CODE[code];
        row = {
          key: code,
          badge: code,
          name: prop?.name || code,
          isProp: true,
          slots: emptySlots(),
        };
        map.set(code, row);
      }
      const who = assigneeLabel(t);
      placeBlock(row.slots, hourIndex(t), {
        color: blockColor(t),
        title: who ? `${t.title} · ${initialsFromName(who.name)}` : t.title,
        sub: t.dueTime || t.department,
      });
    }
    return Array.from(map.values());
  }, [todaysTasks]);

  const rows = view === 'prop' ? propRows : userRows;

  /* ── render one row's cells, honouring multi-hour spans ── */
  const renderCells = (row: GridRow) => {
    const out: ReactNode[] = [];
    for (let j = 0; j < row.slots.length; ) {
      const slot = row.slots[j];
      if (slot === 'lunch') {
        out.push(<SCell key={j} lunch />);
        j += 1;
      } else if (slot && typeof slot === 'object') {
        out.push(<SCell key={j} block={slot} />);
        // A spanned block consumes the columns it covers so the row keeps 9 columns.
        j += slot.span && slot.span > 1 ? slot.span : 1;
      } else {
        out.push(<SCell key={j} />);
        j += 1;
      }
    }
    return out;
  };

  // @demo:ui — Ask Friday panel content is static; opened by the draft-plan "Review"
  // button. Wiring to Ask Friday Core is owned by the parallel Ask-Friday session.
  // Tag: PROD-GM-SCHED-ASK-1.
  const panel = askOpen ? (
    <AskPanel
      scope="Operations · Schedule"
      aware={`Aware of: today's ${todaysTasks.length} scheduled jobs across ${rows.length} ${view === 'prop' ? 'properties' : 'staff'}, ${unassigned.length} unassigned, protected lunch.`}
      msgs={[
        {
          t: `Drafted the day — <b>${todaysTasks.length} jobs</b> across ${userRows.length} staff, lunch protected and 0 guest conflicts. ${unassigned.length} job${unassigned.length === 1 ? '' : 's'} still ${unassigned.length === 1 ? 'needs' : 'need'} an owner.`,
        },
        { me: true, t: 'Place the unassigned jobs by zone fit.' },
        {
          t: 'Drafted placements for the unassigned jobs by home-zone and current load — review before applying.',
          done: 'Draft updated',
          action: {
            t: 'Apply schedule draft',
            d: 'Publishes the day to assigned staff and notifies anyone whose plan changed.',
            btn: 'Apply draft',
          },
        },
      ]}
      onClose={() => setAskOpen(false)}
    />
  ) : undefined;

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Schedule"
      sub="Today · draft ready for review"
      tabs={opsTabs(onChangeSubPage)}
      panel={panel}
      actions={
        <>
          {/* @demo:logic — Undo/Clear/Apply mutate a server-side draft once wiring lands. Tag: PROD-GM-SCHED-DRAFT-1 */}
          <button className="dbtn ghost"><DI n="undo" s={1.9} /> Undo</button>
          <button className="dbtn ghost">Clear</button>
          <button className="dbtn primary"><DI n="check" s={2} /> Apply draft</button>
        </>
      }
    >
      {/* slim Friday draft-plan bar — Review opens the Ask panel */}
      {/* @demo:logic — draft plan + Apply/Undo are not yet persisted. Tag: PROD-GM-SCHED-DRAFT-1 */}
      <FridayBar
        badge={<span className="bdg amber">Draft</span>}
        actions={
          <>
            <button className="dbtn primary sm"><DI n="check" s={2} /> Apply</button>
            <button className="dbtn ghost sm"><DI n="undo" s={1.9} /> Undo</button>
            <button className="dbtn ghost sm" onClick={() => setAskOpen(true)}>
              Review <DI n="chevR" s={2} />
            </button>
          </>
        }
      >
        <b>Friday drafted the day.</b> {todaysTasks.length} job{todaysTasks.length === 1 ? '' : 's'} across {userRows.length} staff · lunch protected · 0 guest conflicts.
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
          {/* @demo:ui — week view not built yet. Tag: PROD-GM-SCHED-WEEK-1 */}
          <span className="vs">
            <DI n="cal" s={1.8} /> By staff · week
          </span>
        </div>
        <span className="draghint">
          <span style={{ fontSize: 12 }}>⠿</span> Drag a block to reschedule · drop unscheduled jobs onto the grid
        </span>
      </div>

      {/* the grid */}
      {loading && !loaded ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
          Loading today's schedule…
        </div>
      ) : rows.length === 0 ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12.5 }}>
          No scheduled jobs for today.
        </div>
      ) : (
        <div className="sgrid">
          <div className="sgrow head">
            <div className="sgname faint" style={{ fontWeight: 600 }}>
              {view === 'prop' ? 'Property' : 'Staff'}
            </div>
            {HOURS.map((t, i) => (
              <div key={i} className="sgtime">
                {t}:00
              </div>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="sgrow">
              <div className="sgname">
                {r.isProp ? <span className="pcodeD">{r.badge}</span> : <span className="av1">{r.badge}</span>}{' '}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              </div>
              {renderCells(r)}
            </div>
          ))}
        </div>
      )}

      {/* unassigned dropzone */}
      <div className="dml">
        Unassigned <span className="ct">{unassigned.length} · drag onto the grid</span>
        <span className="rule" />
      </div>
      {/* @demo:logic — drop-to-assign not yet persisted. Tag: PROD-GM-SCHED-DRAG-1 */}
      <div className="dropzone row" style={{ gap: 9, padding: 11, flexWrap: 'wrap' }}>
        {unassigned.length === 0 ? (
          <span className="faint" style={{ fontSize: 11.5, fontFamily: 'var(--mono)' }}>
            Nothing unassigned — every job has an owner.
          </span>
        ) : (
          unassigned.map((t) => (
            <div key={t.id} className="panel" style={{ padding: '8px 11px', flex: '0 0 auto' }}>
              <span className="row" style={{ gap: 9 }}>
                <span className="grip faint">⠿</span>
                <span className="pcodeD">{t.propertyCode}</span> {t.title}{' '}
                <span className="bdg amber">unassigned</span>
              </span>
            </div>
          ))
        )}
        {/* @demo:logic — auto-place is a stubbed AI action. Tag: PROD-GM-SCHED-AUTOPLACE-1 */}
        {unassigned.length > 0 && (
          <button className="dbtn sm ghost">
            <DI n="spark" s={1.7} /> Let Friday place these
          </button>
        )}
      </div>
    </GmShell>
  );
}
