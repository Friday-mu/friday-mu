'use client';

import { useState, useEffect, useRef } from 'react';
import { STAGES, stageDef, type StageId, type StageStatus } from '../../../_data/design';
import { toneStyle, type SemanticTone } from '../../palette';

interface Props {
  currentStage: StageId;
  status: StageStatus;
  /** When clicked the parent navigates to that stage's screen. */
  onStageSelect?: (stageId: StageId) => void;
  /** Compact horizontal pill row for sidebars / dashboards (no labels under). */
  compact?: boolean;
  /**
   * B3.9 per-tier rules: stages flagged optional render with muted styling and
   * a dashed border. Workflow does not block on these. Pass [] (default) for
   * Tier 1 (all 17 mandatory) or unknown.
   */
  optionalStageIds?: StageId[];
  /**
   * design-be-10: Director-only stage rewind. When provided, each completed
   * stage (s.index < currentIndex) renders a small ↶ button that opens a
   * confirmation popover and, on confirm, calls this handler with the stage
   * id. Parent owns the API call + toast + refetch.
   */
  onReopenStage?: (stageId: StageId) => void;
}

const stageTone = (status: StageStatus): SemanticTone => {
  switch (status) {
    case 'in-progress':       return 'info';
    case 'waiting-on-owner':  return 'warning';
    case 'blocked':           return 'danger';
    case 'done':              return 'success';
    case 'skipped':           return 'neutral';
    case 'pending':
    default:                  return 'neutral';
  }
};

// W10 — cluster the 17 stages into 3 visual phases. NCIDQ teaches
// 6 phases; we collapse to 3 (Pre-engagement / Design / Procurement &
// Execution) because that's what STR-hospitality projects actually
// segment into: signing → designing → buying. The cluster labels
// render above the pill ranges in non-compact mode; compact mode
// (sidebars / dashboards) keeps the flat row.
const STAGE_CLUSTERS: Array<{ id: string; label: string; range: [number, number] }> = [
  { id: 'pre-engagement', label: 'Pre-engagement', range: [1, 8] },
  { id: 'design',         label: 'Design',         range: [9, 12] },
  { id: 'execution',      label: 'Procurement & Execution', range: [13, 17] },
];

