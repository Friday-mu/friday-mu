'use client';

// FAD V2 — Manager/GM desktop · Report approvals screen.
//
// Closes the field-staff loop: field reports land as tasks with
// status='reported'; the GM vets each into a scheduled task (approve)
// or drops it (decline). Ported from the Claude Design export
// (fad-desktop-screens.jsx → QRow + ScreenApprovals) — classNames kept
// verbatim against the scoped `.dwrap` CSS in gm-desktop.css.
//
// Wired to /api/tasks via useApiTasks({ status:['reported'] }). The
// approve/decline writes go through updateTask(); the shared tasks
// cache invalidates on write so the row drops out of the list.

import { useMemo, useState } from 'react';
import { DI } from '../icons';
import { GmShell, PriD, type GmTab } from '../kit';
import { updateTask } from '../../../_data/tasksClient';
import { useApiTasks } from '../../../_data/useApiTasks';
import type { Task, TaskStatus, TaskPriority } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

// ── relative-time ──────────────────────────────────────────────────
// Small self-contained "x ago" formatter for report freshness. Pure;
// no shared helper exists to reuse cleanly across the gm screens.
function relTime(iso: string | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ── one report row ─────────────────────────────────────────────────
interface QRowProps {
  urgent: boolean;
  title: string;
  code: string;
  dept: string;
  by: string;
  when: string;
  photos: number;
  pri: TaskPriority;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onEdit: () => void;
}

function QRow({ urgent, title, code, dept, by, when, photos, pri, busy, onApprove, onDecline, onEdit }: QRowProps) {
  return (
    <div className={'qrow' + (urgent ? ' urgent' : '')}>
      <div className="qthumb" />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="tt" style={{ fontSize: 14.5, lineHeight: 1.3 }}>{title}</span>
          <PriD level={pri} />
          {urgent && <span className="bdg red dot">urgent</span>}
        </div>
        <div className="qmeta">
          <span className="pcodeD">{code || '—'}</span>
          <span>{dept}</span>
          <span className="d">·</span>
          <span>by {by}</span>
          <span className="d">·</span>
          <span>{when}</span>
          <span className="d">·</span>
          <span>{photos} photo{photos === 1 ? '' : 's'}</span>
        </div>
        {/* @demo:ui — static "Friday drafted" copy; no AI drafting yet. Tag: PROD-GM-APPROVALS-DRAFT-1 */}
        <div className="gate" style={{ borderStyle: 'solid' }}>
          <span style={{ color: 'var(--indigo-bright)', marginTop: 1 }}><DI n="spark" s={1.7} /></span>
          <span><b>Friday drafted:</b> a task from this report. Review the details, then approve to assign or decline to dismiss.</span>
        </div>
      </div>
      <div className="qactions">
        <button className="dbtn green sm" disabled={busy} onClick={onApprove}>
          <DI n="check" s={2} /> {busy ? 'Saving…' : 'Approve & assign'}
        </button>
        {/* @demo:ui — "Edit draft" opens nothing yet (no draft editor). Tag: PROD-GM-APPROVALS-EDIT-1 */}
        <button className="dbtn ghost sm" disabled={busy} onClick={onEdit}>Edit draft</button>
        <button className="dbtn ghost sm" style={{ color: 'var(--tx-3)' }} disabled={busy} onClick={onDecline}>Decline</button>
      </div>
    </div>
  );
}

// ── screen ─────────────────────────────────────────────────────────
export function ScreenApprovals(props: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  const { onChangeSubPage } = props;

  // Field reports awaiting vetting into tasks.
  const filter = useMemo(() => ({ status: ['reported'] as TaskStatus[] }), []);
  const { tasks, loading, loaded, error, refetch } = useApiTasks(filter);

  // Per-task in-flight guard so a row can't be double-actioned.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const setBusy = (id: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const pendingCount = tasks.length;
  const urgentCount = tasks.filter((t) => t.priority === 'urgent').length;

  const act = (taskId: string, status: TaskStatus, okMsg: string) => {
    if (busyIds.has(taskId)) return;
    setBusy(taskId, true);
    updateTask({ taskId, patch: { status } })
      .then(() => fireToast(okMsg))
      .catch((e) => fireToast(`Couldn’t save — ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(taskId, false));
  };

  const approve = (t: Task) => act(t.id, 'scheduled', 'Approved');
  const decline = (t: Task) => act(t.id, 'cancelled', 'Declined');

  // Convert the design's opsTabs into the GmShell tab model. Approvals
  // is the live tab here; the rest hand back to the parent sub-router.
  const tabs: GmTab[] = [
    { l: 'Overview', onClick: () => onChangeSubPage?.('overview') },
    { l: 'Schedule', onClick: () => onChangeSubPage?.('schedule') },
    { l: 'All tasks', onClick: () => onChangeSubPage?.('all') },
    { l: 'Approvals', ct: pendingCount, on: true },
    { l: 'Roster', onClick: () => onChangeSubPage?.('roster') },
    { l: 'Insights', onClick: () => onChangeSubPage?.('insights') },
  ];

  const actions = (
    <>
      {/* @demo:ui — Filter is presentational; no filter UI wired. Tag: PROD-GM-APPROVALS-FILTER-1 */}
      <button className="dbtn ghost"><DI n="filter" s={2} /> Filter</button>
      {/* @demo:ui — "Approve all routine" needs an AI routine classifier; noop for now. Tag: PROD-GM-APPROVALS-BULK-1 */}
      <button className="dbtn primary"><DI n="check" s={2} /> Approve all routine</button>
    </>
  );

  return (
    <GmShell
      eyebrow={<><DI n="spark" s={1.6} style={{ color: 'var(--indigo-bright)' }} /> OPERATIONS</>}
      title="Report approvals"
      sub="Field reports waiting to be vetted into tasks"
      tabs={tabs}
      actions={actions}
    >
      {/* @demo:ui — static Friday triage summary; wire to Ask Friday Core later. Tag: PROD-GM-APPROVALS-TRIAGE-1 */}
      <div className="fai">
        <div className="fh">
          <span className="bdg indigo"><DI n="spark" s={1.6} /> Friday triage</span>
          <span className="grow" />
          <span className="faint mono" style={{ fontSize: 10 }}>updated just now</span>
        </div>
        <p>
          {pendingCount === 0
            ? <>No reports waiting. Field reports land here as soon as staff flag an issue from their app.</>
            : <><span className="hl">{pendingCount} report{pendingCount === 1 ? '' : 's'}</span> waiting to be vetted into tasks{urgentCount > 0 ? <>, <span className="hl">{urgentCount} flagged urgent</span></> : ''}. Review each, then approve to schedule it or decline to dismiss.</>}
        </p>
        <div className="acts">
          <button className="dbtn primary sm"><DI n="check" s={2} /> Approve routine</button>
          <button className="dbtn ghost sm">Why?</button>
        </div>
      </div>

      <div className="grid4" style={{ marginTop: 18 }}>
        <div className="statc amber">
          <div className="n">{pendingCount}</div>
          <div className="l">Pending</div>
          <div className="d">awaiting review</div>
        </div>
        <div className="statc red">
          <div className="n">{urgentCount}</div>
          <div className="l">Urgent</div>
          <div className="d">need triage</div>
        </div>
        {/* @demo:data — Avg vet time has no backing metric yet. Tag: PROD-GM-APPROVALS-STAT-VET-1 */}
        <div className="statc green">
          <div className="n">12m</div>
          <div className="l">Avg vet time</div>
          <div className="d">this week</div>
        </div>
        {/* @demo:data — Approved·7d count has no backing metric yet. Tag: PROD-GM-APPROVALS-STAT-7D-1 */}
        <div className="statc">
          <div className="n">28</div>
          <div className="l">Approved · 7d</div>
          <div className="d">rolling week</div>
        </div>
      </div>

      <div className="dml">Waiting on you {pendingCount > 0 && <span className="ct">{pendingCount}</span>}<span className="rule" /></div>

      {loading && !loaded && (
        <div className="faint mono" style={{ fontSize: 12, padding: '18px 2px' }}>Loading reports…</div>
      )}

      {error && (
        <div className="qrow urgent" style={{ display: 'block' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Couldn’t load reports</div>
          <div className="faint mono" style={{ fontSize: 11, marginBottom: 10 }}>{error}</div>
          <button className="dbtn ghost sm" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {loaded && !error && tasks.length === 0 && (
        <div className="statc" style={{ padding: '22px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Nothing waiting</div>
          <div className="faint" style={{ fontSize: 12 }}>All field reports have been vetted. New reports will appear here.</div>
        </div>
      )}

      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.map((t) => (
            <QRow
              key={t.id}
              urgent={t.priority === 'urgent'}
              title={t.title}
              code={t.propertyCode}
              dept={t.department}
              by={t.requesterName || t.createdByName || '—'}
              when={relTime(t.createdAt)}
              photos={t.attachmentCount}
              pri={t.priority}
              busy={busyIds.has(t.id)}
              onApprove={() => approve(t)}
              onDecline={() => decline(t)}
              onEdit={() => { /* @demo:ui — no draft editor yet. Tag: PROD-GM-APPROVALS-EDIT-1 */ }}
            />
          ))}
        </div>
      )}
    </GmShell>
  );
}
