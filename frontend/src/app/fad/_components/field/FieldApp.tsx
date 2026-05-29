'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Icon } from './icons';
import {
  NavCtx, fmtTimer,
  type FieldNav, type Dir, type TimerState, type ReqUiState, type CallState,
} from './kit';
import { ScreenTasks, ScreenHistory } from './screens/tasks';
import { ScreenDetail, ScreenRequirements, ScreenComplete } from './screens/detail';
import { ScreenSupplies, ScreenExpense } from './screens/work';
import { ScreenComments, ScreenReport, ScreenReports, ScreenProperty, ScreenAIHelp } from './screens/report';
import { ScreenChat, ScreenChatThread, CallScreen, CallPill } from './screens/chat';
import { ScreenNotifs, ScreenAccount, ScreenNotifPrefs, ScreenTutorial } from './screens/account';

/**
 * FAD V2 — Field-staff PWA shell.
 * Ported from the Claude Design export (fad-proto.jsx) and adapted for the real
 * app: stack-based nav, ticking timer, sticky running-timer pill, ＋→report.
 * Screens persist via tasksClient/teamInboxClient; this shell holds only
 * ephemeral UI state (stack, elapsed seconds, optimistic requirement mirror).
 *
 * Mounted only for role==='field' (see FadApp). Real feature — the demo gaps
 * are the individual screens' fakes, tracked in DEMO_CRUFT.md (PROD-FIELD-*).
 */

interface StackEntry { screen: string; params: Record<string, unknown> | null; dir: Dir; }
type TimerEntry = TimerState & { title?: string };

const TAB_SCREEN: Record<string, string> = { tasks: 'tasks', chat: 'chatlist', history: 'history', account: 'account' };

function Placeholder({ screen }: { screen?: string }) {
  return (
    <div className="fad">
      <div className="fad-body"><div className="fad-scroll">
        <div className="successwrap" style={{ marginTop: 80 }}>
          <div className="aigate" style={{ borderStyle: 'solid' }}>
            <span className="ic"><Icon n="sparkle" s={1.8} /></span>
            <span className="tx"><b>{screen}</b> — coming up in this build.</span>
          </div>
        </div>
      </div></div>
    </div>
  );
}

