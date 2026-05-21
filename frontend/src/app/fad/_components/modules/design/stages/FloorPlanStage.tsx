'use client';

// Floor plan stage — entry point for the Conversational Floor-Plan
// Editor (Phase 2D). The OLD single-shot FloorPlanGenerator and
// FurnishedFloorPlanGenerator have been deleted; both jobs are now
// handled inside FloorPlanStudio (tracing editor → chat → render).
//
// This stage is intentionally light: one trigger button that opens
// the studio. The studio owns versions, chats, lazy renders, save-
// as-final, and revert.
//
// Hydration: useHydrateDesignProject still refetches the project row
// after the modal closes so any project-level pointers (kept around
// for backwards compat) stay consistent.

import { useState } from 'react';
import type { DesignProject } from '../../../../_data/design';
import { FloorPlanStudio } from '../FloorPlanStudio';
import { useHydrateDesignProject } from '../../../../_data/designClient';

interface Props {
  project: DesignProject;
}

export function FloorPlanStage({ project }: Props) {
  const [open, setOpen] = useState(false);
  const { refetch: refetchProject } = useHydrateDesignProject(project.id);

  function handleClose() {
    setOpen(false);
    refetchProject();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Floor plan studio</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Trace the property plan, then chat with Friday to add furniture, change colours,
              and iterate on the layout. Each turn produces a new version you can revert to.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-ai-feature="floor-plan-studio"
            style={triggerBtn(false)}
            title="Open the conversational floor plan editor"
          >
            🗺 Open floor plan studio
          </button>
        </div>

        {project.tier === 3 ? (
          <div style={emptyState()}>
            Floor plan is <strong>optional</strong> for Tier 3 (design-only) projects — the moodboard
            is the primary deliverable. Open the studio if you want to produce one.
          </div>
        ) : (
          <div style={emptyState()}>
            Open the studio to start. You&apos;ll trace walls/doors/windows over the client&apos;s
            plan, then iterate via chat.
          </div>
        )}
      </Card>

      {open && (
        <FloorPlanStudio
          projectId={project.id}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

function emptyState(): React.CSSProperties {
  return {
    padding: 24,
    textAlign: 'center',
    color: 'var(--color-text-tertiary)',
    fontSize: 13,
    border: '1px dashed var(--color-border-secondary)',
    borderRadius: 'var(--radius-sm)',
  };
}

function triggerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-secondary)' : 'var(--color-background-tertiary)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 500,
    border: '0.5px solid var(--color-border-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}
