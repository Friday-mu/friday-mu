'use client';

import { useState, type ReactNode } from 'react';
import { DI, DP } from './icons';
import type { TaskPriority } from '../../_data/tasks';

/* priority glyph — accepts the real TaskPriority union (maps to the design's 4 glyphs) */
const PRI_GLYPH: Record<TaskPriority, string> = { urgent: 'chevsU', high: 'arrowU', medium: 'diamond', low: 'chevsD', lowest: 'chevsD' };
const PRI_CLASS: Record<TaskPriority, string> = { urgent: 'urgent', high: 'high', medium: 'med', low: 'low', lowest: 'low' };
export function PriD({ level }: { level: TaskPriority }) {
  const glyph = PRI_GLYPH[level] || 'diamond';
  const cls = PRI_CLASS[level] || 'med';
  const segs = (DP[glyph] || '').split('M').filter(Boolean).map((x) => `<path d="M${x}"/>`).join('');
  return (
    <span className={'pri ' + cls}>
      <svg viewBox="0 0 24 24" fill={level === 'medium' ? 'currentColor' : 'none'} stroke="currentColor"
        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: segs }} />
    </span>
  );
}

export interface GmTab { l: string; ct?: number | string; on?: boolean; onClick?: () => void; }

/**
 * GM desktop screen wrapper. Renders the design's main column (header · tabs ·
 * body) + an optional right-hand Ask-Friday panel, scoped under `.dwrap`, to sit
 * inside FadApp's existing `.fad-main` (we keep the global Header/Sidebar — the
 * shared Topbar/Rail swap is a separate, deliberate change). Mirrors the design's
 * `Shell` minus the global chrome.
 */
export function GmShell({ eyebrow, title, sub, tabs, actions, panel, children }: {
  eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; tabs?: GmTab[]; actions?: ReactNode; panel?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="dwrap">
      <div className={panel ? 'gm-with-panel' : undefined}>
        <div className="dmain">
          <div className="dhead">
            <div style={{ minWidth: 0 }}>
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h1>{title}</h1>
              {sub && <div className="sub">{sub}</div>}
            </div>
            {actions && <div className="row">{actions}</div>}
          </div>
          {tabs && (
            <div className="dtabs">
              {tabs.map((t, i) => (
                <span key={i} className={'dtab' + (t.on ? ' on' : '')} onClick={t.onClick} style={t.onClick ? { cursor: 'pointer' } : undefined}>
                  {t.l}{t.ct != null && <span className="ct">{t.ct}</span>}
                </span>
              ))}
            </div>
          )}
          <div className="dbody">{children}</div>
        </div>
        {panel}
      </div>
    </div>
  );
}

/** Slim "Draft · Apply · Review" Friday bar — Review opens the Ask panel. */
export function FridayBar({ children, badge, actions }: { children: ReactNode; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="fbar">
      <span className="fi"><DI n="spark" s={1.6} /></span>
      <span className="ft">{children}</span>
      {badge}
      {actions && <span className="fb">{actions}</span>}
    </div>
  );
}

export interface AskMsg { me?: boolean; t: string; action?: { t: string; d: string; btn: string }; done?: string; }

/* AF7 — live mode. When `live` is provided, the AskPanel runs as a real Ask Friday
   surface (composer + per-action Approve wired to Core), instead of the static demo.
   The shape is intentionally generic so kit.tsx stays decoupled from FridayDrawer —
   the GM screen adapts `useFridayChat` output into this. */
export interface LiveAskAction {
  id: string;
  label: string;
  summary?: string;
  type: string;            // 'navigate' | 'create_task' | 'send_team_message' | 'request_approval'
  status?: 'idle' | 'running' | 'done' | 'failed';
  resultSummary?: string;
  error?: string;
}
export interface LiveAskMsg {
  id: string;
  me?: boolean;            // true = operator turn
  html: string;            // rendered body (FridayDrawer already produces plain text; we treat as text)
  actions?: LiveAskAction[];
  failed?: boolean;        // AI health === 'failed' → disable mutating actions
}
export interface LiveAsk {
  msgs: LiveAskMsg[];
  thinking?: boolean;
  onSend: (text: string) => void;
  onExecuteAction: (messageId: string, actionId: string) => void;
}

/**
 * Universal Ask Friday right-side panel (thin, squeezes content left), opened by a
 * "Review" button. Two modes:
 *   • static demo — pass `msgs` (AskMsg[]); presentational only.
 *   • LIVE (AF7) — pass `live` (LiveAsk); composer + per-action Approve are wired to
 *     real Ask Friday Core (the GM screen drives it via useFridayChat). Failed AI
 *     health disables mutating actions; navigate stays enabled.
 * Tag: PROD-GM-ASKPANEL-1 (the static path is still @demo:ui until all 3 screens go live).
 */
