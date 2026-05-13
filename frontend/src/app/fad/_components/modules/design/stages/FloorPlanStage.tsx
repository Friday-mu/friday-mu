'use client';

// Floor plan stage (design-be-13) — dedicated 18-stage workflow step
// between payment-gate and moodboard. Owns the FloorPlanGenerator
// modal trigger + the pinned clean-floor-plan preview. The button used
// to live inside SiteVisitStage; it was relocated here so the workflow
// stage list and the UI affordance match 1:1.
//
// Hydration follows the same pattern as MoodboardStage: useHydrate-
// DesignProject refetches the project row after the modal saves so
// project.floorPlanImageId updates, then loadProjectFloorPlan resolves
// the pinned asset for the preview.

import { useEffect, useState } from 'react';
import type { DesignProject } from '../../../../_data/design';
import { FloorPlanGenerator } from '../FloorPlanGenerator';
import { loadProjectFloorPlan, useHydrateDesignProject } from '../../../../_data/designClient';
import type { ApiAsset, FloorPlanGenerationResult } from '../../../../_data/designClient';

interface Props {
  project: DesignProject;
}

export function FloorPlanStage({ project }: Props) {
  const [showModal, setShowModal] = useState(false);
  const { refetch: refetchProject } = useHydrateDesignProject(project.id);

  const [floorPlan, setFloorPlan] = useState<ApiAsset | null>(null);
  const floorPlanId = project.floorPlanImageId ?? null;
  useEffect(() => {
    let alive = true;
    if (!floorPlanId) { setFloorPlan(null); return; }
    loadProjectFloorPlan(project.id)
      .then((row) => { if (alive) setFloorPlan(row); })
      .catch(() => { if (alive) setFloorPlan(null); });
    return () => { alive = false; };
  }, [project.id, floorPlanId]);

  function handleFloorPlanSaved(_result: FloorPlanGenerationResult) {
    setShowModal(false);
    // Refetch so floor_plan_image_id propagates into
    // project.floorPlanImageId and the preview reloads.
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
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Floor plan</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Generate a clean top-down layout from the client&apos;s rough sketch. Used as the
              base canvas for downstream design packs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            data-ai-feature="floor-plan-generator"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
              fontWeight: 500,
              border: '0.5px solid var(--color-border-secondary)',
              cursor: 'pointer',
            }}
            title="Upload client's messy floor plan; Nanobanana redraws it cleanly"
          >
            📐 {floorPlanId ? 'Regenerate floor plan' : 'Generate floor plan'}
          </button>
        </div>

        {floorPlanId ? (
          floorPlan?.storage_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={floorPlan.storage_url}
                alt="Generated floor plan"
                style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                  marginTop: 6,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span>{floorPlan.mime_type ?? 'image/png'}</span>
                {typeof floorPlan.byte_size === 'number' && <span>{Math.round(floorPlan.byte_size / 1024)} KB</span>}
                <span style={{ fontFamily: 'monospace' }}>{floorPlan.sha256.slice(0, 12)}…</span>
              </div>
            </>
          ) : (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              Loading floor plan…
            </div>
          )
        ) : (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
              border: '1px dashed var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            No floor plan pinned yet. Generate one from the client&apos;s rough sketch.
          </div>
        )}
      </Card>

      {showModal && (
        <FloorPlanGenerator
          projectId={project.id}
          onSaved={handleFloorPlanSaved}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
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