export default function FieldApp() {
  const [tab, setTab] = useState('tasks');
  const [stack, setStack] = useState<StackEntry[]>([{ screen: 'tasks', params: null, dir: 'fwd' }]);
  const [timers, setTimers] = useState<Record<string, TimerEntry>>({});
  const [reqs, setReqs] = useState<Record<string, ReqUiState>>({});
  const [call, setCall] = useState<CallState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // tick running timers + the active call
  useEffect(() => {
    const iv = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id in prev) {
          if (prev[id].status === 'running') { next[id] = { ...prev[id], elapsed: prev[id].elapsed + 1 }; changed = true; }
        }
        return changed ? next : prev;
      });
      setCall((c) => (c ? { ...c, elapsed: c.elapsed + 1 } : c));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // scroll to top on navigation
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [stack.length, tab]);

  const emptyReq = (): ReqUiState => ({ checks: {}, counts: {}, photos: 0, itemPhotos: {} });

  const nav: FieldNav = {
    go(screen, params = null, dir = 'fwd') { setStack((s) => [...s, { screen, params, dir }]); },
    back() { setStack((s) => (s.length > 1 ? s.slice(0, -1).map((x, i, a) => (i === a.length - 1 ? { ...x, dir: 'back' } : x)) : s)); },
    tab(k) { setTab(k); setStack([{ screen: TAB_SCREEN[k] || 'tasks', params: null, dir: 'fwd' }]); },
    current: tab,
    openSheet() {}, closeSheet() {},
    timerFor(id) { return timers[id] || { status: 'idle', elapsed: 0 }; },
    startTimer(id, title) { setTimers((t) => ({ ...t, [id]: { status: 'running', elapsed: (t[id] && t[id].elapsed) || 0, title: title || (t[id] && t[id].title) } })); },
    pauseTimer(id) { setTimers((t) => ({ ...t, [id]: { ...(t[id] || { elapsed: 0 }), status: 'paused' } })); },
    resumeTimer(id) { setTimers((t) => ({ ...t, [id]: { ...(t[id] || { elapsed: 0 }), status: 'running' } })); },
    completeTimer(id) { setTimers((t) => ({ ...t, [id]: { ...(t[id] || { elapsed: 0 }), status: 'done' } })); },
    seedTimer(id, elapsed, status = 'idle') { setTimers((t) => (t[id] ? t : { ...t, [id]: { status, elapsed, title: undefined } })); },
    reqFor(id) { return reqs[id] || emptyReq(); },
    toggleCheck(id, key) { setReqs((r) => { const cur = r[id] || emptyReq(); return { ...r, [id]: { ...cur, checks: { ...cur.checks, [key]: !cur.checks[key] } } }; }); },
    setCount(id, key, val) { setReqs((r) => { const cur = r[id] || emptyReq(); return { ...r, [id]: { ...cur, counts: { ...cur.counts, [key]: Math.max(0, val) } } }; }); },
    addPhoto(id) { setReqs((r) => { const cur = r[id] || emptyReq(); return { ...r, [id]: { ...cur, photos: cur.photos + 1 } }; }); },
    addItemPhoto(id, key) { setReqs((r) => { const cur = r[id] || emptyReq(); const ip = cur.itemPhotos || {}; return { ...r, [id]: { ...cur, itemPhotos: { ...ip, [key]: (ip[key] || 0) + 1 } } }; }); },
    seedReq(id, seed) { setReqs((r) => (r[id] ? r : { ...r, [id]: { ...emptyReq(), ...seed } })); },
    call,
    startCall(withName, type = 'audio') { setCall({ with: withName, type, elapsed: 0, minimized: false }); },
    endCall() { setCall(null); },
    minimizeCall() { setCall((c) => (c ? { ...c, minimized: true } : c)); },
    expandCall() { setCall((c) => (c ? { ...c, minimized: false } : c)); },
  };

  const cur = stack[stack.length - 1];
  const SCREENS: Record<string, ComponentType<any>> = {
    tasks: ScreenTasks,
    history: ScreenHistory,
    detail: ScreenDetail,
    requirements: ScreenRequirements,
    complete: ScreenComplete,
    supplies: ScreenSupplies,
    expense: ScreenExpense,
    comments: ScreenComments,
    report: ScreenReport,
    reports: ScreenReports,
    property: ScreenProperty,
    aihelp: ScreenAIHelp,
    chatlist: ScreenChat,
    chatthread: ScreenChatThread,
    notifs: ScreenNotifs,
    account: ScreenAccount,
    notifprefs: ScreenNotifPrefs,
    tutorial: ScreenTutorial,
  };
  const Comp = SCREENS[cur.screen] || (() => <Placeholder screen={cur.screen} />);

  // sticky running-timer pill (hidden while you're already on that task's detail)
  const runId = Object.keys(timers).find((id) => timers[id].status === 'running' || timers[id].status === 'paused');
  const runTimer = runId ? timers[runId] : null;
  const curTaskId = (cur.params && (cur.params.task as { id?: string } | undefined)?.id) || (cur.params && (cur.params.taskId as string | undefined));
  const onOwnTask = ['detail', 'complete', 'requirements'].includes(cur.screen) && curTaskId === runId;
  const showPill = runTimer && runId && !onOwnTask;

  return (
    <NavCtx.Provider value={nav}>
      <div className="ff-app">
        <div className={'scr ' + (cur.dir || 'fwd')} key={stack.length + '-' + cur.screen} ref={scrollRef}
          style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
          <Comp {...(cur.params || {})} curTab={tab} />
        </div>

        {showPill && runId && (
          <div className={'timerpill' + (timers[runId].status === 'paused' ? ' paused' : '')}
            onClick={() => nav.go('detail', { taskId: runId })}>
            <span className="pdot" />
            <span className="ptime">{fmtTimer(timers[runId].elapsed)}</span>
            {timers[runId].title && <span className="pname">· {timers[runId].title}</span>}
            <span className="pgo"><Icon n="chevR" s={2.4} /></span>
          </div>
        )}

        {/* in-app call overlays — persist across navigation. @demo:ui (local sim) */}
        {call && !call.minimized && <CallScreen />}
        {call && call.minimized && <CallPill />}
      </div>
    </NavCtx.Provider>
  );
}
