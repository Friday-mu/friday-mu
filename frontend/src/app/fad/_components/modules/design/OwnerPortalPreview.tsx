'use client';

import { designClient, type DesignProject } from '../../../_data/design';
import { PortalContent } from './portal/PortalContent';

interface Props {
  project: DesignProject;
  onClose: () => void;
}

/**
 * Internal modal preview of the owner portal. Wraps the same `<PortalContent>`
 * the standalone `/portal/projects/[slug]` route renders, with a banner so the
 * team knows they're looking at a preview.
 */
export function OwnerPortalPreview({ project, onClose }: Props) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--color-background-tertiary)',
          width: '100%',
          maxWidth: 1080,
          maxHeight: '92vh',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            background: 'var(--color-brand-accent)',
            color: '#fff',
            padding: '8px 16px',
            fontSize: 11,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>OWNER PORTAL PREVIEW</strong> — what{' '}
            {counterparty?.fullName ?? 'the owner'} sees. Internal columns stripped.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
            }}
          >
            Close preview
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PortalContent project={project} />
        </div>
      </div>
    </div>
  );
}
