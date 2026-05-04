'use client';

import {
  designClient,
  formatClassification,
  formatTier,
  type DesignProject,
} from '../../../_data/design';
import { toneStyle } from '../../palette';
import { stageStatusLabel } from './StageTracker';
import { LifecycleMenu } from './LifecycleMenu';

interface Props {
  project: DesignProject;
  onOpenOwnerPortal?: () => void;
  onBack?: () => void;
  /** Called after the lifecycle menu mutates the project (pause/cancel/resume). */
  onLifecycleChange?: () => void;
}

const Chip = ({ label, tone }: { label: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent' }) => {
  const sw = toneStyle(tone);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        background: sw.background,
        color: sw.color,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
};

export function ProjectContextBar({ project, onOpenOwnerPortal, onBack, onLifecycleChange }: Props) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);

  const tierTone = project.tier === 1 ? 'accent' : project.tier === 2 ? 'info' : project.tier === 3 ? 'neutral' : 'neutral';
  const stageTone =
    project.stageStatus === 'in-progress'      ? 'info' :
    project.stageStatus === 'waiting-on-owner' ? 'warning' :
    project.stageStatus === 'blocked'          ? 'danger' :
    project.stageStatus === 'done'             ? 'success' :
                                                  'neutral';
  const lifecyclePill =
    project.lifecycleStatus === 'paused'
      ? { label: 'Paused', tone: 'warning' as const }
      : project.lifecycleStatus === 'cancelled'
      ? { label: 'Cancelled', tone: 'danger' as const }
      : null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--color-background-primary)',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-background-tertiary)',
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          ← All projects
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-friday-fad)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
            }}
          >
            {project.name}
          </h2>
          <Chip label={formatClassification(project.classification)} tone="neutral" />
          <Chip label={formatTier(project.tier)} tone={tierTone} />
          <Chip label={stageStatusLabel(project.stageStatus)} tone={stageTone} />
          {lifecyclePill && <Chip label={lifecyclePill.label} tone={lifecyclePill.tone} />}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            flexWrap: 'wrap',
          }}
        >
          {counterparty && (
            <span title="Counterparty (§7.ZZ)">
              <span style={{ color: 'var(--color-text-tertiary)' }}>Owner: </span>
              <span style={{ color: 'var(--color-text-info)' }}>{counterparty.fullName}</span>
            </span>
          )}
          {property && (
            <span title="Property">
              <span style={{ color: 'var(--color-text-tertiary)' }}> · Property: </span>
              <span style={{ color: 'var(--color-text-info)' }}>{property.name}</span>
            </span>
          )}
          {project.designLeadUserId && (
            <span>
              <span style={{ color: 'var(--color-text-tertiary)' }}> · Lead: </span>
              <span>{project.designLeadUserId.replace('u-', '')}{project.designLeadUserId.endsWith('-ext') ? ' (ext)' : ''}</span>
            </span>
          )}
          <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>
            entity_id={project.entityId}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {onOpenOwnerPortal && (
          <button
            type="button"
            onClick={onOpenOwnerPortal}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Open owner portal preview
          </button>
        )}
        <LifecycleMenu project={project} onChange={() => onLifecycleChange?.()} />
      </div>
    </div>
  );
}
