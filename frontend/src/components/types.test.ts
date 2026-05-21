import { describe, expect, it } from 'vitest';
import { formatConfidencePercent, resolveApiBase } from './types';

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

describe('resolveApiBase', () => {
  it('uses same-origin API routes if a local API base leaks into a production host', () => {
    expect(resolveApiBase('http://localhost:3001', 'admin.friday.mu')).toBe('');
    expect(resolveApiBase('http://127.0.0.1:3001', 'gms.friday.mu')).toBe('');
  });

  it('keeps local API bases on local hosts and external API bases everywhere', () => {
    expect(resolveApiBase('http://localhost:3001', '127.0.0.1')).toBe('http://localhost:3001');
    expect(resolveApiBase('https://admin.friday.mu', 'gms.friday.mu')).toBe('https://admin.friday.mu');
  });
});
