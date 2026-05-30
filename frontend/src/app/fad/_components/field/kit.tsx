'use client';

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, P } from './icons';
import type { TaskPriority } from '../../_data/tasks';

/* ───────────────────────── nav context ───────────────────────── */

export type Dir = 'fwd' | 'back' | 'up';
export interface TimerState { status: 'idle' | 'running' | 'paused' | 'done'; elapsed: number; }
export interface ReqUiState {
  checks: Record<string, boolean>;
  counts: Record<string, number>;
  photos: number;
  itemPhotos: Record<string, number>;
}
export interface CallState { with: string; type: 'audio' | 'video'; elapsed: number; minimized: boolean; }

export interface FieldNav {
  go(screen: string, params?: Record<string, unknown> | null, dir?: Dir): void;
  back(): void;
  tab(k: string): void;
  current: string;
  openSheet(): void;
  closeSheet(): void;
  // timer (ephemeral UI state; screens persist via tasksClient.updateTask)
  timerFor(id: string): TimerState;
  startTimer(id: string, title?: string): void;
  pauseTimer(id: string): void;
  resumeTimer(id: string): void;
  completeTimer(id: string): void;
  seedTimer(id: string, elapsed: number, status?: TimerState['status']): void;
  // requirements (optimistic UI mirror; screens persist via updateTask)
  reqFor(id: string): ReqUiState;
  toggleCheck(id: string, key: string): void;
  setCount(id: string, key: string, val: number): void;
  addPhoto(id: string): void;
  addItemPhoto(id: string, key: string): void;
  seedReq(id: string, seed: Partial<ReqUiState>): void;
  // calls
  call: CallState | null;
  startCall(withName: string, type?: 'audio' | 'video'): void;
  endCall(): void;
  minimizeCall(): void;
  expandCall(): void;
}

const EMPTY_REQ: ReqUiState = { checks: {}, counts: {}, photos: 0, itemPhotos: {} };

export const NAV_STUB: FieldNav = {
  go() {}, back() {}, tab() {}, current: 'tasks', openSheet() {}, closeSheet() {},
  timerFor() { return { status: 'idle', elapsed: 0 }; },
  startTimer() {}, pauseTimer() {}, resumeTimer() {}, completeTimer() {}, seedTimer() {},
  reqFor() { return EMPTY_REQ; },
  toggleCheck() {}, setCount() {}, addPhoto() {}, addItemPhoto() {}, seedReq() {},
  call: null, startCall() {}, endCall() {}, minimizeCall() {}, expandCall() {},
};

export const NavCtx = createContext<FieldNav | null>(null);
export const useFieldNav = (): FieldNav => useContext(NavCtx) ?? NAV_STUB;

/* ───────────────────────── time formatting ───────────────────────── */

