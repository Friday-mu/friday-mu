'use client';

import type { ReactNode } from 'react';

/**
 * Disabled v0.1 placeholder for the 11 AI integration points. Each instance
 * carries `data-ai-feature="<name>"` so v0.2 wire-up can target by selector
 * (per build doc §5.2). Tooltip says "Coming in v0.2".
 *
 * @demo:ui — Replace with active button + handler when v0.2 AI features land.
 * Tag: PROD-DESIGN-AI.
 */
export type AIFeature =
  | 'site-visit-audit'
  | 'preference-brief'
  | 'rough-budget-estimate'
  | 'agreement-autofill'
  | 'moodboard-narrative'
  | 'design-pack-copy'
  | 'final-budget-suggest'
  | 'receipt-scan'
  | 'reconciliation-variance'
  | 'owner-update'
  | 'handover-report';

interface Props {
  feature: AIFeature;
  label: string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}

export function AIPlaceholder({ feature, label, icon, size = 'md' }: Props) {
  return (
    <button
      type="button"
      disabled
      data-ai-feature={feature}
      title="Coming in v0.2"
      aria-label={`${label} — coming in v0.2`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '4px 8px' : '6px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--color-brand-accent)',
        background: 'var(--color-brand-accent-softer)',
        color: 'var(--color-brand-accent)',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        cursor: 'not-allowed',
        opacity: 0.85,
      }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{label}</span>
      <span
        style={{
          marginLeft: 4,
          padding: '1px 6px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-brand-accent)',
          color: '#fff',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.4,
        }}
      >
        v0.2
      </span>
    </button>
  );
}
