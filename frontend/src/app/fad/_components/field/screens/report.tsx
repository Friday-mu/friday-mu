'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import {
  BackBtn, Badge, MLabel, Occ, PropPicker, SrcChip, SubHead, TabBar,
  fmtDur, useFieldNav, type BadgeTone,
} from '../kit';
import { fetchTask, createTask, addComment } from '../../../_data/tasksClient';
import { useApiTasks } from '../../../_data/useApiTasks';
import {
  TASK_PROPERTIES, TASK_PROPERTY_BY_CODE, TASK_USER_BY_ID,
  type Task, type TaskStatus,
} from '../../../_data/tasks';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';

/* ════════════════════════════ shared ════════════════════════════ */

type FieldTask = Task & { completed?: boolean };

/** Resolve the task a screen operates on — passed object, or fetched by id. */
function useResolvedTask(params: { task?: FieldTask; taskId?: string }): [FieldTask | null, (t: FieldTask) => void] {
  const [task, setTask] = useState<FieldTask | null>(params.task ?? null);
  useEffect(() => {
    if (!task && params.taskId) {
      fetchTask(params.taskId).then((t) => { if (t) setTask(t); }).catch(() => undefined);
    }
  }, [params.taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  return [task, setTask];
}

function todayIso(): string {
  const now = new Date();
  const m = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return m.toISOString().slice(0, 10);
}

function Loading() {
  return (
    <div className="fad"><div className="fad-body"><div className="fad-scroll">
      <div className="faint" style={{ textAlign: 'center', marginTop: 60, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
    </div></div></div>
  );
}

/** Map a Task → the {propertyCode,title,bzId?} shape SubHead expects. */
function headTask(t: Task): { propertyCode: string; title: string; bzId?: string } {
  return { propertyCode: t.propertyCode, title: t.title, bzId: t.bzId };
}

function authorLabel(authorId: string, authorName?: string): string {
  if (authorName) return authorName;
  return TASK_USER_BY_ID[authorId]?.name || 'Someone';
}
function initialsFor(authorId: string, authorName?: string): string {
  const fromFixture = TASK_USER_BY_ID[authorId]?.initials;
  if (fromFixture) return fromFixture;
  const name = authorName || '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '··';
}

/** Wrap @mentions / #tags in the design's styled spans (best-effort). */
function renderTokens(text: string): ReactNode {
  const tokens = text.split(/(\s+)/);
  return tokens.map((tok, i) => {
    if (/^@\S+/.test(tok)) return <span key={i} className="tagchip">{tok}</span>;
    if (/^#\S+/.test(tok)) return <span key={i} className="tagchip hash">{tok}</span>;
    return <span key={i} style={{ display: 'contents' }}>{tok}</span>;
  });
}

function fmtClock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ════════════════════ Comments + Activity log ════════════════════ */

function LogRow({ cls, children, meta }: { cls?: string; children: ReactNode; meta: ReactNode }) {
  return (<div className={'logrow' + (cls ? ' ' + cls : '')}><span className="ldot" /><div className="lt">{children}</div><div className="lm">{meta}</div></div>);
}

const ACTIVITY_VERB: Record<string, string> = {
  created: 'Created the task',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  commented: 'Commented',
  cost_added: 'Added a cost',
  supply_used: 'Logged supplies',
  risk_flagged: 'Flagged a risk',
  ai_suggested: 'Friday suggested',
  approved: 'Approved',
  rejected: 'Rejected',
  reassigned: 'Reassigned',
  rescheduled: 'Rescheduled',
  updated: 'Updated the task',
};

export function ScreenComments(params: { task?: Task; taskId?: string }) {
  const nav = useFieldNav();
  const uid = useCurrentUserId();
  const [task, setTask] = useResolvedTask(params);
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (!task) return <Loading />;

  const tm = nav.timerFor(task.id);
  const closed = tm.status === 'done' || task.completed || task.status === 'completed' || task.status === 'closed';
  // Closing summary seeds from the most recent comment.
  const lastComment = task.comments.length ? task.comments[task.comments.length - 1] : undefined;
  const summary = lastComment?.text || `${task.title} completed.`;

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    addComment({ taskId: task.id, authorId: uid, text, mentions: [] })
      .then((c) => {
        // Optimistically append, then refetch for the canonical row.
        setTask({ ...task, comments: [...task.comments, c] });
        setDraft('');
        return fetchTask(task.id);
      })
      .then((t) => { if (t) setTask(t); })
      .catch((e) => fireToast(`Couldn’t post comment — ${e.message}`))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fad">
      <SubHead task={headTask(task)} title="Comments & log" />
      <div style={{ padding: '0 16px' }}>
        <div className="tabbar-seg">
          <span className={'tabseg tap' + (tab === 'comments' ? ' on' : '')} onClick={() => setTab('comments')}>Comments</span>
          <span className={'tabseg tap' + (tab === 'activity' ? ' on' : '')} onClick={() => setTab('activity')}>Activity</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        {tab === 'comments' ? (<>
          {closed && (
            <div className="summary-cmt">
              <div className="between" style={{ marginBottom: 7 }}>
                <span className="row gap6" style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12.5 }}><Icon n="check" s={2.2} /> Closing summary</span>
                <span className="ai-tag"><Icon n="sparkle" s={1.6} /> auto-posted</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{summary}</p>
              <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, marginTop: 8 }}>on completion · logged {fmtDur(tm.elapsed || (task.spentMinutes || 0) * 60)}</div>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            {task.comments.length === 0 && (
              <div className="faint" style={{ fontSize: 12.5, padding: '8px 2px', textAlign: 'center' }}>No comments yet — start the thread below.</div>
            )}
            {task.comments.map((c) => {
              const mine = c.authorId === uid;
              return (
                <div key={c.id} className={'cmt' + (mine ? ' me' : '')}>
                  <span className="ca" style={mine ? { borderColor: 'var(--indigo-line)', color: 'var(--indigo-bright)' } : undefined}>{initialsFor(c.authorId, c.authorName)}</span>
                  <div className="cbody">
                    <div className="chead"><span className="cname">{mine ? 'You' : authorLabel(c.authorId, c.authorName)}</span><span className="ctime">{fmtClock(c.ts)}</span></div>
                    <div className="cbubble">{renderTokens(c.text)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>) : (
          <div className="log" style={{ marginTop: 18 }}>
            {task.activityLog.length === 0 && (
              <div className="faint" style={{ fontSize: 12.5, padding: '4px 2px' }}>No activity recorded yet.</div>
            )}
            {task.activityLog.map((a) => {
              const actor = a.actorId === uid ? 'you' : (TASK_USER_BY_ID[a.actorId]?.name || 'Friday');
              const isAi = a.kind === 'ai_suggested';
              const isDone = a.kind === 'status_changed' && /complete|closed/i.test(a.detail || '');
              return (
                <LogRow key={a.id} cls={isAi ? 'ai' : isDone ? 'done' : undefined} meta={`${fmtClock(a.ts)} · ${actor}`}>
                  {a.detail ? renderTokens(a.detail) : (ACTIVITY_VERB[a.kind] || a.kind)}
                </LogRow>
              );
            })}
          </div>
        )}
      </div></div>
      <div className="composer">
        {tab === 'comments' ? (
          <div className="cin">
            <input
              className="cph"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tx)', fontSize: 13.5 }}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            />
            <span style={{ color: 'var(--teal)', fontWeight: 700, fontFamily: 'var(--mono)' }}>#</span>
            <span style={{ color: 'var(--indigo-bright)', fontWeight: 700, fontFamily: 'var(--mono)' }}>@</span>
            <button className="csend" onClick={send} disabled={busy}><Icon n="send" s={2} /></button>
          </div>
        ) : (
          <div className="cin">
            <span className="cph">Activity is read-only</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════ Report an issue (the ＋) ═════════════════════ */

export function ScreenReport() {
  const nav = useFieldNav();
  const [done, setDone] = useState(false);
  const [prop, setProp] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const propList = useMemo(() => TASK_PROPERTIES.map((p) => ({ code: p.code, name: p.name })), []);

  const submit = () => {
    if (busy) return;
    setBusy(true);
    const firstLine = desc.split('\n').map((l) => l.trim()).find(Boolean) || 'Reported issue';
    createTask({
      // Field staff REPORT — manager vets it (status 'reported') before it becomes a real task.
      title: firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine,
      description: desc.trim() || undefined,
      propertyCode: prop || undefined,
      department: 'maintenance',
      subdepartment: 'preventative_maintenance',
      priority: 'high',
      status: 'reported',
      source: 'reported_issue',
      visibility: 'team',
      dueDate: todayIso(),
    })
      .then(() => setDone(true))
      .catch((e) => fireToast(`Couldn’t send report — ${e.message}`))
      .finally(() => setBusy(false));
  };

  if (done) {
    return (
      <div className="fad">
        <div className="fad-body"><div className="fad-scroll">
          <div className="successwrap" style={{ marginTop: 48 }}>
            <div className="successring"><Icon n="check" s={2.4} /></div>
            <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 28, margin: 0 }}>Report sent</h1>
            <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>Friday sent it to your <b style={{ color: 'var(--tx)' }}>ops manager</b> for approval. Once vetted it becomes a task — track it under <b style={{ color: 'var(--tx)' }}>My reports</b>.</p>
          </div>
        </div></div>
        <div className="composer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn primary full tap" style={{ height: 46 }} onClick={() => nav.go('reports')}>View my reports</button>
          <button className="btn ghost full sm tap" onClick={() => nav.tab('tasks')}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fad">
      <div className="detailtop">
        <div className="between">
          <div className="backbtn tap" onClick={() => nav.back()}><Icon n="x" s={2.1} /> Cancel</div>
          <Badge tone="indigo">New report</Badge>
        </div>
      </div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow"><Icon n="flag" s={1.7} style={{ color: 'var(--amber)' }} /> REPORT AN ISSUE</div>
        <h1>What&apos;s wrong?</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{ borderStyle: 'solid' }}>
          <span className="ic" style={{ fontSize: 15 }}><Icon n="sparkle" s={1.8} /></span>
          <span className="tx"><b>Snap it, say it.</b> Add photos and a quick note — Friday drafts it and sends it to your <b>ops manager to approve</b> before it becomes a task.</span>
        </div>
        {/* @demo:ui — Photo capture row. No upload endpoint on Task yet; these are
            decorative tiles. Tag: PROD-FIELD-REPORT-PHOTOS. */}
        <div className="photogrid mt16">
          <div className="photo" style={{ background: 'linear-gradient(150deg,#2b3346,#1a2130)' }} />
          <div className="photo" style={{ background: 'linear-gradient(150deg,#2e2738,#1a2130)' }} />
          <div className="photo add tap"><Icon n="cam" s={1.7} /></div>
        </div>
        <div className="field mt16">
          <span className="flbl">Describe it</span>
          <textarea
            className="fin area"
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="AC in the master bedroom isn't cooling, water pooling under the unit…"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className="field mt12">
          <span className="flbl">Property</span>
          <PropPicker value={prop} onChange={setProp} properties={propList} />
          <span className="faint" style={{ fontSize: 10.5 }}>Search all {propList.length} properties</span>
        </div>
        <MLabel rule={false}>Friday&apos;s draft</MLabel>
        <div className="brief">
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6} /> Drafted from your note</Badge></div>
          <div className="extracted" style={{ marginTop: 4 }}>
            <div className="efield"><span className="el">Title</span><span className="ev">{(desc.split('\n').map((l) => l.trim()).find(Boolean)) || 'Reported issue'}</span></div>
            <div className="efield"><span className="el">Dept</span><span className="ev" style={{ padding: '6px 10px' }}><span className="badge gray">maintenance</span></span></div>
            <div className="efield"><span className="el">Priority</span><span className="ev" style={{ padding: '6px 10px' }}><span className="badge red" style={{ background: 'var(--red-ghost)' }}>High</span></span></div>
          </div>
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} onClick={submit} disabled={busy}>
          <Icon n="flag" s={1.9} /> {busy ? 'Sending…' : 'Send for approval'}
        </button>
        <div className="faint" style={{ textAlign: 'center', fontSize: 10.5, marginTop: 8 }}>Your ops manager vets every report before it becomes a task</div>
      </div>
    </div>
  );
}

/* ════════════════ My reports + issues on my properties ════════════════ */

function statusBadge(status: TaskStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'reported': return { tone: 'indigo', label: 'Open' };
    case 'scheduled': return { tone: 'amber', label: 'Scheduled' };
    case 'ready': return { tone: 'amber', label: 'Ready' };
    case 'in_progress': return { tone: 'amber', label: 'In progress' };
    case 'paused': return { tone: 'amber', label: 'Paused' };
    case 'blocked': return { tone: 'red', label: 'In review' };
    case 'completed': return { tone: 'green', label: 'Resolved' };
    case 'closed': return { tone: 'green', label: 'Closed' };
    case 'cancelled': return { tone: 'gray', label: 'Cancelled' };
    default: return { tone: 'gray', label: status };
  }
}
function accentForStatus(status: TaskStatus): string {
  const b = statusBadge(status);
  return b.tone === 'green' ? 'green' : b.tone === 'red' ? 'red' : b.tone === 'amber' ? 'amber' : 'indigo';
}

function RepRow({ title, code, dept, by, when, status, accent }: {
  title: string; code: string; dept: string; by: string; when: string; status: ReactNode; accent: string;
}) {
  return (
    <div className={'tcard accent ' + accent} style={{ gap: 8 }}>
      <div className="title" style={{ fontSize: 14, lineHeight: 1.3 }}>{title}</div>
      <div className="meta">
        <span className="pcode" style={{ padding: '1px 6px', fontSize: 10 }}>{code}</span>
        <span>{dept}</span><span className="d">·</span><span>{by}</span><span className="d">·</span><span>{when}</span>
      </div>
      <div className="t-foot" style={{ marginTop: 2 }}>{status}</div>
    </div>
  );
}

function relWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1 wk ago';
  return `${Math.floor(days / 7)} wk ago`;
}

export function ScreenReports() {
  const nav = useFieldNav();
  const uid = useCurrentUserId();
  const [tab, setTab] = useState<'mine' | 'props'>('mine');

  // Mine: broadest assignee filter, then narrow client-side to tasks I
  // created/requested. The API has no "createdBy/requestedBy" filter, so we
  // pull my-scoped tasks and filter locally.
  // @demo:logic — "Mine" should be a server filter (created_by = me OR
  // requester = me). Until /api/tasks supports it, we fetch assignee=me and
  // filter in the client, which misses reports I filed on tasks not assigned
  // back to me. Tag: PROD-FIELD-REPORTS-MINE.
  const mineFilter = useMemo(() => ({ assignee: 'me' as const }), []);
  const mine = useApiTasks(mineFilter);

  // On my properties: reported-status tasks on the property codes I'm working.
  const reportedFilter = useMemo(() => ({ status: ['reported'] as TaskStatus[] }), []);
  const reported = useApiTasks(reportedFilter);

  const myReports = useMemo(
    () => mine.tasks.filter((t) => t.createdById === uid || t.requesterId === uid),
    [mine.tasks, uid],
  );

  const myPropertyCodes = useMemo(
    () => new Set(mine.tasks.map((t) => t.propertyCode).filter(Boolean)),
    [mine.tasks],
  );
  const onMyProps = useMemo(
    () => reported.tasks.filter((t) => myPropertyCodes.has(t.propertyCode) && t.createdById !== uid && t.requesterId !== uid),
    [reported.tasks, myPropertyCodes, uid],
  );

  const loading = tab === 'mine' ? mine.loading : reported.loading;
  const error = tab === 'mine' ? mine.error : reported.error;
  const totalCount = myReports.length + onMyProps.length;

  const reporterName = (t: Task) => {
    const who = t.createdById || t.requesterId || '';
    if (who === uid) return 'you';
    return t.createdByName || t.requesterName || TASK_USER_BY_ID[who]?.name || 'someone';
  };

  return (
    <div className="fad">
      <div className="detailtop"><div className="between"><BackBtn label="Back" /><span className="badge gray">{totalCount}</span></div></div>
      <div className="apphead" style={{ paddingTop: 12 }}><div className="eyebrow">REPORTS</div><h1>Reported</h1></div>
      <div style={{ padding: '4px 16px 0' }}>
        <div className="tabbar-seg">
          <span className={'tabseg tap' + (tab === 'mine' ? ' on' : '')} onClick={() => setTab('mine')}>Mine</span>
          <span className={'tabseg tap' + (tab === 'props' ? ' on' : '')} onClick={() => setTab('props')}>On my properties</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>Loading…</div>}
        {error && <div className="aigate" style={{ borderColor: 'var(--red-ghost)', background: 'var(--red-ghost)', marginTop: 12 }}><span className="ic" style={{ color: 'var(--red)' }}><Icon n="alert" s={1.9} /></span><span className="tx">Couldn’t load reports — {error}</span></div>}

        {!loading && !error && tab === 'mine' && (<>
          <MLabel count={myReports.length} rule={false}>Reported by you</MLabel>
          <div className="stack-sm">
            {myReports.length === 0 && <div className="faint" style={{ fontSize: 12.5, padding: '8px 2px', textAlign: 'center' }}>You haven&apos;t reported anything yet.</div>}
            {myReports.map((t) => {
              const sb = statusBadge(t.status);
              const drafted = t.source === 'inbox_ai' || t.awaitingHumanApproval;
              return (
                <div key={t.id} className="tap" onClick={() => nav.go('detail', { task: t as unknown as Record<string, unknown> })}>
                  <RepRow
                    accent={accentForStatus(t.status)}
                    title={t.title}
                    code={t.propertyCode}
                    dept={t.department}
                    by="you"
                    when={relWhen(t.createdAt)}
                    status={
                      drafted
                        ? <><Badge tone={sb.tone} dot>{sb.label}</Badge><span className="grow" /><span className="faint" style={{ fontSize: 10.5, fontFamily: 'var(--mono)' }}>Friday-drafted</span></>
                        : <Badge tone={sb.tone} dot>{sb.label}</Badge>
                    }
                  />
                </div>
              );
            })}
          </div>
        </>)}

        {!loading && !error && tab === 'props' && (<>
          <MLabel count={onMyProps.length} rule={false}>On properties you&apos;re working</MLabel>
          <div className="stack-sm">
            {onMyProps.length === 0 && <div className="faint" style={{ fontSize: 12.5, padding: '8px 2px', textAlign: 'center' }}>No open reports on your properties.</div>}
            {onMyProps.map((t) => {
              const sb = statusBadge(t.status);
              const who = reporterName(t);
              return (
                <div key={t.id} className="tap" onClick={() => nav.go('detail', { task: t as unknown as Record<string, unknown> })}>
                  <RepRow
                    accent={accentForStatus(t.status)}
                    title={t.title}
                    code={t.propertyCode}
                    dept={t.department}
                    by={who}
                    when={relWhen(t.createdAt)}
                    status={<><Badge tone={sb.tone} dot>{sb.label}</Badge><span className="grow" /><span className="avatar">{initialsFor(t.createdById || t.requesterId || '', t.createdByName || t.requesterName)}</span></>}
                  />
                </div>
              );
            })}
          </div>
        </>)}
      </div></div>
      <TabBar active="account" />
    </div>
  );
}

/* ════════════════════════ Property (per-task) ════════════════════════ */

// @demo:data — Per-property on-site context (check-in, on-site guide, access
// codes, lockbox/alarm/wifi). Real source is the Properties module / Breezeway
// property record — there's no field-facing API for this yet. Keyed by property
// code with a sensible default. Tag: PROD-FIELD-PROPERTY-CONTEXT.
const CHECKIN: Record<string, string> = {
  'SD-10': 'Lockbox on the right gate post. Park in bay 10. Alarm panel by the front door — code disarms both zones. Pool gate self-locks.',
  'GBH-B4': 'Use service lift to floor 4, unit B4. Key card in the lockbox by the lobby intercom. Gym & pool wristbands in the welcome drawer.',
  'BW-C4': 'Beachfront block C, unit 4. Lockbox under the wooden bench on the veranda. Outdoor shower tap is stiff — turn firmly.',
};

interface AccessInfo { lockbox: string; alarm: string; wifi: string; wifipass: string; }
const ACCESS: Record<string, AccessInfo> = {
  'SD-10': { lockbox: '4827', alarm: '19#', wifi: 'SunsetDrive_5G', wifipass: 'tamarin2024' },
  'GBH-B4': { lockbox: '5106', alarm: '—', wifi: 'GBH_Guest', wifipass: 'grandbaie44' },
  'BW-C4': { lockbox: '3390', alarm: '—', wifi: 'Beachfront_C4', wifipass: 'flicflac7' },
};

interface GuideInfo { parking: string; bins: string; mains: string; utility: string; storage: string; notes: string; }
const GUIDE: Record<string, GuideInfo> = {
  'SD-10': { parking: 'Bay 10, just inside the gate', bins: 'Green bin by the side wall · collection Tue & Fri', mains: 'Water stopcock in the garden meter box, left of the gate', utility: 'Fuse box in the hallway cupboard', storage: 'Linen & cleaning in the hallway closet, top shelf', notes: 'Pool gate self-locks. Outdoor tap is by the BBQ.' },
  'GBH-B4': { parking: 'Visitor bay V4, level −1', bins: 'Rubbish chute at the end of the corridor · daily', mains: 'Water valve under the kitchen sink', utility: 'DB board behind the entry door', storage: 'Housekeeping store room on 4F (key 5106)', notes: 'Gym & pool wristbands are in the welcome drawer.' },
  'BW-C4': { parking: 'Sandy lot in front of block C', bins: 'Communal bins by the block entrance · Mon & Thu', mains: 'Stopcock under the veranda steps', utility: 'Fuse box in the bedroom wardrobe', storage: 'Beach gear & linen in the under-stair cupboard', notes: 'Outdoor shower tap is stiff — turn firmly.' },
};
const GUIDE_DEFAULT: GuideInfo = { parking: 'Ask your manager for the assigned bay', bins: 'Bins by the main entrance', mains: 'Water stopcock near the entry', utility: 'Fuse box by the front door', storage: 'Linen & cleaning in the main closet', notes: '—' };

export function ScreenProperty(params: { task?: Task; taskId?: string; completed?: boolean }) {
  const nav = useFieldNav();
  const [task] = useResolvedTask(params);
  const [revealed, setRevealed] = useState(false);

  // Active issues — REAL: reported-status tasks on this property.
  const issueFilter = useMemo(
    () => (task ? { property: task.propertyCode, status: ['reported'] as TaskStatus[] } : undefined),
    [task?.propertyCode], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { tasks: issueTasks } = useApiTasks(issueFilter);

  if (!task) return <Loading />;

  const completed = params.completed || task.completed || task.status === 'completed' || task.status === 'closed';
  const code = task.propertyCode;
  const prop = TASK_PROPERTY_BY_CODE[code];
  const propName = prop?.name || code;
  const acc = ACCESS[code];
  const g = GUIDE[code] || GUIDE_DEFAULT;
  const checkin = CHECKIN[code];
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(propName + ' Mauritius');

  const occState = task.status === 'in_progress' ? 'in' : 'vacant';

  return (
    <div className="fad">
      <div className="detailtop"><div className="between">
        <BackBtn label={task.title} />
        <span className="badge gray">{code}</span>
      </div></div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow">PROPERTY · {code}</div>
        <h1>{propName}</h1>
        <div className="row gap6 mt8" style={{ flexWrap: 'wrap' }}>
          <Occ state={occState}>{task.dueTime ? `Due ${task.dueTime}` : task.dueDate || code}</Occ>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <a className="btn primary full tap" href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ height: 46, fontSize: 14, textDecoration: 'none' }}>
          <Icon n="pin" s={1.9} /> Open in Google Maps
        </a>
        <div className="faint" style={{ fontSize: 11, marginTop: 7, textAlign: 'center' }}>{propName}</div>

        <MLabel rule={false}>Check-in instructions</MLabel>
        <div className="tcard"><p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--tx)' }}>{checkin || 'No special instructions — standard lockbox entry.'}</p></div>

        <MLabel rule={false}>On-site guide</MLabel>
        <div className="setgroup">
          <div className="guiderow"><span className="gi"><Icon n="wifi" s={2} /></span><div className="gmain"><div className="gl">Wi-Fi</div><div className="gv">{acc ? <><b>{acc.wifi}</b> · pass <b>{acc.wifipass}</b></> : 'Ask your manager'}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="car" s={1.9} /></span><div className="gmain"><div className="gl">Parking</div><div className="gv">{g.parking}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="trash" s={1.9} /></span><div className="gmain"><div className="gl">Bins</div><div className="gv">{g.bins}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="drop" s={1.9} /></span><div className="gmain"><div className="gl">Water mains</div><div className="gv">{g.mains}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="zap" s={1.9} /></span><div className="gmain"><div className="gl">Fuse box</div><div className="gv">{g.utility}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="box" s={1.8} /></span><div className="gmain"><div className="gl">Linen &amp; supplies</div><div className="gv">{g.storage}</div></div></div>
          {g.notes && g.notes !== '—' && <div className="guiderow"><span className="gi"><Icon n="info" s={1.9} /></span><div className="gmain"><div className="gl">Good to know</div><div className="gv">{g.notes}</div></div></div>}
        </div>

        <MLabel rule={false}>Access</MLabel>
        {completed ? (
          <div className="tcard" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--tx-3)', fontSize: 16 }}><Icon n="lock" s={1.9} /></span>
            <span className="dim" style={{ fontSize: 12.5, flex: 1 }}>Access codes are closed for completed tasks. Reopen the task if you need re-entry.</span>
          </div>
        ) : !revealed ? (
          <div className="tcard">
            <div className="between">
              <span className="row gap6" style={{ fontWeight: 600, fontSize: 13.5 }}><Icon n="lock" s={2} style={{ color: 'var(--tx-2)' }} /> Access policy</span>
              <SrcChip src="bz">audit-only</SrcChip>
            </div>
            <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>Codes stay in source. Revealing is logged to the property audit trail with your name &amp; time.</p>
            {/* @demo:logic — "Reveal" is local-only; a real reveal must POST to a
                property audit-trail endpoint and read codes from source, not from
                the inline ACCESS fixture. Tag: PROD-FIELD-ACCESS-REVEAL. */}
            <button className="btn sm tap" style={{ alignSelf: 'flex-start', background: 'var(--indigo)', borderColor: 'var(--indigo)', color: '#fff' }} onClick={() => { setRevealed(true); fireToast(`Reveal logged to ${code} audit trail`); }}><Icon n="shield" s={1.8} /> Reveal code (logged)</button>
          </div>
        ) : (
          <div className="tcard" style={{ gap: 9 }}>
            <div className="between">
              <span className="row gap6" style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--green)' }}><Icon n="lock" s={2} /> Codes revealed</span>
              <span className="ai-tag" style={{ color: 'var(--amber)' }}><Icon n="shield" s={1.7} /> logged {fmtClock(new Date().toISOString())}</span>
            </div>
            <div className="codebox"><span className="cl">Lockbox</span><span className="cv">{acc ? acc.lockbox : '—'}</span></div>
            {acc && acc.alarm && acc.alarm !== '—' && <div className="codebox"><span className="cl">Alarm</span><span className="cv">{acc.alarm}</span></div>}
            <div className="faint" style={{ fontSize: 10.5, fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon n="shield" s={2} /> Reveal logged to {code} audit trail
            </div>
            <button className="btn sm ghost tap" style={{ alignSelf: 'flex-start' }} onClick={() => setRevealed(false)}>Hide codes</button>
          </div>
        )}

        <MLabel rule={false} count={issueTasks.length}>Active issues on this property</MLabel>
        <div className="stack-sm">
          {issueTasks.length === 0 && <div className="faint" style={{ fontSize: 12.5, padding: '4px 2px' }}>No open issues reported here.</div>}
          {issueTasks.map((is) => {
            const sb = statusBadge(is.status);
            const who = is.createdByName || is.requesterName || TASK_USER_BY_ID[is.createdById || is.requesterId || '']?.name || 'someone';
            return (
              <div key={is.id} className="pissue tap" onClick={() => nav.go('detail', { task: is as unknown as Record<string, unknown> })}>
                <Badge tone={sb.tone} dot>{sb.label}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{is.title}</div>
                  <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, marginTop: 2 }}>{who} · {relWhen(is.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn ghost full mt12 tap" style={{ height: 40, color: 'var(--amber)' }} onClick={() => nav.go('report', null, 'up')}><Icon n="flag" s={1.8} /> Report an issue here</button>
      </div></div>
      <TabBar active="tasks" />
    </div>
  );
}

/* ═══════════════════ Ask Friday (task-scoped) ═══════════════════ */

export function ScreenAIHelp(params: { task?: Task; taskId?: string }) {
  const [task] = useResolvedTask(params);

  if (!task) return <Loading />;

  // @demo:ui — Task-scoped Ask Friday. Static example exchange + a
  // non-functional composer. Do NOT wire here — wire to Ask Friday Core later
  // (a parallel session owns that surface). Tag: PROD-FIELD-AIHELP.
  return (
    <div className="fad">
      <SubHead task={headTask(task)} title="Ask Friday" />
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{ borderStyle: 'solid' }}>
          <span className="ic" style={{ fontSize: 15 }}><Icon n="sparkle" s={1.8} /></span>
          <span className="tx"><b>Scoped to this task.</b> Friday already has {task.propertyCode}&apos;s property, reservation, access policy and recent history.</span>
        </div>
        <div className="cmt me mt16" style={{ justifyContent: 'flex-end' }}>
          <div className="cbody">
            <div className="photogrid" style={{ gridTemplateColumns: 'repeat(3,52px)', justifyContent: 'flex-end', marginBottom: 8 }}>
              <div className="photo" style={{ background: 'linear-gradient(150deg,#2b3346,#1a2130)' }} />
              <div className="photo" style={{ background: 'linear-gradient(150deg,#2e2738,#1a2130)' }} />
            </div>
            <div className="cbubble">Shut the main valve and bled the line — still no water. Pump indicator light is <b>red</b>. What next?</div>
          </div>
        </div>
        <div className="cmt">
          <span className="ca" style={{ background: 'var(--indigo-ghost)', borderColor: 'transparent', color: 'var(--indigo-bright)' }}><Icon n="sparkle" s={1.7} /></span>
          <div className="cbody">
            <div className="chead"><span className="cname" style={{ color: 'var(--indigo-bright)' }}>Friday</span><span className="ctime">now</span></div>
            <div className="cbubble">
              A red light usually means the borehole pump hit its <b>dry-run cutoff</b>. Try this order:<br />
              1 · Check the pump breaker in the utility cupboard<br />
              2 · Reset, then prime the line<br />
              3 · If it trips again, it&apos;s a <b>pump fault</b> — stop resetting, it&apos;ll burn out.
              <div className="faint" style={{ fontSize: 10.5, marginTop: 8, fontFamily: 'var(--mono)' }}>based on 3 past leaks here</div>
            </div>
            <div className="aigate mt12" style={{ borderStyle: 'solid' }}>
              <span className="ic" style={{ fontSize: 14 }}><Icon n="flag" s={1.8} /></span>
              <span className="tx">Want me to log this as a <b>pump fault</b> and flag the GM? Needs your OK.</span>
            </div>
            <div className="row gap6 mt8">
              <button className="btn primary sm tap"><Icon n="check" s={2} /> Log &amp; flag GM</button>
              <button className="btn ghost sm tap">Not yet</button>
            </div>
          </div>
        </div>
      </div></div>
      <div className="composer">
        <div className="cin">
          <span style={{ color: 'var(--tx-3)', fontSize: 16 }}><Icon n="cam" s={1.8} /></span>
          <span className="cph">Describe the issue…</span>
          <span style={{ color: 'var(--tx-3)', fontSize: 16 }}><Icon n="mic" s={1.9} /></span>
          <button className="csend"><Icon n="send" s={2} /></button>
        </div>
      </div>
    </div>
  );
}
