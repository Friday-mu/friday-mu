'use client';

/**
 * FAD V2 — Manager/GM desktop · Operations.
 * Ported from the Claude Design export (fad-desktop-screens.jsx · ScreenOps,
 * Donut, TaskTR) — classNames verbatim, CSS lives in gm-desktop.css under
 * `.dwrap`. The design's `<Shell active eyebrow title sub tabs actions panel>`
 * is swapped for `<GmShell …>` (drops the global Topbar/Rail — it already wraps
 * `.dwrap`). The Ask-Friday side panel is shown only when the local `review`
 * state is on (opened by the "Review" button in the Friday bar; closed by the
 * panel's × — wiring the panel to Ask Friday Core is the parallel session's job).
 *
 * Live wiring: donut + today's task table + needs-attention counts come from
 * useApiTasks(); staff-load bars from loadOperationsStaffUsers().
 */

import { useEffect, useMemo, useState } from 'react';
import { PriD, GmShell, FridayBar, AskPanel, type GmTab, type AskMsg } from '../kit';
import { DI } from '../icons';
import { useApiTasks } from '../../../_data/useApiTasks';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../../_data/operationsStaffClient';
import {
  TASK_PROPERTY_BY_CODE,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from '../../../_data/tasks';

/* ── date helpers (local midnight, matches OperationsModule.todayIso) ── */
function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}

const DONE_STATUSES: TaskStatus[] = ['completed', 'closed', 'cancelled'];
// "Open" = active, not-yet-done work. (The brief lists an `open` status, but the
// Task union has no such member — `reported` is the intake-equivalent, so we
// fold it in here and the remaining live statuses.)
const OPEN_STATUSES: TaskStatus[] = ['reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked'];

