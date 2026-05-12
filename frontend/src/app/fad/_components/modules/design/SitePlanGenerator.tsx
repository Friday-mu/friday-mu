'use client';

// Site plan generator — modal that takes the client's messy floor plan
// (PDF / sketch photo / WhatsApp screenshot) and asks Nanobanana to
// redraw it as a clean top-view CAD-style layout. The cleaned image is
// pinned as the project's canonical site plan
// (design_projects.site_plan_image_id) via the
// /api/design/ai_images/generate-site-plan endpoint.
//
// State machine: idle → reading-file → generating → preview → saving →
// done|error. Branches early on file-size violations so the user sees a
// local-side rejection without a round-trip.
//
// Drag-and-drop + click-to-pick on the dropzone. We deliberately don't
// render a thumbnail of PDF uploads (the browser can't preview them inline
// without pdf.js); for raster types we show the uploaded image as a
// before/after companion to the generated clean plan.

import { useRef, useState } from 'react';
import { generateSitePlan } from '../../../_data/designClient';
import type { SitePlanGenerationResult } from '../../../_data/designClient';

interface Props {
  projectId: string;
  onSaved: (result: SitePlanGenerationResult) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'reading' | 'generating' | 'preview' | 'saving' | 'error';

interface SourceFile {
  mimeType: string;
  base64: string;
  // Data URL for previewing the uploaded image (only for raster types;
  // null for PDFs because browsers can't render them in a plain <img>).
  previewDataUrl: string | null;
  filename: string;
  byteSize: number;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const ACCEPT_LIST = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX_RAW_BYTES = 5 * 1024 * 1024;

export function SitePlanGenerator({ projectId, onSaved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [source, setSource] = useState<SourceFile | null>(null);
  const [promptHint, setPromptHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SitePlanGenerationResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function readFile(file: File) {
    if (!ACCEPT_LIST.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Accepted: PNG / JPEG / WebP / PDF.`);
      setPhase('error');
      return;
    }
    if (file.size > MAX_RAW_BYTES) {
      setError(`File too large (${Math.round(file.size / 1024)} KB, max ${MAX_RAW_BYTES / 1024} KB).`);
      setPhase('error');
      return;
    }
    setPhase('reading');
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      // dataUrl is `data:<mime>;base64,<b64>` — strip the prefix to get
      // the raw base64 the backend wants.
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      setSource({
        mimeType: file.type,
        base64,
        previewDataUrl: file.type === 'application/pdf' ? null : dataUrl,
        filename: file.name,
        byteSize: file.size,
      });
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  async function generate() {
    if (!source) {
      setError('Upload a floor plan first.');
      setPhase('error');
      return;
    }
    setPhase('generating');
    setError(null);
    try {
      const res = await generateSitePlan({
        project_id: projectId,
        source_image: { mimeType: source.mimeType, base64: source.base64 },
        prompt_hint: promptHint.trim() || undefined,
        set_as_project_plan: true,
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
    // The backend already pinned the asset on the project (we sent
    // set_as_project_plan: true). All we need to do is tell the parent
    // and close — the parent refetches the project so the new ID lands.
    setPhase('saving');
    onSaved(result);
  }

  return (
    <div
      data-ai-feature="site-plan-generator"
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
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Generate clean site plan</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Upload the client&apos;s floor plan (PDF, sketch, photo). Nanobanana redraws it as a clean top-view
              layout we can use as the base for design packs.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn()} aria-label="Close">✕</button>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) readFile(file);
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: 24,
            borderRadius: 'var(--radius-sm)',
            border: `1px dashed ${dragOver ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'}`,
            background: dragOver ? 'var(--color-background-tertiary)' : 'transparent',
            cursor: phase === 'generating' || phase === 'saving' ? 'not-allowed' : 'pointer',
            opacity: phase === 'generating' || phase === 'saving' ? 0.6 : 1,
            textAlign: 'center',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
            disabled={phase === 'generating' || phase === 'saving'}
            style={{ display: 'none' }}
          />
          {source ? (
            <div style={{ fontSize: 12 }}>
              <strong>{source.filename}</strong> · {Math.round(source.byteSize / 1024)} KB · {source.mimeType}
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Click or drop another file to replace
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <strong>Click to choose</strong> or drag & drop
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                PNG · JPEG · WebP · PDF, max 5 MB
              </div>
            </>
          )}
        </label>

        {/* Before / after preview */}
        {(source?.previewDataUrl || result?.storage_url) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {source?.previewDataUrl && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Original
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source.previewDataUrl}
                  alt="Client floor plan upload"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}
                />
              </div>
            )}
            {result?.storage_url && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Cleaned plan
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.storage_url}
                  alt="Generated clean site plan"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}
                />
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{result.mime_type ?? 'image/png'}</span>
                  {typeof result.byte_size === 'number' && <span>{Math.round(result.byte_size / 1024)} KB</span>}
                  {typeof result.duration_ms === 'number' && <span>{result.duration_ms}ms{result.cached ? ' (cached)' : ''}</span>}
                  {result.stub && <span style={{ color: 'var(--color-text-warning)' }}>stub — set NANOBANANA_API_KEY</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt hint */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText()}>Prompt hint (optional)</span>
          <textarea
            value={promptHint}
            onChange={(e) => setPromptHint(e.target.value)}
            placeholder="Add notes about specific rooms to label, north direction, scale…"
            rows={3}
            disabled={phase === 'generating' || phase === 'saving'}
            style={textareaStyle()}
          />
        </label>

        {phase === 'generating' && (
          <div style={hintBox('info')}>
            Generating clean plan… Nanobanana usually takes about 9 seconds. Don&apos;t close this window.
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
              disabled={!source || phase === 'generating' || phase === 'reading' || phase === 'saving'}
              style={primaryBtn(!source || phase === 'generating' || phase === 'reading' || phase === 'saving')}
            >
              {phase === 'generating' ? 'Generating…' : phase === 'reading' ? 'Reading file…' : phase === 'error' ? 'Try again' : 'Generate clean plan'}
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              style={primaryBtn(false)}
            >
              Save as project site plan
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
