'use client';

// Moodboard image generator — small modal that prompts Nanobanana
// (Gemini 2.5 Flash Image) via the backend /api/design/ai_images/generate
// endpoint, previews the result, and on confirm appends it to the
// moodboard's links array via PATCH /api/design/moodboards/:id.
//
// State machine: idle → generating → preview → saving → done|error.
// First-call latency is ~9 seconds for a fresh prompt; cache hits
// return instantly. We log a tasteful loading indicator either way.

import { useState } from 'react';
import { apiFetch } from '../../../../../components/types';

interface Props {
  projectId: string;
  moodboardId: string;
  existingLinks: Array<{ url: string; caption?: string; image_id?: string }>;
  onSaved: () => void;
  onClose: () => void;
}

type Phase = 'idle' | 'generating' | 'preview' | 'saving' | 'error';

interface GeneratedAsset {
  sha256: string;
  storage_url: string;
  mime_type: string;
  byte_size: number;
  generator_prompt: string;
  duration_ms: number;
  stub: boolean;
  cached?: boolean;
}

export function MoodboardImageGenerator({ projectId, moodboardId, existingLinks, onSaved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [prompt, setPrompt] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);

  async function generate() {
    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }
    setPhase('generating');
    setError(null);
    try {
      const result = await apiFetch('/api/design/ai_images/generate', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          prompt: prompt.trim(),
          kind: 'moodboard',
        }),
      }) as GeneratedAsset;
      setAsset(result);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  async function save() {
    if (!asset) return;
    setPhase('saving');
    setError(null);
    try {
      const nextLinks = [
        ...existingLinks,
        {
          url: asset.storage_url,
          caption: caption.trim() || prompt.trim().slice(0, 80),
          image_id: asset.sha256,
        },
      ];
      await apiFetch(`/api/design/moodboards/${moodboardId}`, {
        method: 'PATCH',
        body: JSON.stringify({ links: nextLinks }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  return (
    <div
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
          width: 'min(620px, 100%)',
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
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>✨ Generate moodboard image</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Powered by Nanobanana (Gemini 2.5 Flash Image). Describe the scene; first call takes ~9s, repeats are cached.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn()}>✕</button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText()}>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Mauritian coastal villa living room, rattan armchairs, linen sofa in oat colour, terrazzo floor, large bifold doors opening onto a lagoon, late afternoon golden light, photorealistic interior design moodboard"
            rows={4}
            disabled={phase === 'generating' || phase === 'saving'}
            style={textareaStyle()}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText()}>Caption (optional)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Living + dining"
            disabled={phase === 'generating' || phase === 'saving'}
            style={inputStyle()}
          />
        </label>

        {phase === 'generating' && (
          <div style={hintBox('info')}>
            Generating image… first call takes about 9 seconds. Don't close this window.
          </div>
        )}

        {phase === 'preview' && asset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.storage_url} alt={asset.generator_prompt} style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{asset.mime_type}</span>
              <span>{Math.round(asset.byte_size / 1024)} KB</span>
              <span>{asset.duration_ms}ms{asset.cached ? ' (cached)' : ''}</span>
              {asset.stub && <span style={{ color: 'var(--color-text-warning)' }}>⚠ stub — set NANOBANANA_API_KEY for real generation</span>}
            </div>
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
          {phase !== 'preview' && (
            <button
              type="button"
              onClick={generate}
              disabled={phase === 'generating' || phase === 'saving' || !prompt.trim()}
              style={primaryBtn(phase === 'generating' || phase === 'saving' || !prompt.trim())}
            >
              {phase === 'generating' ? 'Generating…' : phase === 'error' ? 'Try again' : 'Generate'}
            </button>
          )}
          {phase === 'preview' && (
            <button
              type="button"
              onClick={save}
              disabled={phase !== 'preview'}
              style={primaryBtn(false)}
            >
              Add to moodboard
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
function inputStyle(): React.CSSProperties {
  return {
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    border: '0.5px solid var(--color-border-tertiary)',
    fontSize: 12,
    color: 'var(--color-text-primary)',
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