export function StageTracker({ currentStage, status, onStageSelect, compact, optionalStageIds = [], onReopenStage }: Props) {
  const currentIndex = stageDef(currentStage).index;
  const tone = stageTone(status);
  const activeSwatch = toneStyle(tone);
  const optional = new Set(optionalStageIds);
  const [confirmFor, setConfirmFor] = useState<StageId | null>(null);

  // W10 — render the pills, grouped into 3 cluster sections in
  // non-compact mode. Compact mode keeps the flat row so dashboards
  // / sidebars don't grow vertically.
  const renderPill = (s: typeof STAGES[number]) => {
        const isActive = s.id === currentStage;
        const isDone = s.index < currentIndex;
        const isFuture = s.index > currentIndex;
        const isOptional = optional.has(s.id);
        const canReopen = isDone && !compact && !!onReopenStage;
        const swatch = isActive
          ? activeSwatch
          : isDone
          ? toneStyle('success')
          : { background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
        const titleText = `${s.index}. ${s.label}${isOptional ? ' · optional' : ''}${isActive ? ` · ${status}` : isDone ? ' · done' : ''}`;
        return (
          <div key={s.id} style={{ position: 'relative', display: 'flex', flex: compact ? '0 0 auto' : '1 1 0', minWidth: compact ? 28 : 56 }}>
            <button
              type="button"
              onClick={() => onStageSelect?.(s.id)}
              disabled={!onStageSelect}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              aria-label={titleText}
              title={titleText}
              data-stage-id={s.id}
              data-stage-optional={isOptional ? 'true' : undefined}
              className={`fad-design-stage-pill ${isOptional ? 'is-optional' : ''} ${isActive ? 'is-active' : ''}`.trim()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '100%',
                padding: compact ? '4px 4px' : '6px 4px 4px',
                borderRadius: 'var(--radius-sm)',
                border: isActive
                  ? '1px solid var(--color-brand-accent)'
                  : isOptional && !isDone
                  ? '1px dashed var(--color-border-secondary)'
                  : '1px solid transparent',
                background: swatch.background,
                color: swatch.color,
                cursor: onStageSelect ? 'pointer' : 'default',
                fontSize: compact ? 10 : 11,
                fontWeight: isActive ? 600 : 500,
                gap: compact ? 0 : 2,
                transition: 'background var(--dur-2) var(--ease)',
                opacity: isFuture ? (isOptional ? 0.4 : 0.55) : isOptional && !isActive ? 0.7 : 1,
                overflow: 'hidden',
              }}
            >
              <span
                className="fad-design-stage-pill-num"
                style={{
                  fontFamily: 'var(--font-mono-fad)',
                  fontSize: compact ? 10 : 11,
                  lineHeight: 1,
                }}
              >
                {isDone ? '✓' : s.index}
              </span>
              {!compact && (
                <span
                  className="fad-design-stage-pill-label"
                  style={{
                    fontSize: 10,
                    lineHeight: 1.2,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {s.shortLabel}
                  {isOptional && (
                    <span className="fad-design-stage-pill-optional" style={{ marginLeft: 4, fontSize: 9, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                      {' '}(opt.)
                    </span>
                  )}
                </span>
              )}
            </button>
            {canReopen && (
              <button
                type="button"
                data-stage-reopen={s.id}
                aria-label={`Reopen ${s.label}`}
                title={`Reopen ${s.label}`}
                onClick={(e) => { e.stopPropagation(); setConfirmFor(s.id); }}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 16,
                  height: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-full)',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 10,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {'↶'}
              </button>
            )}
            {confirmFor === s.id && (
              <ReopenConfirmPopover
                stageLabel={s.label}
                onCancel={() => setConfirmFor(null)}
                onConfirm={() => { setConfirmFor(null); onReopenStage?.(s.id); }}
              />
            )}
          </div>
    );
  };

  // Compact mode — flat horizontal scroll, no cluster headers.
  if (compact) {
    return (
      <div
        className="fad-design-stage-tracker"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 0,
          WebkitOverflowScrolling: 'touch',
        }}
        role="list"
        aria-label="Project stage tracker"
      >
        {STAGES.map((s) => renderPill(s))}
      </div>
    );
  }

  // Full mode — three cluster sections. Each cluster renders a small
  // uppercase header above its pill range. The current cluster
  // (containing the active stage) gets a stronger accent color.
  const currentClusterId = STAGE_CLUSTERS.find((c) => currentIndex >= c.range[0] && currentIndex <= c.range[1])?.id;
  return (
    <div
      className="fad-design-stage-tracker fad-design-stage-tracker-clustered"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 6,
        WebkitOverflowScrolling: 'touch',
      }}
      role="list"
      aria-label="Project stage tracker"
    >
      {STAGE_CLUSTERS.map((cluster) => {
        const clusterStages = STAGES.filter((s) => s.index >= cluster.range[0] && s.index <= cluster.range[1]);
        const isCurrentCluster = cluster.id === currentClusterId;
        return (
          <div
            key={cluster.id}
            data-stage-cluster={cluster.id}
            style={{
              // Size each cluster to its pill content (sum of pill minWidths
              // + gaps) instead of dividing the row into 3 equal columns.
              // The equal-column layout caused pre-engagement (8 pills × 56)
              // to overflow its allotted ~1/3 width on desktop and severely
              // on mobile — pills literally rendered on top of the next
              // cluster's pills. With content-sized clusters the parent's
              // overflowX:auto handles horizontal scroll cleanly.
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              flex: '0 0 auto',
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isCurrentCluster ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)',
                paddingLeft: 2,
              }}
            >
              {cluster.label}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
              {clusterStages.map((s) => renderPill(s))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReopenConfirmPopover({
  stageLabel,
  onConfirm,
  onCancel,
}: {
  stageLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    // Defer so the click that opened the popover doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onEsc);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Confirm stage reopen"
      data-stage-reopen-confirm
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 0,
        zIndex: 40,
        width: 240,
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        padding: 10,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-primary)', marginBottom: 8 }}>
        Reopen <strong>{stageLabel}</strong>? This marks the stage as in-progress
        again. Locked documents won&apos;t be affected.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-background-tertiary)',
            color: 'var(--color-text-primary)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          data-stage-reopen-confirm-button
          onClick={onConfirm}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-brand-accent)',
            color: '#fff',
            fontWeight: 500,
          }}
        >
          Reopen
        </button>
      </div>
    </div>
  );
}

export function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'in-progress':      return 'In progress';
    case 'waiting-on-owner': return 'Waiting on owner';
    case 'blocked':          return 'Blocked';
    case 'done':             return 'Done';
    case 'skipped':          return 'Skipped';
    case 'pending':
    default:                 return 'Pending';
  }
}
