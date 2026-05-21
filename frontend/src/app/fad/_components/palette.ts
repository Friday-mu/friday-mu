// Palette helpers — map semantic state to FAD design tokens.
// Always prefer these over hardcoded hex stops. Tokens auto-flip in dark mode
// and stay consistent across the app. Pattern matches existing chip.tier-*
// + chip.info/warn classes in fad.css.

export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export interface Swatch {
  background: string;
  color: string;
}

const TOKEN_MAP: Record<SemanticTone, Swatch> = {
  neutral: {
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-secondary)',
  },
  info: {
    background: 'var(--color-bg-info)',
    color: 'var(--color-text-info)',
  },
  success: {
    background: 'var(--color-bg-success)',
    color: 'var(--color-text-success)',
  },
  warning: {
    background: 'var(--color-bg-warning)',
    color: 'var(--color-text-warning)',
  },
  danger: {
    background: 'var(--color-bg-danger)',
    color: 'var(--color-text-danger)',
  },
  accent: {
    background: 'var(--color-brand-accent-soft)',
    color: 'var(--color-brand-accent)',
  },
};

export function toneStyle(tone: SemanticTone): Swatch {
  return TOKEN_MAP[tone];
}

// ───────────────── Domain → tone mapping ─────────────────

export function taskStatusTone(status: string): SemanticTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'paused':
    case 'blocked':
    case 'reported':
      return 'warning';
    case 'closed':
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'scheduled':
    case 'ready':
    default:
      return 'neutral';
  }
}

export function priorityTone(priority: string): SemanticTone {
  switch (priority) {
    case 'urgent':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    case 'lowest':
    default:
      return 'neutral';
  }
}

export function scopeTone(scope: string): SemanticTone {
  switch (scope) {
    case 'all':
      return 'success';
    case 'team':
      return 'info';
    case 'self':
      return 'warning';
    case 'none':
    default:
      return 'danger';
  }
}

export function timeOffStatusTone(status: string): SemanticTone {
  switch (status) {
    case 'approved':
      return 'success';
    case 'declined':
      return 'danger';
    case 'pending':
    default:
      return 'warning';
  }
}

export function staffStatusTone(status: string): SemanticTone {
  switch (status) {
    case 'departed':
      return 'danger';
    case 'departing':
      return 'warning';
    case 'active':
    default:
      return 'success';
  }
}

export function approvalStatusTone(status: string): SemanticTone {
  switch (status) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'countered':
      return 'info';
    case 'pending':
    default:
      return 'warning';
  }
}

export function taskSourceTone(source: string): SemanticTone {
  switch (source) {
    case 'inbox_ai':
    case 'group_email':
    case 'friday':
      return 'accent';
    case 'recurring':
    case 'reservation_trigger':
    case 'guesty':
      return 'info';
    case 'reported_issue':
      return 'warning';
    case 'personal':
    case 'syndic':
      return 'accent';
    case 'manual':
    case 'breezeway':
    default:
      return 'neutral';
  }
}

// ───────────────── Confidence / risk badges ─────────────────

export function confidenceTone(percent: number): SemanticTone {
  if (percent >= 80) return 'success';
  if (percent >= 50) return 'warning';
  return 'danger';
}

// ───────────────── Border accents (3px solid …) ─────────────────
// For banner/quote-style left borders (alerts, brief panels, etc.)

export function toneBorder(tone: SemanticTone): string {
  switch (tone) {
    case 'info':
      return 'var(--color-text-info)';
    case 'success':
      return 'var(--color-text-success)';
    case 'warning':
      return 'var(--color-text-warning)';
    case 'danger':
      return 'var(--color-text-danger)';
    case 'accent':
      return 'var(--color-brand-accent)';
    case 'neutral':
    default:
      return 'var(--color-border-secondary)';
  }
}
