import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageTracker } from './StageTracker';
import { STAGES } from '../../../_data/design';

describe('StageTracker', () => {
  it('renders all 18 design stages, in order', () => {
    render(<StageTracker currentStage="site-visit" status="in-progress" />);
    expect(STAGES).toHaveLength(18);
    // Each stage has a `data-stage-id="<id>"` attribute via the role=listitem
    // node — assert one element per stage id is present.
    const items = document.querySelectorAll('[data-stage-id]');
    expect(items.length).toBe(STAGES.length);
    const renderedOrder = Array.from(items).map((n) => n.getAttribute('data-stage-id'));
    expect(renderedOrder).toEqual(STAGES.map((s) => s.id));
  });

  it('marks the current stage with aria-current=step', () => {
    render(<StageTracker currentStage="payment-gate" status="in-progress" />);
    const current = document.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    expect(current?.getAttribute('data-stage-id')).toBe('payment-gate');
  });

  it('puts optional stages on a dashed-border style for tier-aware rendering', () => {
    render(
      <StageTracker
        currentStage="site-visit"
        status="in-progress"
        optionalStageIds={['doc-request', 'moodboard']}
      />,
    );
    const optional = document.querySelectorAll('[data-stage-optional="true"]');
    expect(optional.length).toBe(2);
  });
});
