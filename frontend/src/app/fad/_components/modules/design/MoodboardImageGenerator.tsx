'use client';

// Moodboard image generator — small modal that prompts Nanobanana
// (Gemini 2.5 Flash Image) via the backend /api/design/ai_images
// endpoints, previews the result, and on confirm appends it to the
// moodboard's links array via PATCH /api/design/moodboards/:id.
//
// design-be-7-smart-prompt: added the "Auto-prompt from project"
// button that hits POST /generate-from-project with override_prompt
// null. The backend gathers the full project context (preferences /
// site-visit / property metadata / inspiration captions), runs Kimi
// to synthesise the prompt, and returns it. The user reviews / tweaks
// the textarea, then clicks Generate which ALSO routes through
// /generate-from-project (with override_prompt = textarea value) so
// the inline reference photos still flow into the model — even after
// a manual tweak.
//
// State machine: idle → generating → preview → saving → done|error.
// First-call latency is ~9s for a fresh prompt; cache hits return
// instantly. Auto-prompt synthesis is a separate ~1-3s phase.

import { useState } from 'react';
import { apiFetch } from '../../../../../components/types';

interface Props {
  projectId: string;
  moodboardId: string;
  existingLinks: Array<{ url: string; caption?: string; image_id?: string }>;
  onSaved: () => void;
  onClose: () => void;
}

type Phase = 'idle' | 'synthesizing' | 'generating' | 'preview' | 'saving' | 'error';
type PromptSource = 'kimi' | 'override' | 'template-fallback' | null;

interface GeneratedAsset {
  sha256: string;
  storage_url: string;
  mime_type: string;
  byte_size: number;
  generator_prompt: string;
  duration_ms: number;
  stub: boolean;
  cached?: boolean;
  // generate-from-project additions
  used_prompt?: string;
  used_image_count?: number;
  prompt_source?: PromptSource;
  prompt_style_notes?: string[];
  suggested_aspect_ratio?: string | null;
}

