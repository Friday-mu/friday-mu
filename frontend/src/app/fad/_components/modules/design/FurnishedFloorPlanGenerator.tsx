'use client';

// Furnished floor plan generator (design-be-14) — modal that triggers
// the second-stage Nanobanana pass: clean architectural plan +
// approved-moodboard reference → furniture & fixtures overlaid in the
// moodboard's aesthetic. Unlike FloorPlanGenerator, no file upload —
// the backend resolves both source images server-side from the
// project's floor_plan_image_id pin + the latest approved moodboard
// (or whichever moodboard the user picks here).
//
// State machine: idle → generating → preview → saving → done | error.
//
// Prereq invariant: this modal is only mounted when the project has
// floorPlanImageId AND at least one approved moodboard. The trigger
// button on FloorPlanStage enforces both before opening.

import { useMemo, useState } from 'react';
import { generateFurnishedFloorPlan } from '../../../_data/designClient';
import type {
  ApiMoodboard,
  FurnishedFloorPlanGenerationResult,
} from '../../../_data/designClient';

interface Props {
  projectId: string;
  approvedMoodboards: ApiMoodboard[]; // pre-filtered to status === 'approved'
  onSaved: (result: FurnishedFloorPlanGenerationResult) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'generating' | 'preview' | 'saving' | 'error';

export function FurnishedFloorPlanGenerator({
  projectId,
  approvedMoodboards,
  onSaved,
  onClose,
}: Props) {
  // Order moodboards newest-first so the default (index 0) is the
  // latest approval — matches the backend's fallback behaviour.
  const sortedMoodboards = useMemo(() => {
    return [...approvedMoodboards].sort((a, b) => {
      const at = a.approved_at ?? a.updated_at ?? '';
      const bt = b.approved_at ?? b.updated_at ?? '';
      return bt.localeCompare(at);
    });
  }, [approvedMoodboards]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [promptHint, setPromptHint] = useState('');
  const [setAsProjectPlan, setSetAsProjectPlan] = useState(true);
  // Default to 'auto' → omit moodboard_id from the payload → backend
  // picks the latest approved. Otherwise the dropdown supplies an
  // explicit id which the user has chosen.
  const [moodboardChoice, setMoodboardChoice] = useState<'auto' | string>('auto');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FurnishedFloorPlanGenerationResult | null>(null);

  async function generate() {
    setPhase('generating');
    setError(null);
    try {
      const res = await generateFurnishedFloorPlan({
        project_id: projectId,
        prompt_hint: promptHint.trim() || undefined,
        moodboard_id: moodboardChoice === 'auto' ? undefined : moodboardChoice,
        set_as_project_plan: setAsProjectPlan,
      });
      setResult(res);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  function save() {
    if (!result) return;
    setPhase('saving');
    // Backend already pinned (if setAsProjectPlan was true). Parent
    // will refetch the project so the new id flows in.
    onSaved(result);
  }

  return (
    <div
      data-ai-feature="furnished-floor-plan-generator"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--color-border-tertiary)',
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Generate furnished floor plan</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Overlays furniture &amp; fixtures onto the clean floor plan in the approved
              moodboard&apos;s aesthetic. Walls, doors, and windows stay untouched.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn()} aria-label="Close">✕</button>
        </div>

        {/* Moodboard chooser — only shown if >1 approved to declutter
            the common case (single approved moodboard). */}
        {sortedMoodboards.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelText()}>Moodboard reference</span>
            <select
              value={moodboardChoice}
              onChange={(e) => setMoodboardChoice(e.target.value)}
              disabled={phase === 'generating' || phase === 'saving'}
              style={selectStyle()}
            >
              <option value="auto">Latest approved (default)</option>
              {sortedMoodboards.map((mb) => (
                <option key={mb.id} value={mb.id}>
                  v{mb.version_number}{mb.name ? ` — ${mb.name}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Prompt hint */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText()}>Prompt hint (optional)</span>
          <textarea
            value={promptHint}
            onChange={(e) => setPromptHint(e.target.value)}
            placeholder="e.g. king bed against north wall, dining for 8, breakfast bar in kitchen…"
            rows={3}
            disabled={phase === 'generating' || phase === 'saving'}
            style={textareaStyle()}
          />
        </label>

        {/* Pin checkbox */}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={setAsProjectPlan}
            onChange={(e) => setSetAsProjectPlan(e.target.checked)}
            disabled={phase === 'generating' || phase === 'saving'}
          />
          <span>Pin as the project&apos;s furnished plan when generation finishes</span>
        </label>

        {/* Preview */}
        {result?.storage_url && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
              Furnished plan
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.storage_url}
              alt="Generated furnished floor plan"
              style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}
            />
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{result.mime_type ?? 'image/png'}</span>
              {typeof result.byte_size === 'number' && <span>{Math.round(result.byte_size / 1024)} KB</span>}
              {typeof result.duration_ms === 'number' && <span>{result.duration_ms}ms{result.cached ? ' (cached)' : ''}</span>}
              {result.prompt_source && <span>prompt: {result.prompt_source}</span>}
              {result.stub && <span style={{ color: 'var(--color-text-warning)' }}>stub — set NANOBANANA_API_KEY</span>}
            </div>
          </div>
        )}

        {phase === 'generating' && (
          <div style={hintBox('info')}>
            Generating furnished plan… Nanobanana usually takes about 9 seconds. Don&apos;t close this window.
          </div>
        )}

        {error && phase === 'error' && (
          <div style={hintBox('danger')}>
            {error.includes('quota') || error.includes('RESOURCE_EXHAUSTED') ? (
              <>API quota exhausted. The Google AI Studio key needs billing enabled on its GCP project — see https://aistudio.google.com/apikey</>
            ) : (
              error
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={secondaryBtn()}>
            {phase === 'preview' ? 'Discard' : 'Cancel'}
          </button>
          {phase !== 'preview' ? (
            <button
              type="button"
              onClick={generate}
              disabled={phase === 'generating' || phase === 'saving'}
              style={primaryBtn(phase === 'generating' || phase === 'saving')}
            >
              {phase === 'generating' ? 'Generating…' : phase === 'error' ? 'Try again' : 'Generate furnished plan'}
            </button>
          ) : (
            <button type="button" onClick={save} style={primaryBtn(false)}>
              {setAsProjectPlan ? 'Done — saved on project' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function labelText(): React.CSSProperties { return { fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function textareaStyle(): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    border: '0.5px solid var(--color-border-tertiary)',
    fontSize: 12,
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    resize: 'vertical',
  };
}
function selectStyle(): React.CSSProperties {
  return {
    padding: 8,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    border: '0.5px solid var(--color-border-tertiary)',
    fontSize: 12,
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
  };
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
    color: disabled ? 'var(--color-text-tertiary)' : '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
function secondaryBtn(): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    cursor: 'pointer',
  };
}
function closeBtn(): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    fontSize: 14,
    cursor: 'pointer',
  };
}
function hintBox(tone: 'info' | 'danger'): React.CSSProperties {
  const colors = tone === 'info'
    ? { bg: 'var(--color-bg-info)', fg: 'var(--color-text-info)' }
    : { bg: 'var(--color-bg-danger)', fg: 'var(--color-text-danger)' };
  return {
    padding: 10,
    borderRadius: 'var(--radius-sm)',
    background: colors.bg,
    color: colors.fg,
    fontSize: 11,
    lineHeight: 1.5,
  };
}
