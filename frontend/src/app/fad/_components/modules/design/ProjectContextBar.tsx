'use client';

import { useEffect, useRef, useState } from 'react';
import {
  designClient,
  formatClassification,
  formatTier,
  type DesignProject,
} from '../../../_data/design';
import { toneStyle } from '../../palette';
import { stageStatusLabel } from './StageTracker';
import { LifecycleMenu } from './LifecycleMenu';

const PRINT_DOCS: Array<{ slug: string; label: string; group: string }> = [
  { slug: 'project-summary',  label: 'Project summary',           group: 'Reference' },
  { slug: 'rough-budget',     label: 'Rough budget',              group: 'Pre-agreement' },
  { slug: 'agreement',        label: 'Agreement (Annex A + B)',   group: 'Pre-agreement' },
  { slug: 'fee-invoice',      label: 'Fee invoices',              group: 'Finance' },
  { slug: 'moodboard',        label: 'Moodboard',                 group: 'Design' },
  { slug: 'design-pack',      label: 'Design pack',               group: 'Design' },
  { slug: 'final-budget',     label: 'Final procurement budget',  group: 'Procurement' },
  { slug: 'change-order',     label: 'Change orders',             group: 'Procurement' },
  { slug: 'quote-comparison', label: 'Quote comparison',          group: 'Procurement' },
  { slug: 'reconciliation',   label: 'Reconciliation report',     group: 'Closeout' },
  { slug: 'closeout-binder',  label: 'Closeout binder',           group: 'Closeout' },
];

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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <PrintPreviewMenu project={project} />
        <LifecycleMenu project={project} onChange={() => onLifecycleChange?.()} />
      </div>
    </div>
  );
}

function PrintPreviewMenu({ project }: { project: DesignProject }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Group docs for the menu (preserves PRINT_DOCS array order within each group).
  const groups = new Map<string, typeof PRINT_DOCS>();
  for (const d of PRINT_DOCS) {
    const arr = groups.get(d.group) ?? [];
    arr.push(d);
    groups.set(d.group, arr);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        data-print-previews-toggle
        aria-expanded={open}
        style={{
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-secondary)',
          background: open ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        Print previews ↗
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div
          role="menu"
          data-print-previews-menu
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 30,
            minWidth: 240,
            maxHeight: 'min(60vh, 480px)',
            overflowY: 'auto',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
            padding: '4px 0',
          }}
        >
          {Array.from(groups.entries()).map(([group, docs]) => (
            <div key={group}>
              <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)' }}>
                {group}
              </div>
              {docs.map((d) => (
                <a
                  key={d.slug}
                  href={`/design-docs/${project.slug}/${d.slug}`}
                  target="_blank"
                  rel="noopener"
                  data-doc-link={d.slug}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block',
                    padding: '6px 12px',
                    fontSize: 12,
                    color: 'var(--color-text-primary)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--color-background-secondary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
                >
                  {d.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