export function AskPanel({ scope, aware, msgs, live, onClose }: { scope: string; aware: string; msgs?: AskMsg[]; live?: LiveAsk; onClose?: () => void }) {
  return (
    <div className="daside">
      <div className="afp-h">
        <div className="r1">
          <span className="tt"><span className="sp"><DI n="spark" s={1.6} /></span> Ask Friday</span>
          <span className="icbtn" style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={onClose}><DI n="x" s={2} /></span>
        </div>
        <div className="afp-scope">
          <span className="afp-chip" style={{ color: 'var(--indigo-bright)', borderColor: 'var(--indigo-line)' }}><DI n="pin" s={2} style={{ width: 9, height: 9 }} /> {scope}</span>
          <span className="afp-chip">All of FAD</span>
        </div>
        <div className="afp-aware">{aware}</div>
      </div>
      {live ? <AskPanelLiveBody live={live} /> : (
        <>
          <div className="afp-body">
            {(msgs || []).map((m, i) => m.me ? (
              <div key={i} className="afm me"><span className="ava me">FG</span><div className="bub" dangerouslySetInnerHTML={{ __html: m.t }} /></div>
            ) : (
              <div key={i} className="afm">
                <span className="ava fr"><DI n="spark" s={1.5} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="bub" dangerouslySetInnerHTML={{ __html: m.t }} />
                  {m.action && (
                    <div className="afact">
                      <div className="at"><DI n="shield" s={1.7} style={{ color: 'var(--indigo-bright)' }} /> {m.action.t}</div>
                      <div className="adesc">{m.action.d}</div>
                      <div className="arow"><button className="dbtn primary sm"><DI n="check" s={2} /> {m.action.btn}</button><button className="dbtn ghost sm">Tweak</button></div>
                    </div>
                  )}
                  {m.done && <div className="afdone" style={{ marginTop: 8 }}><DI n="check" s={2} /> {m.done}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="afp-comp"><div className="afp-in"><DI n="spark" s={1.6} style={{ color: 'var(--tx-3)' }} /> <span>Ask or tell Friday to act…</span><span className="snd"><DI n="chevR" s={2.2} /></span></div></div>
        </>
      )}
    </div>
  );
}

/* AF7 live body — real chat against Ask Friday Core. Mirrors FridayDrawer's render
   of action cards (running/done/failed) using the generic LiveAsk shape. */
function AskPanelLiveBody({ live }: { live: LiveAsk }) {
  const [draft, setDraft] = useState('');
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    live.onSend(t);
    setDraft('');
  };
  return (
    <>
      <div className="afp-body">
        {live.msgs.map((m) => m.me ? (
          <div key={m.id} className="afm me"><span className="ava me">FG</span><div className="bub">{m.html}</div></div>
        ) : (
          <div key={m.id} className="afm">
            <span className="ava fr"><DI n="spark" s={1.5} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="bub">{m.html}</div>
              {(m.actions || []).map((a) => {
                const isNav = a.type === 'navigate';
                const disabled = a.status === 'running' || a.status === 'done' || (m.failed && !isNav);
                return (
                  <div key={a.id} className="afact">
                    <div className="at"><DI n="shield" s={1.7} style={{ color: 'var(--indigo-bright)' }} /> {a.label}</div>
                    {a.summary && <div className="adesc">{a.summary}</div>}
                    {a.status === 'done' ? (
                      <div className="afdone" style={{ marginTop: 8 }}><DI n="check" s={2} /> {a.resultSummary || 'Done'}</div>
                    ) : a.status === 'failed' ? (
                      <div className="arow">
                        <span className="bdg red" style={{ fontSize: 10.5 }}>{a.error || 'Action failed'}</span>
                        <button className="dbtn ghost sm" onClick={() => live.onExecuteAction(m.id, a.id)}><DI n="undo" s={2} /> Retry</button>
                      </div>
                    ) : (
                      <div className="arow">
                        <button className="dbtn primary sm" disabled={disabled} onClick={() => live.onExecuteAction(m.id, a.id)}>
                          <DI n="check" s={2} /> {a.status === 'running' ? 'Working…' : isNav ? a.label : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {live.thinking && (
          <div className="afm"><span className="ava fr"><DI n="spark" s={1.5} /></span><div className="bub" style={{ color: 'var(--tx-3)' }}>Friday is thinking…</div></div>
        )}
      </div>
      <div className="afp-comp">
        <div className="afp-in">
          <DI n="spark" s={1.6} style={{ color: 'var(--tx-3)' }} />
          <input
            className="afp-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask or tell Friday to act…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tx)', font: 'inherit' }}
          />
          <span className="snd" onClick={send} style={{ cursor: 'pointer' }}><DI n="chevR" s={2.2} /></span>
        </div>
      </div>
    </>
  );
}

/* ── Provenance source chip — V2 "source of truth" indicator ──────────────────
   Shows which system owns a field: Guesty (commercial), Breezeway (operational),
   Friday-owned, modeled/forecast, stale, or failed-sync. Base layout = .srcbz;
   colour/border variants live in gm-desktop.css. Cross-cutting — used across
   the property spine, reservation detail drawer, etc. (FAD V2 defining concept). */
export type ProvenanceSource = 'guesty' | 'breezeway' | 'friday' | 'modeled' | 'stale' | 'failed';
const SRC_META: Record<ProvenanceSource, { variant: string; label: string }> = {
  guesty: { variant: 'srcgy', label: 'Guesty' },
  breezeway: { variant: '', label: 'Breezeway' },
  friday: { variant: 'srcfr', label: 'Friday' },
  modeled: { variant: 'srcmodel', label: 'Modeled' },
  stale: { variant: 'srcstale', label: 'Stale' },
  failed: { variant: 'srcfail', label: 'Sync failed' },
};
export function SourceChip({ source, label, lastSyncedAt, dot = true }: {
  source: ProvenanceSource; label?: string; lastSyncedAt?: string | null; dot?: boolean;
}) {
  const m = SRC_META[source] || SRC_META.friday;
  const title = lastSyncedAt ? `${m.label} · synced ${lastSyncedAt}` : `Source: ${m.label}`;
  const cls = ['srcbz', m.variant, dot ? 'srcdot' : ''].filter(Boolean).join(' ');
  return <span className={cls} title={title}>{label || m.label}</span>;
}