export function fmtTimer(sec: number): string {
  sec = sec || 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export function fmtDur(sec: number): string {
  sec = sec || 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/* ───────────────────────── chrome ───────────────────────── */

export function AppHeader({ eyebrow, title, sub, alert = true, onSearch = true }: {
  eyebrow?: string; title: string; sub?: string; alert?: boolean; onSearch?: boolean;
}) {
  const nav = useFieldNav();
  return (
    <div className="apphead">
      <div className="head-row">
        <div className="col" style={{ gap: 3, minWidth: 0, flex: 1 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onSearch && <div className="iconbtn tap"><Icon n="search" s={2} /></div>}
          <div className={'iconbtn tap' + (alert ? ' alert' : '')} onClick={() => nav.go('notifs')}><Icon n="bell" s={2} /></div>
        </div>
      </div>
    </div>
  );
}

export function AskBar({ scope = 'Operations' }: { scope?: string }) {
  const nav = useFieldNav();
  return (
    <div className="askbar tap" onClick={() => nav.go('aihelp')}>
      <span className="spark" style={{ fontSize: 16 }}><Icon n="sparkle" s={1.6} /></span>
      <span className="ask-tx">Ask Friday</span>
      <span className="ask-hint">{scope}</span>
    </div>
  );
}

const TAB_ITEMS: Array<{ k: string; n: string; l: string; fab?: boolean }> = [
  { k: 'tasks', n: 'list', l: 'Tasks' },
  { k: 'chat', n: 'msg', l: 'Chat' },
  { k: 'add', n: 'plus', l: '', fab: true },
  { k: 'history', n: 'clock', l: 'History' },
  { k: 'account', n: 'user', l: 'Account' },
];

export function TabBar({ active = 'tasks' }: { active?: string }) {
  const nav = useFieldNav();
  return (
    <div className="tabbar">
      {TAB_ITEMS.map((it) => it.fab ? (
        // Field staff REPORT issues (manager-vetted) — they never create tasks directly.
        <div key={it.k} className="fab tap" onClick={() => nav.go('report', null, 'up')}><Icon n="plus" s={2.4} /></div>
      ) : (
        <div key={it.k} className={'tabitem tap' + (active === it.k ? ' on' : '')} onClick={() => nav.tab(it.k)}>
          <Icon n={it.n} s={2} /><span>{it.l}</span>
        </div>
      ))}
    </div>
  );
}

export function BackBtn({ label = 'Back' }: { label?: string }) {
  const nav = useFieldNav();
  return <div className="backbtn tap" onClick={() => nav.back()}><Icon n="chevL" s={2.2} /> {label}</div>;
}

/* ───────────────────────── atoms ───────────────────────── */

const PRI_GLYPH: Record<TaskPriority, string> = {
  urgent: 'chevsU', high: 'arrowU', medium: 'diamond', low: 'chevsD', lowest: 'chevsD',
};
const PRI_CLASS: Record<TaskPriority, string> = {
  urgent: 'urgent', high: 'high', medium: 'med', low: 'low', lowest: 'low',
};

export function PriorityGlyph({ level }: { level: TaskPriority }) {
  const glyph = PRI_GLYPH[level] || 'diamond';
  const cls = PRI_CLASS[level] || 'med';
  const fill = level === 'medium';
  const segs = (P[glyph] || '').split('M').filter(Boolean)
    .map((s) => `<path d="M${s}"/>`).join('');
  return (
    <span className={'pri ' + cls}>
      <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: segs }} />
    </span>
  );
}

export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'indigo' | 'violet';
export function Badge({ tone = 'gray', dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return <span className={'badge ' + tone + (dot ? ' dot' : '')}>{children}</span>;
}

export function SrcChip({ src = 'bz', children, lock = true }: { src?: 'bz' | 'gy'; children: ReactNode; lock?: boolean }) {
  return (
    <span className={'srcchip ' + src}>
      {lock && <span className="lock" style={{ fontSize: 9 }}><Icon n="lock" s={2.2} /></span>}
      {children}
    </span>
  );
}

export type OccState = 'in' | 'vacant' | 'soon';
export function Occ({ state = 'in', children }: { state?: OccState; children: ReactNode }) {
  return <span className={'occ ' + state}>{children}</span>;
}

export interface TaskCardProps {
  pcode: string;
  addr?: string;
  title: string;
  meta?: string[];
  priority?: TaskPriority;
  accent?: 'red' | 'amber' | 'indigo' | 'green';
  occ?: string;
  occState?: OccState;
  source?: { src: 'bz' | 'gy'; label: string };
  assignee?: string;
  selected?: boolean;
  due?: { tone: BadgeTone; label: string };
  onClick?: () => void;
}

export function TaskCard({ pcode, addr, title, meta, priority = 'medium', accent, occ, occState, source, assignee, selected, due, onClick }: TaskCardProps) {
  return (
    <div className={'tcard' + (accent ? ' accent ' + accent : '') + (selected ? ' sel' : '') + (onClick ? ' tap' : '')} onClick={onClick}>
      <div className="t-top">
        <span className="pcode">{pcode}</span>
        {addr && <span className="addr">{addr}</span>}
        <span className="grow" />
        {due && <Badge tone={due.tone}>{due.label}</Badge>}
      </div>
      <div className="title">{title}</div>
      {meta && meta.length > 0 && (
        <div className="meta">
          {meta.map((m, i) => (<span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="d">·</span>}<span>{m}</span></span>))}
        </div>
      )}
      <div className="t-foot">
        <PriorityGlyph level={priority} />
        {occ && <Occ state={occState}>{occ}</Occ>}
        <span className="grow" />
        {source && <SrcChip src={source.src}>{source.label}</SrcChip>}
        {assignee && <span className="avatar">{assignee}</span>}
      </div>
    </div>
  );
}

export function MLabel({ children, count, rule = true }: { children: ReactNode; count?: ReactNode; rule?: boolean }) {
  return (
    <div className="mlabel">
      <span>{children}</span>
      {count != null && <span className="ct">{count}</span>}
      {rule && <span className="rule" />}
    </div>
  );
}

/* searchable property picker — fed a {code,name}[] list by the caller */
export function PropPicker({ value, onChange, properties = [] }: {
  value?: string; onChange?: (code: string) => void; properties?: Array<{ code: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = properties.filter((p) => (p.code + ' ' + p.name).toLowerCase().includes(q.toLowerCase()));
  const sel = properties.find((p) => p.code === value);
  return (
    <div className="dd">
      <div className="dd-field tap" onClick={() => setOpen((o) => !o)}>
        <span className="pcode">{value || 'Select'}</span>
        <span className="dd-name">{sel ? sel.name : 'Tap to choose a property'}</span>
        <span className="dd-chev" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><Icon n="chevD" s={2} /></span>
      </div>
      {open && (
        <div className="dd-panel">
          <div className="dd-search">
            <Icon n="search" s={2} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter — e.g. SD or Tamarin" />
            <span className="dd-ct">{list.length}</span>
          </div>
          <div className="dd-list">
            {list.map((p) => (
              <div key={p.code} className="dd-opt tap" onClick={() => { onChange?.(p.code); setOpen(false); setQ(''); }}>
                <span className="pcode">{p.code}</span>
                <span className="dd-oname">{p.name}</span>
                {p.code === value && <span style={{ color: 'var(--indigo-bright)', display: 'flex' }}><Icon n="check" s={2.4} /></span>}
              </div>
            ))}
            {list.length === 0 && <div className="dd-empty">No property matches “{q}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* sub-screen header (back + provenance + title) — used by task sub-screens */
export function SubHead({ task, title }: { task?: { propertyCode: string; title: string; bzId?: string }; title: string }) {
  return (
    <>
      <div className="detailtop">
        <div className="between">
          <BackBtn label={task ? task.title : 'Back'} />
          <div className="row gap6">
            {task?.bzId && <span className="srcchip bz"><Icon n="lock" s={2.2} style={{ fontSize: 9 }} /> #{task.bzId}</span>}
            {task && <span className="badge gray">{task.propertyCode}</span>}
          </div>
        </div>
      </div>
      <div className="apphead" style={{ paddingTop: 12 }}>
        <div className="eyebrow">{task ? `${task.propertyCode} · ${task.title.toUpperCase()}` : ''}</div>
        <h1>{title}</h1>
      </div>
    </>
  );
}

/* small helper used by several screens */
export function SecLink({ ic, ai, title, sum, count, accent, onClick, done }: {
  ic: string; ai?: boolean; title: string; sum: string; count?: ReactNode; accent?: boolean; onClick?: () => void; done?: boolean;
}) {
  return (
    <div className="seclink tap" onClick={onClick} style={accent ? { borderColor: 'var(--indigo-line)' } : undefined}>
      <span className={'sic' + (ai ? ' ai' : '')} style={done ? { background: 'var(--green-ghost)', borderColor: 'transparent', color: 'var(--green)' } as CSSProperties : undefined}><Icon n={ic} s={1.8} /></span>
      <div className="smain">
        <div className="stitle">{title}</div>
        <div className="ssum">{sum}</div>
      </div>
      {count != null && <span className="scount">{count}</span>}
      <span className="schev"><Icon n="chevR" s={2} /></span>
    </div>
  );
}
