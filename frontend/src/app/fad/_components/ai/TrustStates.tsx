'use client';

// FAD V2 — AI trust / failure-state components.
//
// Ports the design's `fad-states.jsx` vocabulary (SyncChip, Provenance, ConfBar,
// StateBanner) to real React/TS, using the V2 token classes already in
// gm-desktop.css (.syncchip / .prov / .confbar / .statebanner — added in this
// same change). Unlike the prototype these are driven by a real AIHealthState
// derived from backend signals (see aiHealth.ts), not a manual simulator.
//
// Tag: PROD-AI-TRUST-1 — production component vocabulary, applied to AI surfaces.

import { type ReactNode } from 'react';
import { IconSparkle } from '../icons';
import {
  type AIHealthState,
  type ProvenanceItem,
  type ConfidenceBand,
  confidencePct,
  isConfidenceBand,
} from './aiHealth';

// ── self-contained glyphs (the few state icons not in the repo icon set) ──
function GlyphAlert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function GlyphClock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}
function GlyphShield({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}

// ───────────────────────── SyncChip ─────────────────────────
// Source freshness pill. `source` names the system (Guesty / Breezeway / Friday).
export function SyncChip({
  source = 'Friday',
  health,
  onReconnect,
}: {
  source?: string;
  health: AIHealthState;
  onReconnect?: () => void;
}) {
  const map: Record<AIHealthState, [cls: string, label: string, col: string]> = {
    healthy: ['live', 'Synced · just now', 'var(--green)'],
    stale: ['stale', 'Stale data', 'var(--amber)'],
    partial: ['stale', 'Partial sync', 'var(--amber)'],
    fallback: ['cached', 'Cached copy', 'var(--tx-3)'],
    failed: ['failed', 'Sync failed', 'var(--red)'],
  };
  const [cls, label, col] = map[health] || map.healthy;
  return (
    <span className={'syncchip ' + cls} title={`${source} · ${label}`}>
      <span className="sc-dot" style={{ background: col }} />
      {source} · {label}
      {health === 'failed' && onReconnect && (
        <span
          className="sc-act"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onReconnect();
          }}
        >
          Reconnect
        </span>
      )}
    </span>
  );
}

// ───────────────────────── Provenance ─────────────────────────
// "Grounded in …" chips; degrades to fallback/failed/partial treatments.
export function Provenance({
  items,
  health,
  onRetry,
}: {
  items: ProvenanceItem[];
  health: AIHealthState;
  onRetry?: () => void;
}) {
  if (health === 'fallback') {
    return (
      <div className="prov fallback">
        <GlyphAlert size={16} />
        <span>
          <b>General guidance</b> — not grounded in your data. Verify before acting.
        </span>
      </div>
    );
  }
  if (health === 'failed') {
    return (
      <div className="prov failed">
        <GlyphAlert size={16} />
        <span>
          <b>Couldn&apos;t generate a grounded answer</b> — the model service didn&apos;t respond.
          {onRetry && (
            <>
              {' '}
              <span className="prov-retry" role="button" tabIndex={0} onClick={onRetry}>
                Retry
              </span>
            </>
          )}
        </span>
      </div>
    );
  }
  const shown = health === 'partial' ? items.slice(0, 1) : items;
  if (!shown.length && health !== 'partial') return null;
  return (
    <div className="prov">
      <span className="prov-lbl">Grounded in</span>
      {shown.map((s, i) => (
        <span key={i} className="prov-chip">
          {s.icon === 'spark' && <IconSparkle size={11} />}
          {s.label}
        </span>
      ))}
      {health === 'partial' && (
        <span className="prov-chip miss">
          <GlyphAlert size={11} />
          some source unavailable
        </span>
      )}
    </div>
  );
}

// ───────────────────────── ConfBar ─────────────────────────
// Confidence meter. Accepts a real numeric confidence OR a coarse band.
// For a band we fill to a discrete level and show the WORD — never a fake %.
export function ConfBar({
  value,
}: {
  value: ConfidenceBand | number | null | undefined;
}) {
  const pct = confidencePct(value);
  if (pct == null) return null;
  const tone = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)';
  const band = isConfidenceBand(value);
  const readout = band ? String(value) : `${pct}%`;
  return (
    <span className="confbar" title={`Friday confidence · ${readout}`}>
      <span className="cb-track">
        <i style={{ width: pct + '%', background: tone }} />
      </span>
      <span className="cb-num mono">{readout}</span>
    </span>
  );
}

// ───────────────────────── StateBanner ─────────────────────────
// Surface-level degraded/error banner. Returns null when healthy.
export function StateBanner({
  surface,
  health,
  source,
  onRetry,
  onResync,
}: {
  surface?: string;
  health: AIHealthState;
  source?: string;
  onRetry?: () => void;
  onResync?: () => void;
}) {
  if (health === 'healthy') return null;
  const src = source || 'a source system';
  const M: Record<
    Exclude<AIHealthState, 'healthy'>,
    [tone: string, icon: ReactNode, msg: string]
  > = {
    stale: [
      'amber',
      <GlyphClock key="i" size={16} />,
      `Showing last-known data — ${surface || 'this view'} hasn't re-synced. Live sync is catching up.`,
    ],
    partial: [
      'amber',
      <GlyphShield key="i" size={16} />,
      `Partial context: some source records couldn't be loaded. Answers may be incomplete — unavailable sources are marked below.`,
    ],
    fallback: [
      'indigo',
      <IconSparkle key="i" size={16} />,
      `Friday is answering from general knowledge, not your data. Treat as a starting point and verify.`,
    ],
    failed: [
      'red',
      <GlyphAlert key="i" size={16} />,
      `${src} is unavailable. Actions are paused and recommendations are read-only until it recovers.`,
    ],
  };
  const [tone, icon, msg] = M[health];
  return (
    <div className={'statebanner ' + tone} role="status">
      {icon}
      <span>{msg}</span>
      {health === 'failed' && onRetry && (
        <button className="dbtn ghost sm" style={{ marginLeft: 'auto' }} onClick={onRetry}>
          Retry
        </button>
      )}
      {health === 'stale' && onResync && (
        <button className="dbtn ghost sm" style={{ marginLeft: 'auto' }} onClick={onResync}>
          Re-sync
        </button>
      )}
    </div>
  );
}

// ───────────────────────── AITrustStrip ─────────────────────────
// Convenience row that composes SyncChip + ConfBar + Provenance for an answer.
// Pass the derived health + the real signals; renders nothing extra when healthy
// and ungrounded (so low-signal answers stay quiet).
export function AITrustStrip({
  health,
  source = 'Friday',
  confidence,
  provenance,
  onReconnect,
  onRetry,
}: {
  health: AIHealthState;
  source?: string;
  confidence?: ConfidenceBand | number | null;
  provenance: ProvenanceItem[];
  onReconnect?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="aitrust">
      <div className="aitrust-row">
        <SyncChip source={source} health={health} onReconnect={onReconnect} />
        <ConfBar value={confidence} />
      </div>
      <Provenance items={provenance} health={health} onRetry={onRetry} />
    </div>
  );
}
