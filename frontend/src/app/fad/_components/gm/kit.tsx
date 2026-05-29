'use client';

import type { ReactNode } from 'react';
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

/**
 * Universal Ask Friday right-side panel (thin, squeezes content left). Presentational
 * only — opened by a "Review" button. Wiring it to Ask Friday Core is owned by the
 * parallel Ask-Friday session.
 * @demo:ui — static panel; wire to Ask Friday Core later. Tag: PROD-GM-ASKPANEL-1.
 */
export function AskPanel({ scope, aware, msgs, onClose }: { scope: string; aware: string; msgs: AskMsg[]; onClose?: () => void }) {
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
      <div className="afp-body">
        {msgs.map((m, i) => m.me ? (
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
    </div>
  );
}
