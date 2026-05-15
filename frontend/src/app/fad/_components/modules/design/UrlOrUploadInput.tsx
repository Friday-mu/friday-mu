'use client';

// Drop-in replacement for every "paste a URL" input in the design
// module. Renders a tabbed mode picker (🔗 URL / 📁 Upload) and a
// shared value: the URL string. On upload, POSTs to
// /api/design/uploads/:project_id/:kind, sets value to the returned
// URL, and the parent treats it identically to a pasted URL.
//
// Surfaces using this:
//   • DocRequest        (kind="document" — PDFs + images allowed)
//   • Preferences       (kind="image")
//   • Moodboard         (kind="image")
//   • Selection options (kind="image")
//   • DesignPack PDF    (kind="document")
//   • Site Visit video  (kind="video")
//
// Auth: uses the gms_token from localStorage like the rest of the
// FAD frontend. The POST is multipart/form-data — Content-Type is
// set by the browser to include the boundary, so we must not
// override it.

import { useRef, useState } from 'react';

export type UploadKind = 'image' | 'document' | 'video' | 'design_file';

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  projectId: string;
  uploadKind: UploadKind;
  /** HTML accept attribute for the file picker. */
  accept?: string;
  /** Placeholder for the URL input. */
  urlPlaceholder?: string;
  /** Show inline image preview when value looks like an image URL. */
  showPreview?: boolean;
  disabled?: boolean;
  /** Optional id suffix for data-testid wiring. */
  testIdSuffix?: string;
}

// `accept` attribute on the file picker. Wildcard for image keeps the
// list short while letting the server (upload-policy.js) enforce the
// real allowlist. Documents enumerate extensions so the OS picker
// surfaces Office, OpenDocument, and archive formats. Design files
// list extensions only — MIME is unreliable for PSD/AI/INDD/SKETCH/
// FIG/XD across browsers.
const DEFAULT_ACCEPT: Record<UploadKind, string> = {
  image: 'image/*',
  document:
    'application/pdf,' +
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
    'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
    'application/msword,application/vnd.ms-powerpoint,application/vnd.ms-excel,' +
    'application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,' +
    'application/rtf,text/plain,text/markdown,text/csv,' +
    'application/zip,' +
    '.docx,.doc,.pptx,.ppt,.xlsx,.xls,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.tsv,.zip,' +
    'image/*',
  video: 'video/mp4,video/quicktime,video/webm',
  design_file: '.psd,.ai,.indd,.sketch,.fig,.xd',
};

const KIND_LIMIT_TEXT: Record<UploadKind, string> = {
  image: 'JPG/PNG/HEIC/WEBP/AVIF/TIFF/GIF/raw, max 50MB',
  document: 'PDF/DOCX/PPTX/XLSX/ODT/RTF/TXT/MD/CSV/ZIP, max 25MB',
  video: 'MP4/MOV/WEBM, max 50MB',
  design_file: 'PSD/AI/INDD/SKETCH/FIG/XD, max 500MB',
};

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('gms_token');
}

async function uploadFile(
  projectId: string,
  kind: UploadKind,
  file: File,
): Promise<{ url: string; size: number; mime: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Intentionally NO Content-Type — the browser sets multipart/form-data
  // with the correct boundary when given a FormData body.
  const res = await fetch(`/api/design/uploads/${encodeURIComponent(projectId)}/${kind}`, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
  }
  return res.json();
}

function looksLikeImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(jpe?g|png|webp|gif|heic|heif)(\?|$)/i.test(url);
}

export function UrlOrUploadInput({
  value,
  onChange,
  projectId,
  uploadKind,
  accept,
  urlPlaceholder,
  showPreview = true,
  disabled = false,
  testIdSuffix,
}: Props) {
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFile(projectId, uploadKind, file);
      onChange(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }} role="tablist">
        {(['url', 'upload'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            disabled={disabled || uploading}
            data-testid={testIdSuffix ? `uoi-tab-${m}-${testIdSuffix}` : undefined}
            style={{
              flex: '0 0 auto',
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: mode === m ? 500 : 400,
              borderRadius: 'var(--radius-sm)',
              background: mode === m ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
              color: mode === m ? '#fff' : 'var(--color-text-secondary)',
              border: '0.5px solid ' + (mode === m ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'),
              cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {m === 'url' ? '🔗 Paste URL' : '📁 Upload from device'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <input
          type="url"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={urlPlaceholder ?? 'https://…'}
          disabled={disabled || uploading}
          data-testid={testIdSuffix ? `uoi-url-${testIdSuffix}` : undefined}
          style={{
            padding: '6px 10px',
            fontSize: 12,
            borderRadius: 'var(--radius-sm)',
            border: '0.5px solid var(--color-border-secondary)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
          }}
        />
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={accept ?? DEFAULT_ACCEPT[uploadKind]}
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            data-testid={testIdSuffix ? `uoi-file-${testIdSuffix}` : undefined}
            style={{
              padding: 4,
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              width: '100%',
            }}
          />
          <div style={{ marginTop: 2, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {uploading ? 'Uploading…' : KIND_LIMIT_TEXT[uploadKind]}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 11, color: 'var(--color-text-danger)' }}>
          {error}
        </div>
      )}

      {showPreview && value && looksLikeImage(value) && (
        <div style={{ marginTop: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="preview"
            style={{ maxHeight: 100, maxWidth: '100%', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-tertiary)' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      {showPreview && value && !looksLikeImage(value) && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11, color: 'var(--color-text-info)', wordBreak: 'break-all' }}
        >
          {value}
        </a>
      )}
    </div>
  );
}
