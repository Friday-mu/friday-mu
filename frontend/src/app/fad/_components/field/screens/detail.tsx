'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { BackBtn, Badge, MLabel, SecLink, SrcChip, TabBar, fmtDur, fmtTimer, useFieldNav } from '../kit';
import { fetchTask, updateTask, addComment } from '../../../_data/tasksClient';
import {
  requirementsForTask, normalizeRequirementState,
} from '../../../_data/taskRequirements';
import { TASK_PROPERTY_BY_CODE, type Task, type TaskRequirement } from '../../../_data/tasks';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';

type FieldTask = Task & { completed?: boolean };
/* shared: resolve the task this screen operates on (passed object or fetched by id) */
function useResolvedTask(params: { task?: FieldTask; taskId?: string }): [FieldTask | null, (t: FieldTask) => void] {
  const [task, setTask] = useState<FieldTask | null>(params.task ?? null);
  useEffect(() => {
    if (!task && params.taskId) {
      fetchTask(params.taskId).then((t) => { if (t) setTask(t); }).catch(() => undefined);
    }
  }, [params.taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  return [task, setTask];
}

function elapsedToMinutes(elapsed: number, prev?: number): number {
  return Math.max(prev || 0, Math.ceil((elapsed || 0) / 60));
}

function DetailHead({ task }: { task: Task & { completed?: boolean } }) {
  const prop = TASK_PROPERTY_BY_CODE[task.propertyCode];
  const area = (prop?.name || task.propertyCode).toUpperCase();
  return (
    <div className="detailtop">
      <div className="between">
        <BackBtn label="My Tasks" />
        <div className="row gap6">
          {task.bzId && <span className="srcchip bz"><Icon n="lock" s={2.2} style={{ fontSize: 9 }} /> #{task.bzId}</span>}
          <span className="badge gray">{task.propertyCode}</span>
        </div>
      </div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow">{task.department.toUpperCase()} · {area}</div>
        <h1>{task.title}</h1>
        <div className="row gap6 mt8" style={{ flexWrap: 'wrap' }}>
          <Badge tone={task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'amber' : 'gray'} dot>{task.priority}</Badge>
          <Badge tone="indigo">{task.completed ? 'Done' : task.status}</Badge>
        </div>
      </div>
    </div>
  );
}

export function ScreenDetail(params: { task?: Task; taskId?: string; completed?: boolean }) {
  const nav = useFieldNav();
  const [task, setTask] = useResolvedTask(params);

  // seed the shell timer from persisted spentMinutes / status (once)
  useEffect(() => {
    if (!task) return;
    const st = task.status === 'in_progress' ? 'running' : task.status === 'paused' ? 'paused'
      : (task.completed || task.status === 'completed' || task.status === 'closed') ? 'done' : 'idle';
    nav.seedTimer(task.id, (task.spentMinutes || 0) * 60, st);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) {
    return <div className="fad"><div className="fad-body"><div className="fad-scroll"><div className="faint" style={{ textAlign: 'center', marginTop: 60, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading task…</div></div></div><TabBar active="tasks" /></div>;
  }

  const tm = nav.timerFor(task.id);
  const reqs = requirementsForTask(task);
  const state = normalizeRequirementState(task.requirementState);
  const checkReqs = reqs.filter((r) => r.kind === 'check');
  const doneChecks = checkReqs.filter((r) => state.completedIds.includes(r.id)).length;
  const hasReq = reqs.length > 0;
  const completed = (task as { completed?: boolean }).completed || tm.status === 'done' || task.status === 'completed' || task.status === 'closed';

  const persist = (patch: Parameters<typeof updateTask>[0]['patch']) =>
    updateTask({ taskId: task.id, patch }).then(setTask).catch((e) => fireToast(`Couldn’t save — ${e.message}`));

  const start = () => { nav.startTimer(task.id, task.title); persist({ status: 'in_progress' }); };
  const pause = () => { nav.pauseTimer(task.id); persist({ status: 'paused', spentMinutes: elapsedToMinutes(tm.elapsed, task.spentMinutes) }); };
  const resume = () => { nav.resumeTimer(task.id); persist({ status: 'in_progress' }); };

  const prop = TASK_PROPERTY_BY_CODE[task.propertyCode];

  return (
    <div className="fad">
      <DetailHead task={task} />
      <div className="fad-body"><div className="fad-scroll">

        {tm.status === 'idle' && !completed && (<>
          <button className="btn primary full tap" style={{ height: 50, fontSize: 15, borderRadius: 14 }} onClick={start}>
            <Icon n="play" s={2} /> Start task
          </button>
          <div className="row gap6 mt8" style={{ justifyContent: 'center' }}>
            <span className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
              {task.estimatedMinutes ? `est. ${fmtDur(task.estimatedMinutes * 60)}` : 'no estimate'}
            </span>
          </div>
        </>)}

        {(tm.status === 'running' || tm.status === 'paused') && (
          <div className="tcard" style={{ alignItems: 'center', gap: 6, paddingTop: 10 }}>
            <div className="bigtimer" style={{ padding: '6px 0 2px' }}>
              <div className="bt">{fmtTimer(tm.elapsed)}</div>
              <div className="bl">
                <span className="runbar" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  <span className={'rdot ' + (tm.status === 'running' ? 'live' : '')} style={{ background: tm.status === 'running' ? 'var(--green)' : 'var(--amber)', animation: tm.status === 'running' ? 'pulse 1.6s infinite' : 'none' }} />
                </span>
                {tm.status === 'running' ? 'On task' : 'Paused'}
              </div>
            </div>
            <div className="timerbtns" style={{ width: '100%' }}>
              {tm.status === 'running'
                ? <button className="tbtn warn tap" onClick={pause}><Icon n="pause" s={2} /> Pause</button>
                : <button className="tbtn go tap" onClick={resume}><Icon n="play" s={2} /> Resume</button>}
              <button className="tbtn stop wide tap" onClick={() => nav.go('complete', { task: task as unknown as Record<string, unknown> })}><Icon n="check" s={2.2} /> Complete</button>
            </div>
          </div>
        )}

        {completed && (
          <div className="tcard accent green" style={{ gap: 8 }}>
            <div className="row gap10">
              <span className="hcheck" style={{ width: 34, height: 34, flex: '0 0 34px', fontSize: 17 }}><Icon n="check" s={2.6} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Completed</div>
                <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10.5, marginTop: 2 }}>logged {fmtDur((task.spentMinutes || 0) * 60)} · {task.attachmentCount || 0} attachment{task.attachmentCount === 1 ? '' : 's'}</div>
              </div>
              <Badge tone="green" dot>Done</Badge>
            </div>
          </div>
        )}

        <MLabel rule={false}>Context</MLabel>
        <div className="tcard" style={{ gap: 11 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--tx)' }}>{task.description || 'No description provided.'}</p>
          {(task.source === 'breezeway' || task.source === 'guesty') && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}>
              <SrcChip src={task.source === 'guesty' ? 'gy' : 'bz'}>imported · {task.bzId ? `${task.source} ${task.bzId}` : task.source}</SrcChip>
            </div>
          )}
        </div>

        <div style={{ marginTop: 4 }}>
          <div className="frow"><div className="fl">Due</div><div className="fv">{task.dueDate}{task.dueTime ? <span className="muted"> · {task.dueTime}</span> : null}</div></div>
          {task.assigneeNames && task.assigneeNames.length > 0 && (
            <div className="frow"><div className="fl">Assignee</div><div className="fv">{task.assigneeNames.join(', ')}</div></div>
          )}
        </div>

        <MLabel rule={false}>On this task</MLabel>
        <div className="stack-sm">
          <SecLink ic="pin" title={'Property · ' + task.propertyCode} sum="Map, check-in instructions & access"
            onClick={() => nav.go('property', { task: task as unknown as Record<string, unknown>, completed })} />
          {hasReq && <SecLink ic="check" accent title="Requirements" done={checkReqs.length > 0 && doneChecks === checkReqs.length}
            sum={checkReqs.length ? (doneChecks === checkReqs.length ? 'All checks complete ✓' : 'Checklists & inspection') : 'Checklists & inspection'}
            count={checkReqs.length ? doneChecks + '/' + checkReqs.length : undefined}
            onClick={() => nav.go('requirements', { task: task as unknown as Record<string, unknown> })} />}
          <SecLink ic="box" title="Supplies used" sum="Confirm or edit what you used"
            count={(task.supplies || []).length} onClick={() => nav.go('supplies', { task: task as unknown as Record<string, unknown> })} />
          <SecLink ic="dollar" title="Expense report" sum="Scan a receipt — Friday fills it in"
            onClick={() => nav.go('expense', { task: task as unknown as Record<string, unknown> })} />
          <SecLink ic="sparkle" ai title="Ask Friday about this task" sum="Stuck? Add photos & describe the issue"
            onClick={() => nav.go('aihelp', { task: task as unknown as Record<string, unknown> })} />
          <SecLink ic="msg" title="Comments & activity" sum={completed ? 'Closing summary, comments & log' : 'Notes, mentions & activity log'}
            count={task.comments.length} onClick={() => nav.go('comments', { task: task as unknown as Record<string, unknown> })} />
        </div>

        {!completed && (
          <button className="btn ghost full mt16 tap" style={{ height: 42, color: 'var(--amber)' }} onClick={() => nav.go('report', null, 'up')}>
            <Icon n="flag" s={1.9} /> Report a related issue
          </button>
        )}
      </div></div>
      <TabBar active="tasks" />
    </div>
  );
}

/* ─────────────────────────── Requirements ─────────────────────────── */
// The real Task model is a FLAT TaskRequirement[] (kinds: check/photo/file/
// expense/supply/time/summary) + requirementState{completedIds,waivedIds}.
// We render it in the design's checklist style and persist toggles via
// updateTask. (The design's amenity-inventory steppers have no backing field
// on Task yet — a richer inventory model is future work.)

export function ScreenRequirements(params: { task?: Task; taskId?: string }) {
  const nav = useFieldNav();
  const [task, setTask] = useResolvedTask(params);
  const [saving, setSaving] = useState(false);

  if (!task) return <div className="fad"><div className="fad-body"><div className="fad-scroll"><div className="faint" style={{ textAlign: 'center', marginTop: 60 }}>Loading…</div></div></div></div>;

  const reqs = requirementsForTask(task);
  const state = normalizeRequirementState(task.requirementState);
  const checkReqs = reqs.filter((r) => r.kind === 'check' || r.kind === 'summary' || r.kind === 'expense' || r.kind === 'supply' || r.kind === 'time' || r.kind === 'photo' || r.kind === 'file');
  const done = reqs.filter((r) => r.kind === 'check' && state.completedIds.includes(r.id)).length;
  const totalChecks = reqs.filter((r) => r.kind === 'check').length;
  const rf = nav.reqFor(task.id);

  const toggle = (r: TaskRequirement) => {
    if (r.kind !== 'check') return;
    const has = state.completedIds.includes(r.id);
    const completedIds = has ? state.completedIds.filter((x) => x !== r.id) : [...state.completedIds, r.id];
    const next = normalizeRequirementState({ ...state, completedIds, updatedAt: new Date().toISOString() });
    setSaving(true);
    updateTask({ taskId: task.id, patch: { requirementState: next } })
      .then(setTask).catch((e) => fireToast(`Couldn’t save — ${e.message}`)).finally(() => setSaving(false));
  };

  return (
    <div className="fad">
      <div className="detailtop"><div className="between">
        <BackBtn label={task.title} />
        <span className="badge gray">{task.propertyCode}</span>
      </div></div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow">{task.propertyCode} · {task.department.toUpperCase()}</div>
        <h1>Requirements</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{ borderStyle: 'solid' }}>
          <span className="ic" style={{ fontSize: 15 }}><Icon n="shield" s={1.8} /></span>
          <span className="tx">Work through each item as you go. <b>{done}/{totalChecks}</b> checks done — required items must be ticked before you can complete.</span>
        </div>

        <MLabel rule={false}>Checklist{saving ? ' · saving…' : ''}</MLabel>
        <div className="reqsection">
          <div className="reqhead"><span className="rtitle">Items</span><span className="rprog">{done}/{totalChecks}</span></div>
          <div className="reqbar"><i style={{ width: (totalChecks ? (done / totalChecks * 100) : 0) + '%' }} /></div>
          {checkReqs.map((r) => {
            const on = r.kind === 'check' && state.completedIds.includes(r.id);
            const wantsPhoto = r.kind === 'photo' || r.kind === 'file' || r.evidenceHint?.toLowerCase().includes('photo');
            const pc = (rf.itemPhotos && rf.itemPhotos[r.id]) || 0;
            return (
              <div key={r.id} className={'checkitem' + (r.kind === 'check' ? ' tap' : '') + (on ? ' on' : '')} onClick={() => toggle(r)}>
                <span className="cbx"><Icon n="check" s={3} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="clabel">{r.label}{wantsPhoto && <span className="photoflag"><Icon n="cam" s={2} /> photo</span>}</span>
                  {wantsPhoto && (
                    <div className="itemphotos" onClick={(e) => e.stopPropagation()}>
                      {Array.from({ length: pc }).map((_, i) => (
                        <span key={i} className="iph" style={{ background: `linear-gradient(150deg,${['#26343a', '#2b3346', '#2e2738'][i % 3]},#1a2130)` }} />
                      ))}
                      <span className={'addphoto tap' + (pc === 0 ? ' need' : '')} onClick={() => nav.addItemPhoto(task.id, r.id)}>
                        <Icon n="cam" s={1.9} /> {pc === 0 ? 'Add photo' : 'Add'}
                      </span>
                    </div>
                  )}
                </div>
                {r.required && r.kind === 'check' && !on && <span className="creq">required</span>}
              </div>
            );
          })}
          {checkReqs.length === 0 && <div className="faint" style={{ padding: '12px 13px', fontSize: 12.5 }}>No requirements on this task.</div>}
        </div>

        {/* @demo:state — task photo/evidence capture is local-only (held in shell state); no upload endpoint yet. Tag: PROD-FIELD-PHOTO-1 */}
        <MLabel rule={false}>Photos</MLabel>
        <div className="photogrid">
          {Array.from({ length: rf.photos }).map((_, i) => (
            <div key={i} className="photo" style={{ background: `linear-gradient(150deg,${['#2b3346', '#2e2738', '#26343a', '#332b2b'][i % 4]},#1a2130)` }} />
          ))}
          <div className="photo add tap" onClick={() => nav.addPhoto(task.id)}><Icon n="cam" s={1.7} /></div>
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 7 }}>Tap to add before/after photos</div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} onClick={() => nav.back()}>
          <Icon n="check" s={2} /> Save &amp; back to task
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Complete ─────────────────────────── */

export function ScreenComplete(params: { task?: Task; taskId?: string }) {
  const nav = useFieldNav();
  const uid = useCurrentUserId();
  const [task, setTask] = useResolvedTask(params);
  const [submitted, setSubmitted] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  if (!task) return <div className="fad"><div className="fad-body"><div className="fad-scroll"><div className="faint" style={{ textAlign: 'center', marginTop: 60 }}>Loading…</div></div></div></div>;

  const tm = nav.timerFor(task.id);
  const rf = nav.reqFor(task.id);
  const reqs = requirementsForTask(task);
  const state = normalizeRequirementState(task.requirementState);
  const requiredLeft = reqs.filter((r) => r.kind === 'check' && r.required && !state.completedIds.includes(r.id)).length;
  const photoOk = rf.photos > 0 || (task.attachmentCount || 0) > 0;

  const submit = () => {
    if (requiredLeft > 0 || !photoOk || busy) return;
    setBusy(true);
    const spent = elapsedToMinutes(tm.elapsed, task.spentMinutes);
    const text = summary.trim() || `${task.title} completed.`;
    nav.completeTimer(task.id);
    updateTask({ taskId: task.id, patch: { status: 'completed', spentMinutes: spent } })
      .then((t) => { setTask(t); return addComment({ taskId: task.id, authorId: uid, text, mentions: [] }).catch(() => undefined); })
      .then(() => setSubmitted(true))
      .catch((e) => fireToast(`Couldn’t complete — ${e.message}`))
      .finally(() => setBusy(false));
  };

  if (submitted) {
    return (
      <div className="fad">
        <div className="fad-body"><div className="fad-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="successwrap" style={{ marginTop: 40 }}>
            <div className="successring"><Icon n="check" s={2.4} /></div>
            <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 28, margin: 0 }}>Task complete</h1>
            <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              {task.title} · logged <b style={{ color: 'var(--tx)' }}>{fmtDur(tm.elapsed)}</b>.<br />Your summary was posted as the <b style={{ color: 'var(--tx)' }}>closing comment</b>.
            </p>
          </div>
        </div></div>
        <div className="composer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn primary full tap" style={{ height: 46 }} onClick={() => nav.tab('tasks')}>Back to my tasks</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fad">
      <div className="detailtop"><div className="between">
        <BackBtn label="Task" />
        <span className="badge gray">{task.propertyCode}</span>
      </div></div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow">{task.propertyCode} · {task.department.toUpperCase()}</div>
        <h1>Complete task</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="tcard" style={{ alignItems: 'center' }}>
          <div className="bl" style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>Time on task</div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 34, letterSpacing: '-0.02em' }}>{fmtTimer(tm.elapsed || 0)}</div>
        </div>

        {requiredLeft > 0 && (
          <div className="aigate tap" style={{ borderColor: 'var(--red-ghost)', background: 'var(--red-ghost)', marginTop: 14 }} onClick={() => nav.back()}>
            <span className="ic" style={{ fontSize: 15, color: 'var(--red)' }}><Icon n="alert" s={1.9} /></span>
            <span className="tx"><b style={{ color: 'var(--red)' }}>{requiredLeft} required check{requiredLeft > 1 ? 's' : ''} left.</b> Tap to finish the requirements first.</span>
          </div>
        )}

        <MLabel rule={false}>Execution summary</MLabel>
        <textarea className="fin area" style={{ width: '100%', minHeight: 70, resize: 'vertical' }} placeholder="What changed, what was found, what remains…" value={summary} onChange={(e) => setSummary(e.target.value)} />

        <MLabel rule={false}>Photo proof {photoOk ? '' : <span className="creq" style={{ marginLeft: 6 }}>required</span>}</MLabel>
        <div className="photogrid">
          {Array.from({ length: Math.max(rf.photos, 0) }).map((_, i) => (
            <div key={i} className="photo" style={{ background: `linear-gradient(150deg,${['#26343a', '#2b3346', '#2e2738'][i % 3]},#1a2130)` }} />
          ))}
          <div className="photo add tap" onClick={() => nav.addPhoto(task.id)}><Icon n="cam" s={1.7} /></div>
        </div>

        {(task.supplies || []).length > 0 && (<>
          <MLabel rule={false}>Supplies used</MLabel>
          <div className="row gap6" style={{ flexWrap: 'wrap' }}>
            {(task.supplies || []).map((s, i) => <span key={i} className="badge gray">{s.supplyName} ×{s.quantity}</span>)}
            <span className="badge indigo tap" onClick={() => nav.go('supplies', { task: task as unknown as Record<string, unknown> })}>edit</span>
          </div>
        </>)}
      </div></div>
      <div className="composer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className={'btn full tap' + (requiredLeft > 0 || !photoOk ? '' : ' primary')} disabled={requiredLeft > 0 || !photoOk || busy}
          style={{ height: 48, fontSize: 15, opacity: (requiredLeft > 0 || !photoOk) ? 0.5 : 1, background: (requiredLeft > 0 || !photoOk) ? 'var(--card-2)' : undefined }}
          onClick={submit}>
          <Icon n="check" s={2.2} /> {busy ? 'Saving…' : 'Mark complete'}
        </button>
        {!photoOk && requiredLeft === 0 && <div className="faint" style={{ textAlign: 'center', fontSize: 11 }}>Add at least one photo to complete</div>}
      </div>
    </div>
  );
}
