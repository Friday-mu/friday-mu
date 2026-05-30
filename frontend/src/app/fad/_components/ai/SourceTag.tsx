'use client';

// FAD V2 — Source / provenance primitive (SPEC-Remaining-Modules.md §1.1).
//
// The redesign's core principle: FAD unifies Guesty (commercial truth) + Breezeway
// (operational truth) + FAD-owned data + modeled forecasts, and EVERY critical field
// must declare where it came from and how fresh it is. This is the reusable per-field
// treatment everything else depends on ("build first").
//
// Six source kinds, each a small mono chip + dot, using the V2 status tokens.
// Tag: PROD-AI-TRUST-2 (companion to PROD-AI-TRUST-1).

import { type ReactNode } from 'react';
import { ConfBar } from './TrustStates';
import { type ConfidenceBand } from './aiHealth';

export type SourceKind = 'guesty' | 'breezeway' | 'friday' | 'modeled' | 'stale' | 'failed';

const SOURCE_META: Record<SourceKind, { label: string }> = {
  guesty: { label: 'Guesty' }, // commercial truth (reservations, payouts, listing)
  breezeway: { label: 'Breezeway' }, // ops/condition truth (tasks, evidence, access)
  friday: { label: 'FAD' }, // FAD-owned record (vetted tasks, teachings, design budget)
  modeled: { label: 'modeled' }, // forecast/estimate, not observed
  stale: { label: 'stale' }, // last sync past threshold
  failed: { label: 'sync failed' }, // sync errored
};

/**
 * Inline source/freshness chip. `syncedAt` is a human relative time ("12m ago");
 * for `stale` it's appended to the label. `failed` shows a Reconnect affordance.
 */
export function SourceTag({
  kind,
  syncedAt,
  onReconnect,
}: {
  kind: SourceKind;
  syncedAt?: string;
  onReconnect?: () => void;
}) {
  const meta = SOURCE_META[kind];
  const title =
    kind === 'failed'
      ? `${meta.label} — reconnect required`
      : syncedAt
        ? `from ${meta.label} · synced ${syncedAt}`
        : meta.label;
  return (
    <span className={'srctag ' + kind} title={title}>
      <span className="srctag-dot" />
      {meta.label}
      {kind === 'stale' && syncedAt ? ` ${syncedAt}` : ''}
      {kind === 'failed' && onReconnect && (
        <span
          className="srctag-act"
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

/**
 * A labelled data field that declares its provenance. Modeled values always pair
 * with a confidence meter (per spec). Use across detail records (Properties spine,
 * Reservation detail, Finance figures, Owner statements, etc.).
 */
export function Field({
  label,
  value,
  source,
  syncedAt,
  confidence,
  onReconnect,
}: {
  label: string;
  value: ReactNode;
  source?: SourceKind;
  syncedAt?: string;
  /** Required-ish when source is 'modeled' — shows the confidence meter. */
  confidence?: ConfidenceBand | number | null;
  onReconnect?: () => void;
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">
        <span className="field-v">{value}</span>
        {source && <SourceTag kind={source} syncedAt={syncedAt} onReconnect={onReconnect} />}
        {(source === 'modeled' || confidence != null) && confidence != null && (
          <ConfBar value={confidence} />
        )}
      </div>
    </div>
  );
}
