'use client';

import { useState, type ReactNode } from 'react';
import { IconSparkle } from '../icons';

// ───────────────── AIBadge ─────────────────

export function AIBadge({ size = 'sm', prefix }: { size?: 'sm' | 'md'; prefix?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: size === 'sm' ? 9 : 10,
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        background: 'var(--color-brand-accent-soft)',
        color: 'var(--color-brand-accent)',
        borderRadius: 4,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      <IconSparkle size={size === 'sm' ? 8 : 10} />
      {prefix && <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 2 }}>{prefix}</span>}
      AI
    </span>
  );
}

// ───────────────── AIConfidenceChip ─────────────────

export function AIConfidenceChip({ percent }: { percent: number }) {
  const tone =
    percent >= 80
      ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' }
      : percent >= 50
        ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' }
        : { bg: 'var(--color-bg-danger)', fg: 'var(--color-text-danger)' };
  return (
    <span
      style={{
        fontSize: 9,
        padding: '2px 6px',
        background: tone.bg,
        color: tone.fg,
        borderRadius: 4,
        fontWeight: 500,
        fontFamily: 'var(--font-mono-fad, monospace)',
      }}
      title={`AI confidence ${percent}%`}
    >
      {percent}%
    </span>
  );
}

// ───────────────── AIRegenerateButton ─────────────────

export function AIRegenerateButton({
  onClick,
  size = 'sm',
}: {
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      onClick={onClick}
      title="Regenerate suggestion"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: '0.5px solid var(--color-border-tertiary)',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? 10 : 11,
        borderRadius: 4,
        cursor: 'pointer',
        color: 'var(--color-brand-accent)',
      }}
    >
      ↻ Regenerate
    </button>
  );
}

// ───────────────── AISuggestionCard ─────────────────
//
// Wrapper used to give every AI suggestion a consistent visual treatment
// (purple ramp, badge, optional confidence, expandable reasoning).

export function AISuggestionCard({
  title,
  reasoning,
  confidence,
  children,
  onRegenerate,
}: {
  title: string;
  reasoning?: string;
  confidence?: number;
  children?: ReactNode;
  onRegenerate?: () => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--color-brand-accent-softer)',
        borderLeft: '3px solid var(--color-brand-accent)',
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <AIBadge />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{title}</span>
        <span style={{ flex: 1 }} />
        {confidence !== undefined && <AIConfidenceChip percent={Math.round(confidence * 100)} />}
        {onRegenerate && <AIRegenerateButton onClick={onRegenerate} />}
      </div>
      {reasoning && (
        <div>
          <button
            onClick={() => setReasoningOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              fontSize: 11,
              color: 'var(--color-brand-accent)',
              cursor: 'pointer',
              marginBottom: 4,
            }}
          >
            {reasoningOpen ? '▾ Hide reasoning' : '▸ Why this suggestion?'}
          </button>
          {reasoningOpen && (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {reasoning}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
