'use client';

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

export function StageTracker({ currentStage, status, onStageSelect, compact, optionalStageIds = [] }: Props) {
  const currentIndex = stageDef(currentStage).index;
  const tone = stageTone(status);
  const activeSwatch = toneStyle(tone);
  const optional = new Set(optionalStageIds);

  return (
    <div
      className="fad-design-stage-tracker"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 4,
        overflowX: 'auto',
        paddingBottom: compact ? 0 : 6,
        WebkitOverflowScrolling: 'touch',
      }}
      role="list"
      aria-label="Project stage tracker"
    >
      {STAGES.map((s) => {
        const isActive = s.id === currentStage;
        const isDone = s.index < currentIndex;
        const isFuture = s.index > currentIndex;
        const isOptional = optional.has(s.id);
        const swatch = isActive
          ? activeSwatch
          : isDone
          ? toneStyle('success')
          : { background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' };
        const titleText = `${s.index}. ${s.label}${isOptional ? ' · optional' : ''}${isActive ? ` · ${status}` : isDone ? ' · done' : ''}`;
        return (
          <button
            key={s.id}
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
              minWidth: compact ? 28 : 56,
              flex: compact ? '0 0 auto' : '1 1 0',
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
                    opt.
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
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