export function MoodboardImageGenerator({ projectId, moodboardId, existingLinks, onSaved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [prompt, setPrompt] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);

  // design-be-7 state: track whether the prompt was auto-built so the
  // subsequent Generate routes through /generate-from-project (which
  // includes reference photos) rather than the plain /generate.
  const [autoPromptUsed, setAutoPromptUsed] = useState(false);
  const [promptSource, setPromptSource] = useState<PromptSource>(null);
  const [referencePhotoCount, setReferencePhotoCount] = useState<number | null>(null);
  const [autoHint, setAutoHint] = useState<string | null>(null);

  // ── auto-prompt ──
  // Calls /generate-from-project with no override and no kind-gen
  // request — we ONLY want the prompt synthesis side-effect here.
  // Pre-fills the textarea on return; the user reviews + clicks
  // Generate to actually render the image.
  //
  // Implementation note: the current backend route always renders an
  // image as part of the call (there's no "prompt-only" mode). To
  // avoid burning a Nanobanana call on the preview step, we accept
  // the asset that comes back and stage it as the preview directly —
  // it's free of charge for the user since they're going to call
  // Generate next anyway. If they tweak the prompt and re-Generate,
  // a fresh image renders with the new text.
  async function autoPrompt() {
    setPhase('synthesizing');
    setError(null);
    try {
      const result = await apiFetch('/api/design/ai_images/generate-from-project', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          kind: 'moodboard',
          include_property_photos: true,
        }),
      }) as GeneratedAsset;
      if (result.used_prompt) setPrompt(result.used_prompt);
      setPromptSource(result.prompt_source || null);
      setReferencePhotoCount(typeof result.used_image_count === 'number' ? result.used_image_count : null);
      setAutoPromptUsed(true);
      setAsset(result);
      const noteParts: string[] = [];
      if (result.prompt_source === 'kimi') noteParts.push('Auto-built via Kimi');
      else if (result.prompt_source === 'template-fallback') noteParts.push('Auto-built (template fallback)');
      if (typeof result.used_image_count === 'number') {
        noteParts.push(`${result.used_image_count} reference photo${result.used_image_count === 1 ? '' : 's'}`);
      }
      setAutoHint(noteParts.join(' · '));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  // ── generate (standard) ──
  // If the user has auto-prompted we route through generate-from-project
  // so the inline reference photos still feed the model with their
  // (possibly edited) prompt as override. Otherwise we use the legacy
  // /generate path — same as before design-be-7.
  async function generate() {
    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }
    setPhase('generating');
    setError(null);
    try {
      let result: GeneratedAsset;
      if (autoPromptUsed) {
        result = await apiFetch('/api/design/ai_images/generate-from-project', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            kind: 'moodboard',
            override_prompt: prompt.trim(),
            include_property_photos: true,
          }),
        }) as GeneratedAsset;
        setPromptSource(result.prompt_source || null);
        setReferencePhotoCount(typeof result.used_image_count === 'number' ? result.used_image_count : null);
      } else {
        result = await apiFetch('/api/design/ai_images/generate', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            prompt: prompt.trim(),
            kind: 'moodboard',
          }),
        }) as GeneratedAsset;
      }
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

  const synthesizing = phase === 'synthesizing';
  const generating = phase === 'generating';
  const saving = phase === 'saving';
  const busy = synthesizing || generating || saving;

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
              Powered by Nanobanana (Gemini 2.5 Flash Image). Describe the scene, or auto-build a prompt from this project's context. First call takes ~9s, repeats are cached.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn()}>✕</button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelText()}>Prompt</span>
            <button
              type="button"
              onClick={autoPrompt}
              disabled={busy}
              style={autoPromptBtn(busy)}
              title="Synthesize a Nanobanana prompt from this project's preferences, property metadata, site-visit notes, and existing inspiration"
            >
              {synthesizing ? 'Synthesizing…' : '✨ Auto-prompt from project'}
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Mauritian coastal villa living room, rattan armchairs, linen sofa in oat colour, terrazzo floor, large bifold doors opening onto a lagoon, late afternoon golden light, photorealistic interior design moodboard"
            rows={4}
            disabled={busy}
            style={textareaStyle()}
          />
          {autoHint && (
            <div style={chipRow()}>
              <span style={chip('info')}>{autoHint}</span>
              {autoPromptUsed && typeof referencePhotoCount === 'number' && referencePhotoCount > 0 && (
                <span style={chip('subtle')}>
                  🖼 {referencePhotoCount} reference photo{referencePhotoCount === 1 ? '' : 's'} will be sent
                </span>
              )}
              {autoPromptUsed && referencePhotoCount === 0 && (
                <span style={chip('warn')}>No property photos available — text-only generation</span>
              )}
              {promptSource === 'template-fallback' && (
                <span style={chip('warn')}>Kimi unavailable — using template fallback. You may want to tweak the prompt.</span>
              )}
            </div>
          )}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText()}>Caption (optional)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Living + dining"
            disabled={busy}
            style={inputStyle()}
          />
        </label>

        {synthesizing && (
          <div style={hintBox('info')}>
            Synthesizing prompt from project context… typically 1-3 seconds.
          </div>
        )}
        {generating && (
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
              disabled={busy || !prompt.trim()}
              style={primaryBtn(busy || !prompt.trim())}
            >
              {generating ? 'Generating…' : phase === 'error' ? 'Try again' : 'Generate'}
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
function autoPromptBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-background-secondary)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    fontSize: 11,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
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
function chipRow(): React.CSSProperties {
  return {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  };
}
function chip(tone: 'info' | 'subtle' | 'warn'): React.CSSProperties {
  const palette = tone === 'info'
    ? { bg: 'var(--color-bg-info)', fg: 'var(--color-text-info)' }
    : tone === 'warn'
      ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' }
      : { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-secondary)' };
  return {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    background: palette.bg,
    color: palette.fg,
    fontSize: 10,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };
}
