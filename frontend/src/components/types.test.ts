import { describe, expect, it } from 'vitest';
import { formatConfidencePercent } from './types';

describe('formatConfidencePercent', () => {
  it('normalizes ratio, percentage, and legacy basis-point confidence values', () => {
    expect(formatConfidencePercent(0.72)).toBe(72);
    expect(formatConfidencePercent(72)).toBe(72);
    expect(formatConfidencePercent(7000)).toBe(70);
    expect(formatConfidencePercent('8500')).toBe(85);
  });

  it('clamps invalid or out-of-range values', () => {
    expect(formatConfidencePercent(null)).toBeNull();
    expect(formatConfidencePercent('nope')).toBeNull();
    expect(formatConfidencePercent(-20)).toBe(0);
    expect(formatConfidencePercent(12000)).toBe(100);
  });
});