/* ── status → label + badge tone (mirrors the design's statusTone vocabulary) ── */
const STATUS_LABEL: Record<TaskStatus, string> = {
  reported: 'Reported',
  scheduled: 'Scheduled',
  ready: 'Ready',
  in_progress: 'In progress',
  paused: 'Paused',
  blocked: 'Blocked',
  completed: 'Done',
  closed: 'Closed',
  cancelled: 'Cancelled',
};
const STATUS_TONE: Record<TaskStatus, string> = {
  reported: 'amber',
  scheduled: 'violet',
  ready: 'gray',
  in_progress: 'indigo',
  paused: 'gray',
  blocked: 'red',
  completed: 'green',
  closed: 'green',
  cancelled: 'gray',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/* ── tabs (ids per brief: overview[on] · schedule · all · reported · roster · insights) ── */
const OPS_TABS: Array<{ id: string; l: string }> = [
  { id: 'overview', l: 'Overview' },
  { id: 'schedule', l: 'Schedule' },
  { id: 'all', l: 'All tasks' },
  { id: 'reported', l: 'Reported' },
  { id: 'roster', l: 'Roster' },
  { id: 'insights', l: 'Insights' },
];

/* ─────────────────────────── Donut (ported verbatim) ───────────────────────────
   `total` drives both the ring proportions and the centre figure in the design.
   We keep the signature and add an optional `center` so the ring can stay full
   (total = sum of segments) while the centre reads today's task count. */
interface DonutSeg { v: number; c: string; l: string; }
function Donut({ segs, total, center }: { segs: DonutSeg[]; total: number; center?: number }) {
  let acc = 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const denom = total || 1;
  return (
    <div className="donut">
      <svg viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--line-2)" strokeWidth="14" />
        {segs.map((s, i) => {
          const len = C * (s.v / denom);
          const off = C * (acc / denom);
          acc += s.v;
          return (
            <circle
              key={i}
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke={s.c}
              strokeWidth="14"
              strokeDasharray={len + ' ' + (C - len)}
              strokeDashoffset={-off}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="ctr"><span className="big">{center ?? total}</span><span className="cl">tasks today</span></div>
    </div>
  );
}

/* ─────────────────────────── TaskTR (ported verbatim) ─────────────────────────── */
function TaskTR({ code, addr, title, dept, due, occ, occTone, pri, status, statusTone, who }: {
  code: string; addr: string; title: string; dept: string; due: string;
  occ: string; occTone: string; pri: TaskPriority; status: string; statusTone: string; who: string;
}) {
  return (
    <tr>
      <td><span className="pcodeD">{code}</span></td>
      <td><div className="tt">{title}</div><div className="sub">{dept} · {addr}</div></td>
      <td><span className={'bdg ' + occTone + ' dot'}>{occ}</span></td>
      <td className="mono faint">{due}</td>
      <td><PriD level={pri} /></td>
      <td><span className={'bdg ' + statusTone}>{status}</span></td>
      <td><span className="av1">{who}</span></td>
    </tr>
  );
}

/* ─────────────────────────── Screen ─────────────────────────── */

export function ScreenOps(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { subPage = 'overview', onChangeSubPage } = props;

  // All tasks (no filter) — the overview computes everything from the full set.
  const allFilter = useMemo(() => ({}), []);
  const { tasks, loading, error } = useApiTasks(allFilter);

  // Staff load — HR directory (top 4), bar = (their open-task count / max) * 100.
  const [staff, setStaff] = useState<OperationsStaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setStaffLoading(true);
    loadOperationsStaffUsers()
      .then((users) => { if (alive) { setStaff(users); setStaffError(null); } })
      .catch((e: unknown) => { if (alive) setStaffError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setStaffLoading(false); });
    return () => { alive = false; };
  }, []);

  // Ask-Friday panel: opened by the FridayBar "Review" button, closed by panel ×.
  const [review, setReview] = useState(false);

  const today = todayIso();

  /* ── derived counts (all from real task data) ── */
  const active = tasks.filter((t) => !DONE_STATUSES.includes(t.status));
  const openCount = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
  const overdueCount = overdue.length;
  const urgentCount = active.filter((t) => t.priority === 'urgent').length;
  const doneCount = tasks.filter((t) => t.status === 'completed').length;
  const reportedCount = tasks.filter((t) => t.status === 'reported').length;
  const blockedCount = active.filter((t) => t.status === 'blocked').length;

  const todayList = tasks.filter((t) => t.dueDate === today);
  const todayCount = todayList.length;

  // @demo:logic — Friday-suggested ordering is a stub; real ordering comes from
  // the planner service. For now show the day's tasks in source order. Tag: PROD-GM-OPS-1.
  const todayRows = todayList.slice(0, 6);

  const segs: DonutSeg[] = [
    { v: openCount, c: 'var(--indigo)', l: 'Open' },
    { v: overdueCount, c: 'var(--red)', l: 'Overdue' },
    { v: urgentCount, c: 'var(--amber)', l: 'Urgent' },
    { v: doneCount, c: 'var(--green)', l: 'Done' },
  ];
  const segTotal = segs.reduce((s, x) => s + x.v, 0);

  /* ── staff load bars: open-task count per assignee initials, top 4 ── */
  const loadByInitials = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of active) {
      for (const nm of t.assigneeNames || []) {
        const k = initialsOf(nm);
        m.set(k, (m.get(k) || 0) + 1);
      }
    }
    return m;
  }, [active]);
  const topStaff = staff.slice(0, 4);
  const maxLoad = Math.max(1, ...topStaff.map((s) => loadByInitials.get(s.initials) || 0));

  const tabs: GmTab[] = OPS_TABS.map((t) => ({
    l: t.l,
    on: subPage === t.id,
    ct: t.id === 'reported' && reportedCount > 0 ? reportedCount : undefined,
    onClick: onChangeSubPage ? () => onChangeSubPage(t.id) : undefined,
  }));

  // @demo:ui — static Ask-Friday conversation; the parallel Ask-Friday session
  // wires this to Ask Friday Core. Tag: PROD-GM-ASKPANEL-1.
  const askMsgs: AskMsg[] = [
    { t: "Heavy day — <b>" + todayCount + " tasks</b>. 2 sit behind in-house guests (held urgent-only) and the West store is low on pipe sealant &amp; towels." },
    { me: true, t: 'Reassign the overdue jobs and re-order the low supplies.' },
    {
      t: 'Done — moved 2 admin tasks to the office queue and 1 maintenance job to Matthieu (stand-by). Drafted a supply order.',
      done: '3 tasks reassigned · order drafted',
      action: { t: 'Place supply order', d: 'Pipe sealant ×12, bath towels ×10 to West store — Rs 2,140.', btn: 'Place order' },
    },
  ];
  const panel = review ? (
    <AskPanel
      scope="Operations · Overview"
      aware={`Aware of: today's ${todayCount} tasks, ${topStaff.length} staff on, guest-blocked jobs, supplies at West store.`}
      msgs={askMsgs}
      onClose={() => setReview(false)}
    />
  ) : undefined;

  const actions = (
    <>
      <button className="dbtn ghost" type="button" onClick={() => onChangeSubPage?.('roster')}><DI n="pin" s={1.9} /> Map</button>
      <button className="dbtn primary" type="button"><DI n="plus" s={2} /> New task</button>
    </>
  );

  /* ── loading / error gates (before the data-driven body renders) ── */
  const showLoading = loading && tasks.length === 0;
  const showError = !!error && tasks.length === 0;

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Overview"
      sub={`${new Date(today + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })} · North + West · ${topStaff.length || '—'} staff on`}
      tabs={tabs}
      actions={actions}
      panel={panel}
    >
      {showLoading && (
        <div className="faint mono" style={{ textAlign: 'center', fontSize: 12, marginTop: 40 }}>Loading operations…</div>
      )}

      {showError && (
        <div className="fai" style={{ marginTop: 8 }}>
          <div className="fh"><span className="bdg red"><DI n="x" s={1.6} /> Couldn’t load tasks</span></div>
          <p>{error}</p>
        </div>
      )}

      {!showLoading && !showError && (
        <>
          {/* top row: donut + needs-attention */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 10 }}>
            <div className="donutwrap">
              <Donut segs={segs} total={segTotal} center={todayCount} />
              <div className="dleg">
                {segs.map((s, i) => (
                  <div key={i} className="li">
                    <span className="sw" style={{ background: s.c }} />
                    <div className="col"><span className="lv">{s.v}</span><span className="ll">{s.l}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div className="between">
                <span className="row" style={{ gap: 7, fontWeight: 600, fontSize: 13 }}><DI n="flag" s={1.8} style={{ color: 'var(--amber)' }} /> Needs attention</span>
                <span className="bdg gray">{reportedCount + overdueCount + blockedCount}</span>
              </div>
              <div className="between" style={{ fontSize: 12 }}>
                <span className="dim">Reports to approve</span>
                <span className="row" style={{ gap: 7 }}><span className="bdg amber">{reportedCount}</span><DI n="chevR" s={2} style={{ color: 'var(--tx-3)' }} /></span>
              </div>
              <div className="divider" style={{ height: 1, background: 'var(--line-2)' }} />
              {/* @demo:data — recurring-fault detection is not yet computed from history. Tag: PROD-GM-OPS-2. */}
              <div className="between" style={{ fontSize: 12 }}><span className="dim">Recurring · GBH-C5 pump</span><span className="bdg red dot">fault</span></div>
              <div className="divider" style={{ height: 1, background: 'var(--line-2)' }} />
              <div className="between" style={{ fontSize: 12 }}>
                <span className="dim">Blocked jobs</span>
                <span className="row" style={{ gap: 7 }}><span className="bdg gray">{blockedCount}</span><DI n="chevR" s={2} style={{ color: 'var(--tx-3)' }} /></span>
              </div>
              <div className="divider" style={{ height: 1, background: 'var(--line-2)' }} />
              <div className="between" style={{ fontSize: 12 }}><span className="dim">Overdue · today</span><span className="bdg amber">{overdueCount}</span></div>
            </div>
          </div>

          {/* Friday Daily Brief — slim bar; Review opens the Ask panel */}
          <div style={{ marginTop: 12 }}>
            {/* @demo:ui — brief copy is static; "Apply plan" is not yet wired. Tag: PROD-GM-OPS-3. */}
            <FridayBar
              actions={
                <>
                  <button className="dbtn sm" type="button">Apply plan</button>
                  <button className="dbtn ghost sm" type="button" onClick={() => setReview(true)}>Review <DI n="chevR" s={2} /></button>
                </>
              }
            >
              <b>Friday Daily Brief.</b> {todayCount} task{todayCount === 1 ? '' : 's'} due today · {openCount} open · {overdueCount} overdue · {urgentCount} urgent.
            </FridayBar>
          </div>

          {/* Fix today + Staff load */}
          <div className="grid2" style={{ marginTop: 16, alignItems: 'start' }}>
            <div>
              <div className="dml">Fix today <span className="rule" /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="panel" style={{ padding: 11 }}>
                  <div className="between">
                    <div className="row">
                      <span className="pri urgent"><DI n="flag" s={2} style={{ width: 11, height: 11 }} /></span>
                      <div>
                        <div className="tt" style={{ fontSize: 13 }}>{reportedCount} report{reportedCount === 1 ? '' : 's'} need approval</div>
                        {/* @demo:ui — descriptive sub copy. Tag: PROD-GM-OPS-3. */}
                        <div className="sub">field reports waiting to be vetted</div>
                      </div>
                    </div>
                    <button className="dbtn sm" type="button" onClick={() => onChangeSubPage?.('reported')}>Review</button>
                  </div>
                </div>
                <div className="panel" style={{ padding: 11 }}>
                  <div className="between">
                    <div className="row">
                      <span className="pri high"><DI n="clock" s={2} style={{ width: 11, height: 11 }} /></span>
                      <div>
                        <div className="tt" style={{ fontSize: 13 }}>{overdueCount} task{overdueCount === 1 ? '' : 's'} overdue</div>
                        <div className="sub">past due &amp; still open</div>
                      </div>
                    </div>
                    <button className="dbtn sm" type="button" onClick={() => onChangeSubPage?.('schedule')}>Reassign</button>
                  </div>
                </div>
                <div className="panel" style={{ padding: 11 }}>
                  <div className="between">
                    <div className="row">
                      <span className="pri low"><DI n="more" s={2} style={{ width: 11, height: 11 }} /></span>
                      <div>
                        {/* @demo:data — supplies par-levels are not yet wired. Tag: PROD-GM-OPS-2. */}
                        <div className="tt" style={{ fontSize: 13 }}>Supplies low · West store</div>
                        <div className="sub">pipe sealant · towels below par</div>
                      </div>
                    </div>
                    <button className="dbtn sm" type="button">Order</button>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="dml">Staff load <span className="rule" /></div>
              <div className="panel">
                {staffLoading && <div className="faint mono" style={{ fontSize: 11, padding: '8px 2px', textAlign: 'center' }}>Loading staff…</div>}
                {!staffLoading && staffError && topStaff.length === 0 && (
                  <div className="faint" style={{ fontSize: 12, padding: '8px 2px', textAlign: 'center' }}>Couldn’t load staff — {staffError}</div>
                )}
                {!staffLoading && !staffError && topStaff.length === 0 && (
                  <div className="faint" style={{ fontSize: 12, padding: '8px 2px', textAlign: 'center' }}>No assignable staff.</div>
                )}
                {topStaff.map((s, i) => {
                  const count = loadByInitials.get(s.initials) || 0;
                  const pct = Math.round((count / maxLoad) * 100);
                  const tone = pct >= 85 ? 'over' : pct >= 65 ? 'warn' : '';
                  const zone = s.zone || s.department || '—';
                  return (
                    <div key={s.id} className="zperson" style={{ padding: '7px 0', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
                      <span className="av1">{s.initials}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row between">
                          <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          <span className="faint mono" style={{ fontSize: 9.5, flex: '0 0 auto', marginLeft: 8 }}>{zone}</span>
                        </div>
                        <div className="load"><i className={tone} style={{ width: pct + '%' }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Today's tasks table */}
          <div className="dml">Today’s tasks <span className="ct">{todayRows.length} of {todayCount}</span><span className="rule" /></div>
          <div className="panel" style={{ padding: '12px 4px' }}>
            {todayRows.length === 0 ? (
              <div className="faint" style={{ fontSize: 12.5, padding: '14px 8px', textAlign: 'center' }}>Nothing due today.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr><th>Property</th><th>Task</th><th>Occupancy</th><th>Due</th><th>Pri</th><th>Status</th><th>Who</th></tr>
                </thead>
                <tbody>
                  {todayRows.map((t) => {
                    const prop = TASK_PROPERTY_BY_CODE[t.propertyCode];
                    const who = (t.assigneeNames && t.assigneeNames.length > 0) ? initialsOf(t.assigneeNames[0]) : '—';
                    return (
                      <TaskTR
                        key={t.id}
                        code={t.propertyCode}
                        addr={prop?.name || '—'}
                        title={t.title}
                        dept={t.department}
                        due={t.dueTime || t.dueDate}
                        occ="—"
                        occTone="gray"
                        pri={t.priority}
                        status={STATUS_LABEL[t.status]}
                        statusTone={STATUS_TONE[t.status]}
                        who={who}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </GmShell>
  );
}
