'use client';

// Floor plan stage (design-be-13 + design-be-14) — dedicated 17-stage
// workflow step between payment-gate and moodboard. Two sections:
//
//  1. Clean architectural plan — Nanobanana redraw of the client's
//     rough sketch. Owns the FloorPlanGenerator modal trigger + the
//     pinned clean-plan preview. (design-be-13.)
//  2. Furnished floor plan — second-stage pass that overlays furniture
//     onto the clean plan, styled per an approved moodboard. Owns the
//     FurnishedFloorPlanGenerator modal trigger + the pinned furnished
//     preview. Disabled until both prereqs are met. (design-be-14.)
//
// Hydration follows the same pattern as MoodboardStage:
// useHydrateDesignProject refetches the project row after either
// modal saves, then load* helpers resolve the pinned assets for the
// preview.

import { useEffect, useMemo, useState } from 'react';
import type { DesignProject } from '../../../../_data/design';
import { FloorPlanGenerator } from '../FloorPlanGenerator';
import { FurnishedFloorPlanGenerator } from '../FurnishedFloorPlanGenerator';
import {
  loadMoodboards,
  loadProjectFloorPlan,
  loadProjectFurnishedFloorPlan,
  useHydrateDesignProject,
} from '../../../../_data/designClient';
import type {
  ApiAsset,
  ApiMoodboard,
  FloorPlanGenerationResult,
  FurnishedFloorPlanGenerationResult,
} from '../../../../_data/designClient';

interface Props {
  project: DesignProject;
}

export function FloorPlanStage({ project }: Props) {
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [showFurnishedModal, setShowFurnishedModal] = useState(false);
  const { refetch: refetchProject } = useHydrateDesignProject(project.id);

  // ── Clean plan ──
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

  // ── Furnished plan ──
  const [furnished, setFurnished] = useState<ApiAsset | null>(null);
  const furnishedId = project.floorPlanFurnishedImageId ?? null;
  useEffect(() => {
    let alive = true;
    if (!furnishedId) { setFurnished(null); return; }
    loadProjectFurnishedFloorPlan(project.id)
      .then((row) => { if (alive) setFurnished(row); })
      .catch(() => { if (alive) setFurnished(null); });
    return () => { alive = false; };
  }, [project.id, furnishedId]);

  // ── Moodboards (for prereq check + modal dropdown) ──
  const [moodboards, setMoodboards] = useState<ApiMoodboard[]>([]);
  useEffect(() => {
    let alive = true;
    loadMoodboards(project.id)
      .then((rows) => { if (alive) setMoodboards(rows); })
      .catch(() => { if (alive) setMoodboards([]); });
    return () => { alive = false; };
  }, [project.id]);
  const approvedMoodboards = useMemo(
    () => moodboards.filter((mb) => mb.status === 'approved'),
    [moodboards],
  );
  const furnishedEnabled = floorPlanId != null && approvedMoodboards.length > 0;

  function handleCleanSaved(_result: FloorPlanGenerationResult) {
    setShowCleanModal(false);
    refetchProject();
  }
  function handleFurnishedSaved(_result: FurnishedFloorPlanGenerationResult) {
    setShowFurnishedModal(false);
    refetchProject();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ───── Clean architectural plan ───── */}
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
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Clean architectural plan</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Generate a clean top-down layout from the client&apos;s rough sketch. Used as the
              base canvas for downstream design packs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCleanModal(true)}
            data-ai-feature="floor-plan-generator"
            style={triggerBtn(false)}
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
          <div style={emptyState()}>
            {project.tier === 3 ? (
              <>
                Floor plan is <strong>optional</strong> for Tier 3 (design-only) projects — the moodboard
                is the primary deliverable. Generate one from the client&apos;s sketch if you want, or
                skip this step.
              </>
            ) : (
              <>No floor plan pinned yet. Generate one from the client&apos;s rough sketch.</>
            )}
          </div>
        )}
      </Card>

      {/* ───── Furnished floor plan ───── */}
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
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Furnished floor plan</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Overlay furniture &amp; fixtures onto the clean plan in the approved moodboard&apos;s
              aesthetic. Walls, doors, and windows stay untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFurnishedModal(true)}
            disabled={!furnishedEnabled}
            data-ai-feature="furnished-floor-plan-generator"
            style={triggerBtn(!furnishedEnabled)}
            title={
              furnishedEnabled
                ? 'Generate furniture overlay using the approved moodboard as style reference'
                : 'Generate the clean floor plan and approve a moodboard before running this step'
            }
          >
            🛋 {furnishedId ? 'Regenerate furnished plan' : 'Generate furnished floor plan'}
          </button>
        </div>

        {!furnishedEnabled ? (
          <div style={emptyState()}>
            {floorPlanId == null && approvedMoodboards.length === 0 && (
              <>Approve a moodboard <em>and</em> generate the clean floor plan first.</>
            )}
            {floorPlanId == null && approvedMoodboards.length > 0 && (
              <>Generate the clean floor plan first, then come back here.</>
            )}
            {floorPlanId != null && approvedMoodboards.length === 0 && (
              <>Approve a moodboard first, then generate the furnished plan.</>
            )}
          </div>
        ) : furnishedId ? (
          furnished?.storage_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={furnished.storage_url}
                alt="Generated furnished floor plan"
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
                <span>{furnished.mime_type ?? 'image/png'}</span>
                {typeof furnished.byte_size === 'number' && <span>{Math.round(furnished.byte_size / 1024)} KB</span>}
                <span style={{ fontFamily: 'monospace' }}>{furnished.sha256.slice(0, 12)}…</span>
              </div>
            </>
          ) : (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              Loading furnished plan…
            </div>
          )
        ) : (
          <div style={emptyState()}>
            Ready to generate. Click the button above to run the furnishing pass.
          </div>
        )}
      </Card>

      {showCleanModal && (
        <FloorPlanGenerator
          projectId={project.id}
          onSaved={handleCleanSaved}
          onClose={() => setShowCleanModal(false)}
        />
      )}
      {showFurnishedModal && (
        <FurnishedFloorPlanGenerator
          projectId={project.id}
          approvedMoodboards={approvedMoodboards}
          onSaved={handleFurnishedSaved}
          onClose={() => setShowFurnishedModal(false)}
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
